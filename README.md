# AtlasTrackIt — Prep Command Center

A single dashboard to track study progress, goals, habits, and mock tests for any exam, certification, or learning journey. Runs entirely client-side — no backend required.

## Project structure

```
index.html        Entry point (shell markup, loads css/ and js/)
css/styles.css     All styling
js/app.js          All application logic
assets/            Static assets (currently empty — icons/images use inline SVG/emoji)
README.md          This file
```

Data is stored locally in the browser (`localStorage`, or the host app's storage API when embedded in one) — nothing is sent to a server.

## Running it

Just open `index.html` in a browser, or serve the folder with any static file server. It uses [Chart.js](https://www.chartjs.org/) via CDN for the analytics charts and Google Fonts for typography, so an internet connection is needed for those (the app itself still works offline).

## Changelog

### This update
- **Fixed: Today's Progress ring resetting when the Pomodoro timer was paused.** The ring, "Today's Goal" value, and "Study Session" total now always reflect total study time completed today, whether the timer is running, paused, or the page has been refreshed/reopened.
- **Fixed: stale data carrying over into a new calendar day.** AtlasTrackIt now detects when the date changes — whether the app was closed and reopened on a new day, or left open across midnight — and automatically starts a fresh daily session. Only daily counters reset (today's progress, study time, questions, revision checklist); Total Study Hours, Streak, Subjects, Topics, Goals, Mock Tests, and History are never touched.
- **Added: Study History.** Each completed day's stats (Goal Completion %, Study Time, Questions Solved, Revisions Completed) are now automatically saved. The Dashboard shows a "📅 Study History" card with yesterday's summary and a "View History" button that opens the full saved history.

### Atlas AI (UI only — no backend yet)
- **Added: new "🤖 Atlas AI" section** in the sidebar navigation, styled to match the rest of AtlasTrackIt.
- Personalized greeting ("Good Morning/Afternoon/Evening, <name>") based on the saved profile name and current local time, falling back to a plain "Hello 👋" if no name is set yet.
- A welcome card introducing Atlas as a personal AI study coach, plus 8 clickable suggestion chips that drop their text into the message box (they don't generate any response).
- A chat window with an empty state explaining the AI backend isn't connected yet, an auto-expanding multiline input, Enter to send / Shift+Enter for a new line, and a send button. Sending a message currently just echoes back "AI backend is not connected yet." — no AI service of any kind is called.
- A "Atlas Will Soon Help You With" info card listing upcoming capabilities (daily planning, progress analysis, weak topic detection, etc.).
- This is UI/frontend scaffolding only: no AI API is connected, nothing is faked, and no existing feature or logic was changed.
