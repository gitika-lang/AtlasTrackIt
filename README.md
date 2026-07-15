# AtlasTrackIt — Prep Command Center

A single-page exam/course prep dashboard: study tracker, goals, habits, mock
tests, error log, revision calendar, exam readiness score, and a floating
study timer — all in one clean, focused workspace. Built to work for any
exam, certification, course, or learning journey, not just one syllabus.

## Navigation

The app is organized into five sections:

- **🏠 Dashboard** — your daily home screen. Today's target, today's
  progress, today's task checklist, questions solved today, due revisions,
  and a quick progress summary. Answers one question: "what should I do
  today?"
- **📚 Study** — Subjects & syllabus, Study Log, Revision calendar, Notes
  & Formulas (quick notes, formula book, vocabulary), and Analytics
  (study pace, subject/weekly charts, heatmap).
- **🎯 Goals** — Goals, Habit tracker, Reviews (daily/weekly/monthly
  reflections + smart recommendations), and Achievements, plus an exam
  readiness score and an upcoming-deadlines view.
- **🧪 Mocks** — Mock test log & trend charts, PYQ tracker, and the
  mistake/error log.
- **⚙ Settings** — theme, accent color, default daily hours, question and
  mock-score targets, Pomodoro durations, backup/export, import/restore,
  reset data, and the app version.

A floating study timer stays visible in the corner throughout the app.

## Project structure

```
atlastrackit/
├── index.html        # markup + tab shell
├── css/
│   └── styles.css     # all styling (light + dark theme via CSS variables)
├── js/
│   └── app.js          # all application logic, state, and rendering
├── assets/             # reserved for any icons/images you add later
└── README.md
```

## Running it

No build step or server required — just open `index.html` in a modern
browser (Chrome, Edge, Firefox, Safari).

Two external resources load over the network at runtime:
- Google Fonts (Space Grotesk, Inter, JetBrains Mono)
- Chart.js (for the mock-test and analytics charts), from cdnjs

If you're offline, the app still works — those two just fall back to
system fonts and the chart canvases won't render.

## Data & storage

All your data (sessions, subjects, goals, habits, mocks, etc.) is stored
as a single JSON blob under the key `ssc_cgl_state_v1`. This key name is
kept from the original project on purpose — renaming it would have
disconnected the app from any data you already saved, so your existing
progress keeps loading exactly as before.

- Inside Claude.ai's artifact viewer, it uses Claude's built-in
  `window.storage` API.
- Opened standalone in a regular browser (as this export is meant to be
  used), it automatically falls back to the browser's `localStorage` —
  so your data persists per-browser, on the device you're using it from.

`localStorage` is per-browser and per-origin: it won't sync across
devices, and clearing your browser's site data will erase it. Use
**Settings → Backup → Download JSON backup** periodically to keep a
portable copy, and **Settings → Backup → Import / Restore** to load a
backup back in (on the same browser or a different one).

## Accent color

Settings → Appearance lets you switch between four premium pink/maroon
accent presets (Maroon, Rose, Berry, Crimson). Your choice is saved and
applies everywhere the old blue accent used to appear.

## Editing

Everything is vanilla HTML/CSS/JS — no framework, no build tools, no
`node_modules`. Open `js/app.js` and search for the section header
comments (`/* ===== ... ===== */`) to find the relevant page's code.
