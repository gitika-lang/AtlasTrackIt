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

const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Hard caps to keep requests small, fast and cheap — the frontend already
// trims what it sends (see buildAtlasContext in js/app.js), this is a
// server-side backstop in case that ever changes.
const MAX_MESSAGE_LENGTH = 4000;
const MAX_HISTORY_TURNS = 12;
const MAX_CONTEXT_JSON_LENGTH = 6000;

const SYSTEM_PROMPT = `You are Atlas.
You are the built-in AI Study Coach inside AtlasTrackIt.
You are NOT a generic chatbot.
You understand the student's study journey.
You always use the student's actual progress before answering.
Never ignore available study data.
Never invent information.
If data is missing, clearly say that it is unavailable.

Your responsibilities include:
- Creating study plans
- Daily planning
- Weekly planning
- Revision planning
- Topic prioritisation
- Weakness detection
- Performance analysis
- Study motivation
- Explaining difficult concepts
- Helping solve academic questions
- Identifying inconsistencies
- Tracking improvement
- Helping students stay consistent

Your personality should be:
- Friendly
- Intelligent
- Calm
- Supportive
- Slightly playful
- Occasionally funny
- Encouraging
- Professional

Do not constantly praise the student.
Do not use generic motivational quotes.
Do not sound robotic.
Base every recommendation on the student's actual data, which is provided to
you as a JSON object alongside each message under "Student data relevant to
this question".
If the student has been procrastinating, mention it politely.
If the student has improved, acknowledge the improvement using actual statistics.
If the student is close to completing today's target, encourage them to finish.
Speak naturally like a real personal study coach. Use markdown (headings,
bullet/numbered lists, tables, bold, italics, code blocks) where it genuinely
helps readability — not on every reply.`;

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
          maxOutputTokens: 1024,
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
