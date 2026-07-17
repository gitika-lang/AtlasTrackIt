# AtlasTrackIt — Prep Command Center

A dashboard to track study progress, goals, habits, and mock tests for any exam, certification, or learning journey — now with **Atlas AI**, a built-in AI study coach powered by Gemini.

## Project structure

```
index.html               Entry point (shell markup, loads css/ and js/)
css/styles.css            All styling
js/app.js                 All application logic (including Atlas AI's frontend)
assets/                   Static assets (currently empty — icons/images use inline SVG/emoji)
netlify/functions/atlas.js  Serverless function — the ONLY place the Gemini API key is used
netlify.toml              Netlify build/routing config (maps /api/atlas to the function)
package.json               Node engine declaration for the Netlify Function
.env.example               Template for the local GEMINI_API_KEY env var
README.md                  This file
```

All study data (subjects, sessions, goals, mocks, etc.) is stored locally in the browser (`localStorage`, or the host app's storage API when embedded in one) — nothing about your study data is sent anywhere except the specific, relevant slice sent to Atlas AI when you chat with it.

## Running it

### App only (no Atlas AI responses)
Open `index.html` in a browser, or serve the folder with any static file server. Everything except live Atlas AI replies works exactly as before, fully offline once the fonts/Chart.js/marked CDN assets are cached.

### With Atlas AI (Gemini-powered)
Atlas AI needs a backend to call Gemini without exposing your API key, so it requires deploying with Netlify:

1. **Get a Gemini API key** at https://aistudio.google.com/apikey.
2. **Push this project to a Git repo** (GitHub/GitLab/Bitbucket) and connect it as a new site on [Netlify](https://app.netlify.com), or deploy with the [Netlify CLI](https://docs.netlify.com/cli/get-started/) (`netlify deploy`).
3. **Set the environment variable** in Netlify: Site settings → Environment variables → add `GEMINI_API_KEY` with your key. Never put the key in any frontend file, `localStorage`, or commit it to Git.
4. Netlify auto-detects `netlify/functions/atlas.js` and deploys it; `netlify.toml` routes the frontend's `/api/atlas` calls to it.
5. **Local development:** copy `.env.example` to `.env`, fill in your key, and run `netlify dev` (Netlify CLI) so `/api/atlas` resolves to the function locally too.

The standalone preview HTML file is a single-file bundle of `index.html` + `css/styles.css` + `js/app.js`, useful for quickly eyeballing the UI — but since it has no backend attached, Atlas AI's chat calls will fail with the "Atlas is taking a short break" message unless that file is also served behind the same `/api/atlas` route (e.g. dropped into a Netlify site alongside `netlify/functions/atlas.js` and `netlify.toml`).

## How Atlas AI works

- **Frontend** (`js/app.js`): when you send a message, it looks at what you asked and pulls together just the relevant slice of your data (e.g. "What should I study today?" → today's targets, pending/weak topics, due revisions, recent sessions — not your entire six-month history). That message + context + a short window of recent chat turns (for same-session memory) is POSTed to `/api/atlas`. The reply is rendered as sanitized Markdown (headings, lists, tables, bold/italics, code blocks).
- **Backend** (`netlify/functions/atlas.js`): a Netlify Function that reads `GEMINI_API_KEY` from its environment (never from the request), attaches Atlas's system instruction, forwards the conversation + context to Gemini, and returns just the reply text. If Gemini errors out or the key is missing, it returns a friendly error message instead of crashing.
- **Chat memory** lasts for the current browser session only (it's an in-memory array, not saved to `localStorage`/`window.storage`) — refreshing the page starts a new conversation.

## Changelog

### Atlas AI — Phase 2 (Gemini backend)
- **Added: real AI responses.** Atlas AI now calls Gemini through a secured Netlify Function (`netlify/functions/atlas.js`) at `/api/atlas` — the API key never reaches the browser.
- **Added: automatic context building.** Atlas figures out what a message is about (today's plan, a specific subject, weekly/monthly performance, mocks, revision, motivation, etc.) and sends only that slice of your data — never the whole database — keeping responses fast, cheap, and grounded in your actual progress.
- **Added: chat memory for the session.** Follow-up questions ("what should I revise next?" after asking about Geometry) stay in context without you re-explaining.
- **Added: Markdown rendering** for Atlas's replies (headings, bullet/numbered lists, tables, bold/italics, code blocks), sanitized before display.
- **Added: loading indicator** (animated typing dots) while waiting on a reply, and a friendly fallback message ("Atlas is taking a short break right now...") if Gemini is unavailable or misconfigured — the app never crashes because of a chat failure.
- The Atlas AI UI itself (layout, greeting, suggestion chips, future-features card) is unchanged from Phase 1.

### Atlas AI — Phase 1 (UI only)
- **Added: new "🤖 Atlas AI" section** in the sidebar navigation, styled to match the rest of AtlasTrackIt.
- Personalized greeting ("Good Morning/Afternoon/Evening, <name>") based on the saved profile name and current local time, falling back to a plain "Hello 👋" if no name is set yet.
- A welcome card introducing Atlas as a personal AI study coach, plus 8 clickable suggestion chips that drop their text into the message box.
- A chat window with an auto-expanding multiline input, Enter to send / Shift+Enter for a new line, and a send button.
- A "Atlas Will Soon Help You With" info card listing upcoming capabilities.

### Earlier fixes
- **Fixed: Today's Progress ring resetting when the Pomodoro timer was paused.** The ring, "Today's Goal" value, and "Study Session" total now always reflect total study time completed today, whether the timer is running, paused, or the page has been refreshed/reopened.
- **Fixed: stale data carrying over into a new calendar day.** AtlasTrackIt now detects when the date changes — whether the app was closed and reopened on a new day, or left open across midnight — and automatically starts a fresh daily session. Only daily counters reset (today's progress, study time, questions, revision checklist); Total Study Hours, Streak, Subjects, Topics, Goals, Mock Tests, and History are never touched.
- **Added: Study History.** Each completed day's stats (Goal Completion %, Study Time, Questions Solved, Revisions Completed) are now automatically saved. The Dashboard shows a "📅 Study History" card with yesterday's summary and a "View History" button that opens the full saved history.
