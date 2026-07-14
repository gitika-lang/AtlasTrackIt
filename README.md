# Mission CGL — Prep Command Center

A single-page SSC CGL preparation dashboard: syllabus tracker, daily study
log, goals, habits, mock tests, PYQ tracker, error log, analytics, a
revision calendar, exam readiness score, and a floating study timer.

## Project structure

```
mission-cgl/
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
system fonts and the two chart canvases won't render.

## Data & storage

All your data (sessions, subjects, goals, habits, mocks, etc.) is stored
as a single JSON blob under the key `ssc_cgl_state_v1`.

- Inside Claude.ai's artifact viewer, it uses Claude's built-in
  `window.storage` API.
- Opened standalone in a regular browser (as this export is meant to be
  used), it automatically falls back to the browser's `localStorage` —
  so your data persists per-browser, on the device you're using it from.

`localStorage` is per-browser and per-origin: it won't sync across
devices, and clearing your browser's site data will erase it. Use the
**Export → Download JSON backup** button (Extras tab) periodically to
keep a portable backup, and to move your data to a different browser or
device (open the app there, then re-import by editing the same
`ssc_cgl_state_v1` structure — there's no import UI yet, so the backup
is manual-restore for now).

## Editing

Everything is vanilla HTML/CSS/JS — no framework, no build tools, no
`node_modules`. Open `js/app.js` and search for the section header
comments (`/* ===== ... ===== */`) to find the relevant tab's code.
