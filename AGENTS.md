# Project Instructions

## Project

This is a browser-based MIS course prototype for coordinating one traveller's Hangzhou trip and simulated travel bookings. It uses Ctrip's web experience as a visual reference; it is not an official Ctrip product and does not connect to Ctrip or supplier systems.

The main demo is a cross-order trip change: review a trip, inspect affected transport/hotel/ticket items, compare options, explicitly confirm, and view simulated processing results. Product data, prices, availability, booking rules, and outcomes are mock data.

## Read First

- `README.md` for setup and available commands.
- `CONTEXT.md` for domain terms and business boundaries.
- `docs/adr/` before changing architecture, model responsibilities, data handling, or AI integration.
- `../项目设计与开发说明.md` for the course project scope and the relationship between the prototype and the proposed system design.

For course-report tasks, consult `../实验要求.pdf` and `../汇总.docx` as needed. Treat current source code and this repository's docs as authoritative for implemented behavior; older handoff notes and archived drafts may be stale.

## Product and Data Boundaries

- Keep planned itinerary items distinct from confirmed bookings. Adding an item to a plan must not imply that it is booked.
- Treat existing bookings as facts. Surface possible conflicts for the user to review; do not silently alter or cancel bookings.
- Require explicit user confirmation before any simulated processing. Clearly label simulated prices, status, and outcomes.
- Do not add real booking, payment, refund, or supplier integrations unless explicitly requested.
- DeepSeek is not currently integrated. If adding it, keep credentials on the backend and follow the ADRs. Deterministic application rules own objective date/overlap checks; the model may help interpret requests and explain results, but must not invent products, prices, availability, or booking truth.
- Do not persist full chat transcripts. Keep demo user data separate from platform product data and collect only what the current feature needs.
- User-provided images may contain sensitive identity/contact data. Follow the privacy behavior defined in `CONTEXT.md`; do not log raw sensitive content.

## Codebase Map

- `frontend/src/App.vue`: application shell, navigation, trip view, demo change flow, local demo data and state.
- `frontend/src/components/ProductChannel.vue`: simulated product-channel search, filters, details, favorites, and adding unbooked plan items.
- `frontend/src/style.css`, `frontend/src/channel.css`: application and channel styling.
- `backend/server.js`: Node HTTP server, SQLite demo state, API routes, and static-file serving.
- `data/`: local SQLite demo database; do not commit generated or user-specific data.

Product catalog samples and channel configuration currently live in `frontend/src/App.vue`; favorites and planned items use browser `localStorage`. The backend currently persists only the demo confirmation/processing state. Do not describe these as a full order or itinerary database.

## Working Rules

- Inspect the relevant component, API, and existing styles before editing; prefer local patterns and keep changes scoped.
- Preserve unrelated user changes. Check `git status` before edits and do not reset or overwrite existing work.
- Keep the app usable as a normal browser website and maintain the current Ctrip-inspired visual language.
- After frontend changes, check desktop and narrow mobile layouts (including 390 px), navigation, browser back/forward where relevant, and the affected interactions.
- Do not claim features, tests, external research, or production readiness that were not actually verified.

## Run and Verify

Run commands from this directory:

```powershell
npm run dev
npm run build
```

The dev server serves the Vite frontend at `http://localhost:5173/` and the backend API on port `3000`. There is no configured automated test script; use a production build plus focused browser interaction checks for changes.
