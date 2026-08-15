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

### Latest update
- **Fixed: Upcoming Deadlines** now only shows incomplete goals due within the next 24 hours (previously it showed every non-completed goal regardless of date). Items still disappear automatically once marked Completed.
- **Added: Timer → Subject/Topic progress.** The Study Session (Pomodoro) card now has Subject and Topic selectors. When a session is actually started, the selected topic is marked "In Progress" in the Subjects/Syllabus section — but only if it was "Not Started"; Completed/Revised/In Progress topics are left untouched. Works the same whether the session is later paused or completes normally.
- **Simplified: Weekly Report.** The Weekly Review section (Goals → Reviews) now leads with 5 scannable summary stats (Total Study Hours, Study Days, Questions Solved, Revisions Completed, Weekly Goal Completion) followed by grouped detail cards (Subject Focus, Consistency & Recommendation). All existing calculations are unchanged — only the presentation was reorganized. Today's Summary, Monthly Review, and the Analytics page (charts, heatmap, pace meter, etc.) are untouched.

### Previous update
- **Fixed: Today's Progress ring resetting when the Pomodoro timer was paused.** The ring, "Today's Goal" value, and "Study Session" total now always reflect total study time completed today, whether the timer is running, paused, or the page has been refreshed/reopened.
- **Fixed: stale data carrying over into a new calendar day.** AtlasTrackIt now detects when the date changes — whether the app was closed and reopened on a new day, or left open across midnight — and automatically starts a fresh daily session. Only daily counters reset (today's progress, study time, questions, revision checklist); Total Study Hours, Streak, Subjects, Topics, Goals, Mock Tests, and History are never touched.
- **Added: Study History.** Each completed day's stats (Goal Completion %, Study Time, Questions Solved, Revisions Completed) are now automatically saved. The Dashboard shows a "📅 Study History" card with yesterday's summary and a "View History" button that opens the full saved history.
