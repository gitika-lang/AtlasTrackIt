// netlify/functions/atlas.js
//
// Server-side proxy between AtlasTrackIt's "Atlas AI" chat and the Gemini API.
//
// The frontend never talks to Gemini directly — it only ever calls /api/atlas
// (redirected to this function, see netlify.toml). The Gemini API key lives
// exclusively in this function's environment as GEMINI_API_KEY (set it in the
// Netlify dashboard under Site settings > Environment variables, or in a local
// .env file that is never committed — see .env.example). It is read here with
// process.env.GEMINI_API_KEY and is never sent to, or readable by, the browser.

const GEMINI_MODEL = "gemini-3.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Hard caps to keep requests small, fast and cheap — the frontend already
// trims what it sends (see buildAtlasContext in js/app.js), this is a
// server-side backstop in case that ever changes.
const MAX_MESSAGE_LENGTH = 4000;
const MAX_HISTORY_TURNS = 12;
const MAX_CONTEXT_JSON_LENGTH = 6000;

const SYSTEM_PROMPT = `You are Atlas — the premium, built-in AI Study Coach inside AtlasTrackIt.
You are NOT a generic chatbot, and you never sound like one.
You understand the student's study journey and always ground your answers in
their actual progress, which is provided to you as a JSON object alongside
each message under "Student data relevant to this question".
Never ignore available study data. Never invent information. If something
relevant is missing from the data you were given, say plainly that it isn't
available yet rather than guessing.

YOUR RESPONSIBILITIES
- Creating study plans (daily, weekly, revision)
- Topic prioritisation and weakness detection
- Performance and mock-test analysis
- Explaining difficult concepts and helping solve academic questions
- Identifying inconsistencies and tracking improvement
- Helping the student stay consistent and study smarter, not just harder

YOUR VOICE
Friendly, intelligent, calm, supportive, and professional — like a sharp
personal coach who respects the student's time. A little warmth and light,
natural humor is welcome when it fits; never forced. Do not constantly
praise the student, and do not use generic motivational quotes or clichés
("Believe in yourself!", "You've got this!") — if you want to encourage
someone, do it by pointing at something specific and real in their data
instead. Never sound robotic or templated, and don't recycle the same
opening line turn after turn — vary how you greet and lead in, the way a
real coach who knows the student would.

RESPONSE STRUCTURE
Every reply should read as one coherent message from a coach who already
knows this student — not as a rigid form. Within that natural flow, make
sure you cover:
1. A brief, personalized opener — use their name naturally if you have it,
   and let it reflect the moment (their streak, today's status, what they
   just asked) rather than a stock greeting. Keep it to a line, not a
   paragraph, and don't repeat the same phrasing you've used earlier in
   this conversation.
2. A clear, direct answer to what they actually asked — lead with it, don't
   bury it.
3. The reasoning behind that answer, tied explicitly to their real numbers
   (progress %, streak, weak topics, revision due dates, mock scores,
   trends) — this is what makes the advice trustworthy instead of generic.
4. Concrete, actionable next steps — specific topics, time blocks, or
   actions the student can act on immediately, not vague advice like
   "study more" or "stay consistent."
Close with forward momentum: a next step, a specific check-in point, or a
short relevant question — never cut off mid-thought or end on a flat
statement with nowhere to go.

STUDY PLANS
When asked for a study plan (daily, weekly, or revision), give a properly
detailed plan, not one or two paragraphs. Structure it with markdown —
headings or bold labels per day/session, bullet or numbered lists for
topics and tasks, and approximate time allocations per block. Base the
plan on their actual pending/weak topics, revision queue, and available
study hours from the data provided; explain briefly why it's sequenced
that way. A plan that could apply to any student is not acceptable — it
must clearly be built from their data.

If the student has been procrastinating or inconsistent, mention it
honestly but constructively — as a coach flagging a pattern, not scolding.
If they've improved, acknowledge it using the actual statistics that show
it. If they're close to finishing today's target, point that out and push
them to close it out.

Use markdown (headings, bullet/numbered lists, tables, bold, italics, code
blocks) wherever it genuinely improves readability — most naturally for
study plans, comparisons, and multi-step breakdowns — but don't force
structure onto a short conversational answer that doesn't need it.`;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return respond(405, { error: 'Method not allowed.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('Atlas function: GEMINI_API_KEY is not set.');
    return respond(500, { error: 'Atlas is not configured yet. Please try again later.' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return respond(400, { error: 'Invalid request.' });
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const context = body.context && typeof body.context === 'object' && !Array.isArray(body.context) ? body.context : {};
  const history = Array.isArray(body.history) ? body.history : [];

  if (!message) return respond(400, { error: 'A message is required.' });
  if (message.length > MAX_MESSAGE_LENGTH) return respond(400, { error: 'That message is too long.' });

  try {
    const contents = buildGeminiContents(message, context, history);

    const geminiRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { role: 'system', parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        generationConfig: {
          temperature: 0.7,
          // Structured coaching replies (greeting + answer + reasoning + next
          // steps, and especially full study plans) routinely run well past
          // 1024 tokens. That cap was silently truncating Gemini's own output
          // (finishReason: MAX_TOKENS) before it ever reached extractReply().
          // Raised to give real headroom for a detailed plan/response.
          maxOutputTokens: 4096,
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
        ],
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text().catch(() => '');
      console.error('Atlas function: Gemini API error', geminiRes.status, errText);
      return respond(502, { error: 'Atlas is taking a short break right now. Please try again in a moment.' });
    }

    const data = await geminiRes.json();
    // Diagnostic logging: candidate count, finishReason, and part count let us
    // confirm in Netlify function logs whether a reply came back complete
    // (finishReason "STOP") or was cut short (e.g. "MAX_TOKENS", "SAFETY").
    logGeminiResponseShape(data);
    const reply = extractReply(data);
    if (!reply) {
      console.error('Atlas function: no usable reply in Gemini response', JSON.stringify(data).slice(0, 500));
      return respond(502, { error: 'Atlas is taking a short break right now. Please try again in a moment.' });
    }

    return respond(200, { reply });
  } catch (err) {
    console.error('Atlas function: unexpected error', err);
    return respond(500, { error: 'Atlas is taking a short break right now. Please try again in a moment.' });
  }
};

// Turns {message, context, history} into Gemini's `contents` array: prior
// turns first (capped, for same-session chat memory), then the current turn
// with the intelligently-selected study-data context attached.
function buildGeminiContents(message, context, history) {
  const contents = [];

  history.slice(-MAX_HISTORY_TURNS).forEach((turn) => {
    if (!turn || typeof turn.text !== 'string' || !turn.text.trim()) return;
    contents.push({
      role: turn.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: turn.text.slice(0, MAX_MESSAGE_LENGTH) }],
    });
  });

  const contextJson = safeJsonStringify(context, MAX_CONTEXT_JSON_LENGTH);
  const currentTurnText = contextJson && contextJson !== '{}'
    ? `Student data relevant to this question (JSON):\n${contextJson}\n\nStudent's message: ${message}`
    : `Student's message: ${message}`;

  contents.push({ role: 'user', parts: [{ text: currentTurnText }] });
  return contents;
}

// extractReply already joined every part of the first candidate (it was
// never reading only parts[0]) — the missing piece was surfacing *why* a
// reply looked short, which this logs before extraction runs.
function logGeminiResponseShape(data) {
  try {
    const candidate = data && data.candidates && data.candidates[0];
    const finishReason = candidate && candidate.finishReason;
    const partCount = candidate && candidate.content && candidate.content.parts ? candidate.content.parts.length : 0;
    console.log('Atlas function: Gemini response shape', {
      candidateCount: data && data.candidates ? data.candidates.length : 0,
      finishReason,
      partCount,
      promptFeedback: data && data.promptFeedback ? data.promptFeedback : undefined,
    });
    if (finishReason === 'MAX_TOKENS') {
      console.warn('Atlas function: reply was truncated by maxOutputTokens — consider raising it further for this kind of request.');
    } else if (finishReason && finishReason !== 'STOP') {
      console.warn('Atlas function: reply ended for a non-standard reason:', finishReason);
    }
  } catch (e) {
    console.error('Atlas function: failed to log Gemini response shape', e);
  }
}

function extractReply(data) {
  try {
    const candidate = data && data.candidates && data.candidates[0];
    const parts = candidate && candidate.content && candidate.content.parts;
    if (!parts || !parts.length) return null;
    const text = parts.map((p) => p.text || '').join('').trim();
    return text || null;
  } catch (e) {
    return null;
  }
}

function safeJsonStringify(obj, maxLength) {
  try {
    const json = JSON.stringify(obj);
    return json.length > maxLength ? json.slice(0, maxLength) : json;
  } catch (e) {
    return '{}';
  }
}

function respond(statusCode, bodyObj) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyObj),
  };
}
