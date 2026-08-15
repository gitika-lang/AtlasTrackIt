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

### Latest update — visual/UI polish pass
- **New "Aurora Study Desk" theme**: dark-first, colourful palette (violet/pink/blue/green) with slow-drifting blurred aurora glow in the background, a hand-drawn squiggle underline motif on section headers, refined shadows/gradients/spacing across cards, buttons, pills, badges, and the sidebar.
- **New accent presets**: Settings → the 4 accent swatches are now Violet (default), Pink, Blue, Green — replacing the old maroon/rose/berry/crimson set. Chart colors, the heatmap, and default subject colors were refreshed to match.
- **Subtle motion**: cards/sections fade+rise in on load with a light stagger, buttons/cards lift on hover, progress bars grow in, achievement badges pop when unlocked, checkboxes give a tactile pop on click. Everything settles once loaded — nothing loops or distracts while actively studying (the Pomodoro tick still only touches the timer display, not the whole page). All motion respects `prefers-reduced-motion`.
- No data structures, calculations, timer/Pomodoro logic, revision/goals logic, or analytics/weekly-report calculations were changed — this was a CSS/presentation-layer pass plus a handful of cosmetic color-literal updates in `js/app.js` (chart colors, default palette, accent preset keys).

### Previous update
- **Fixed: Upcoming Deadlines** now only shows incomplete goals due within the next 24 hours. Items disappear automatically once marked Completed.
- **Added: Timer → Subject/Topic progress.** Starting a Pomodoro session on a selected topic marks it "In Progress" (never downgrading Completed/Revised/In Progress topics).
- **Simplified: Weekly Report** — reorganized into 5 headline stats plus grouped detail cards; all calculations unchanged.

### Earlier update
- **Fixed: Today's Progress ring resetting when the Pomodoro timer was paused.** Now always reflects total study time completed today.
- **Fixed: stale data carrying over into a new calendar day.** Automatic daily rollover with Study History snapshots saved for every completed day.
- **Added: Study History** card + full history view.
