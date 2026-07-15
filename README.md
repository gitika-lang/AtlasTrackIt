# AtlasTrackIt — Prep Command Center

A single-page exam/course prep dashboard: study tracker, goals, habits, mock
tests, error log, revision calendar, exam readiness score, and a floating
study timer — all in one clean, focused workspace. Built to work for any
exam, certification, course, or learning journey.

## Navigation

- **🏠 Dashboard** — daily home screen: Today's Goal (editable target),
  Questions Solved Today (quick-edit), a live Study Session timer,
  Today's Progress ring (animates in real time), Today's Tasks, Due
  Revisions (checkbox-style completion + a button to add your own freeform
  revision reminders), and a Quick Progress Summary.
- **📚 Study** — Subjects (drag to reorder, add/edit/delete custom
  subjects with your own name/icon/color), Study Log, Revision calendar,
  Notes & Formulas, and Analytics.
- **🎯 Goals** — Goals, Habits, Reviews, Achievements, plus an Exam
  Readiness score and an Upcoming Deadlines view.
- **🧪 Mocks** — Mock Tests, PYQ Tracker, Error Log.
- **⚙ Settings** — theme, accent color, daily/question/mock targets,
  Pomodoro presets, backup/export, import/restore, reset data.

On narrow screens the sidebar becomes a slide-out menu (☰ button).

## This update (usability pass)

- **Data persistence** reviewed end to end — every mutation (subjects,
  topics, goals, targets, timer, question counts, revisions, notes, mocks,
  errors, analytics inputs, theme, settings, custom subjects/topics) is
  autosaved to LocalStorage on every change; nothing resets on refresh,
  reopen, or tab switching.
- **Questions Solved Today** now has an ✏️ Edit button — set today's total
  directly from the Dashboard.
- **Due Revisions** now has checkbox-style "Mark Revised" completion, plus
  a **+ Add Revision** button to log freeform revision reminders (topic,
  optional subject, due date, optional revision number) not tied to a
  syllabus topic.
- **Today's Progress** ring now animates smoothly as it updates in real
  time, and always reflects today's target (including per-day overrides).
- **Date pickers** (Target Date, Completion Date, and other date fields)
  now accept any date from **1 January 2026** onward — past, today, or
  future — instead of blocking anything before today.

## Project structure

```
atlastrackit/
├── index.html
├── css/
│   └── styles.css
├── js/
│   └── app.js
├── assets/
└── README.md
```

## Running it

Open `index.html` in a modern browser — no build step or server required.
Google Fonts and Chart.js load from CDN at runtime; the app still works
offline, just with system fonts and no charts.

## Data & storage

All data is stored as a single JSON blob under the LocalStorage key
`ssc_cgl_state_v1` (kept from the original project name on purpose, so
existing saved data keeps loading). Use **Settings → Backup** to export a
JSON backup periodically, and to import one back in.
