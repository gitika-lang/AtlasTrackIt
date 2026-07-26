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

### History / Archive (completed activities & revisions)
- **Fixed: completed custom revisions were being deleted, not archived.** Checking off a custom revision reminder used to permanently remove it with no record. It's now archived first (with its completion date and exact time) before being cleared from the active due-list.
- **Added: a per-revision archive log.** Every completed revision — whether a syllabus topic revision or a custom reminder — now leaves a permanent, timestamped entry, instead of only the topic's single "last revised" date being kept (which silently overwrote earlier revision dates).
- **Added: a new "History" section** under Study, listing every completed daily task and every completed revision, grouped by the date they were completed, each with its original completion time. Nothing is deleted to make room for this — completed items are simply also kept and made visible.
- Completed daily tasks now record the exact time they were checked off, shown in the new History view.
- No existing feature, page, or button was changed or removed — this is purely additive.

### Schedule Revision (plan future revisions + reminders)
- **Added: "📅 Schedule Revision"** under Study → Revision. Pick a Subject (or "Other / not tracked"), a Topic (dropdown of that subject's tracked topics, or a free-text field for anything else), a revision date, an optional time, and an optional note.
- **Added: "Today's Scheduled Revisions"** — a prominent card on the Dashboard that appears whenever a scheduled revision's date has arrived (including anything overdue), with Done / Skip / Reschedule actions right there.
- **Added: browser reminder notifications.** If the existing "Browser Notification" setting is enabled, a scheduled revision fires a one-time system notification the moment it's due (by date, or by the exact date+time if you set one) — same permission model as the Pomodoro timer's notifications, including the same browser limitations (only fires while the tab is inactive; blocked permissions can't be re-prompted by the page).
- **Added: full status tracking.** Each scheduled revision moves through Scheduled → Completed / Skipped, and can be Rescheduled (new date/time, clears any prior reminder) — all visible and manageable from a new "Scheduled Revisions" list on the Revision page, alongside the existing auto-generated Today/Tomorrow/Next 7 Days queue (unchanged).
- **Completed scheduled revisions automatically flow into Revision History and Analytics** — the same way as marking a syllabus topic revised: if the scheduled revision was linked to a tracked topic, that topic's revision count/date updates too, so it's counted in the daily Analytics rollup; either way, it's logged with its date and completion time to the History / Archive section added previously.
- This is entirely additive: the existing auto-generated revision queue, the quick "+ Add Revision" freeform reminder on the Dashboard, and all other pages/buttons are unchanged.

### Workflow fixes & sync (notifications, History summary, Today's Revisions, Add Revision)
- **Fixed: browser notifications silently never firing.** The bug was `Notification.requestPermission()` being called from a background timer when a session ended — browsers require a real user click to show that prompt, so if permission was ever left at "not yet decided," it could never be granted that way, and the setting looked "on" while doing nothing. Fixed by only notifying once permission is actually granted, and adding a real, clickable "Enable" button in Settings whenever notifications are turned on but permission was never actually confirmed by the browser.
- **Added: "Today's Completion" summary** in the History section — completed vs. outstanding today (e.g. "3/5 completed"), a percentage, and a progress bar.
- **Fixed: scheduled revisions missing from "Today's Revisions."** The Dashboard's Due Revisions card and the Revision page's Today/Tomorrow/Next 7 Days groups only ever looked at the syllabus queue and freeform reminders — never at Scheduled Revisions. Both now include scheduled revisions that are due, so nothing shows "Nothing due" while a scheduled revision is waiting.
- **Improved: Add Revision** now has a Subject dropdown and a Topic dropdown filtered to that subject, instead of freeform-only text — with a "type manually" option still available for anything not in the list. The same improved topic picker was also applied to Schedule Revision, so a custom topic can now be entered even when a real subject is selected.
- **Confirmed: completing a scheduled revision from the Dashboard already syncs everywhere** — the linked topic's revision count/date updates, it's logged to Revision History, and Analytics/Study reflect it immediately since they read live from the same data. No separate manual logging is ever needed.
- No existing feature, page, or button was removed — these are fixes and additive improvements to the workflow already in place.

### Add Revision — optional Sub Topic
- **Added: an optional "Sub Topic" field** to the Dashboard's "+ Add Revision" modal — a simple, manually-typed text field (e.g. "Time & Work — Pipes & Cisterns") for narrowing down a topic without it needing to exist as a tracked subtopic.
- Shown alongside the reminder in the Due Revisions list when set, and folded into the entry's name when archived into Revision History on completion.
- Fully optional — leaving it blank behaves exactly as before.
