# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev     # frontend (port 3001) + Express API (port 3000) concurrently
npm start        # frontend only, port 3001 (cross-env PORT=3001 react-scripts start)
npm run api      # Express API only (server/index.js), port from API_PORT/PORT env or 4000
npm run build    # production build of the frontend
npm test         # react-scripts test (Jest + React Testing Library, watch mode)
```

Run a single test file: `npm test -- src/services/ninosService.test.js` (CRA/Jest watch-mode filtering).

There is no lint script; ESLint runs as part of `react-scripts` (`eslintConfig` in [package.json](package.json) extends `react-app`).

Copy [.env.example](.env.example) to `.env` before running locally — the app needs `REACT_APP_SUPABASE_URL` / `REACT_APP_SUPABASE_ANON_KEY` (frontend) and, for the legacy API, `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` or Cloudinary credentials.

## Architecture: two coexisting data paths

This repo is mid-migration from a "Día del Trabajador" (worker's day) event app to a "Día del Niño" (children's day) app. Two largely independent data paths currently exist side by side — know which one you're touching:

1. **Legacy path — `server/index.js`** (Express API, also deployed as a Netlify Function via [netlify/functions/api.js](netlify/functions/api.js), which wraps the same `app` with `serverless-http`). Exposes `/api/asistencias` (CRUD) and `/api/admin/login`. Storage is dual-mode and auto-selected at boot: if real `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are present it reads/writes a Supabase table called `asistencias`; otherwise it falls back to storing the whole DB as a single JSON blob in Cloudinary (`raw` resource, public ID `CLOUDINARY_DB_PUBLIC_ID`). Domain shape here is event attendees with `numeroSorteo` (raffle number) and `estadoAsistencia` (presente/ausente/pendiente) — this is the *worker's day raffle/attendance* model.
2. **Current path — `src/services/ninosService.js`** talks to Supabase directly from the browser via [src/supabaseClient.js](src/supabaseClient.js), reading/writing a table literally named `diadelnino` (note: **not** `ninos`, despite the SQL migrations below creating `ninos`/`barrios` — the migrations and the actual queried table have diverged; don't assume the migrations describe the live schema without checking Supabase directly). Domain shape here is children (`nombre`, `apellido`, `dni`, `edad`, `sexo`, `barrio_id`, `nombre_tutor`) for the Día del Niño event. All CRUD, CSV import, and validation for the current admin UI go through this file.

[Administracion.jsx](src/Administracion.jsx) — the admin panel — exclusively uses path 2 (`ninosService`), even though many of its internal variable/prop names (`asistencias`, `estadoAsistencia`, `numeroSorteo`) are holdovers from path 1's domain model. The raffle ("Sorteo") feature in that component draws from the *current* `ninosService` records using ad-hoc client-side numbering (`obtenerNumeroSorteo`), not from the legacy API's sorteo numbers.

There used to be a public self-registration screen (`TarjetaEvento`, mounted at `/evento`) that let anyone confirm attendance for the old "Día del Trabajador" event. It has been removed (deleted along with its route) — the app's only public screen now is the landing page, whose "Ingresar" button goes straight into the admin login flow. The legacy `server/index.js` API and Netlify function still exist and still speak the old worker's-day/`asistencias` model; they are not reachable from any current UI.

**Login is not wired to the backend at all.** [Login.jsx](src/Login.jsx) does a hardcoded client-side string comparison (`FloridaLuisiana` / `comuna2026*`) and never calls `/api/admin/login`. Admin state is just a `localStorage` flag (`adminLogueado`) read/set in [App.js](src/App.js) — treat this as an access gate for hiding the UI, not real authentication.

When adding or changing admin/data features, extend `ninosService.js` + the `diadelnino` table (path 2) unless the task explicitly concerns the legacy attendance API, Cloudinary storage, or Netlify function deploy.

## Routing

No router library — [App.js](src/App.js) switches screens by hand-parsing `window.location.pathname` and using `window.history.pushState`, listening to `popstate`:

- `/` → `PantallaInicio` (landing; its "Ingresar" button calls `irAAdministracion`, pushing straight into the admin route)
- any path starting with `/panel_diadelnino` (`RUTA_ADMIN` constant) → `Administracion` (gated by `Login` unless `adminLogueado` is set)

[Administracion.jsx](src/Administracion.jsx) does the same pattern internally for its own sub-sections (`/panel_diadelnino/personal`, `/reportes`, `/sorteo`), via `obtenerSeccionDesdeRuta`/`obtenerRutaDeSeccion` and its own local `RUTA_ADMIN` constant (kept in sync manually with `App.js`'s — there's no shared config). Note the `/reportes` URL maps to the internal section key `'asistencia'` — the key wasn't renamed when the URL was, so grep for `'asistencia'` (not `'reportes'`) if tracing that section's state/JSX. The admin path is obscured, not access-controlled server-side — don't treat it as a security boundary.

## Supabase

- `supabase/migrations/` contains raw SQL (run manually against the project, no Supabase CLI wiring in this repo) — see the note above about the `ninos`/`diadelnino` table name mismatch before relying on them.
- DNI values are normalized to digits-only (`normalizarDni`, duplicated in `ninosService.js`, `supabaseClient.js`, and `server/index.js`) and are expected to be unique per child/attendee.
- `.agents/skills/supabase-server/SKILL.md` describes the `@supabase/server` package (Edge Functions auth helper) — **not used anywhere in this repo**, which calls `@supabase/supabase-js` directly instead. Ignore that skill's guidance unless you're introducing Supabase Edge Functions.

## PDF/CSV features

`Administracion.jsx` also generates PDFs client-side with `jspdf`/`jspdf-autotable` (listings, attendance, and stats reports) and supports bulk-loading children via CSV upload with client-side parsing/validation/preview (`parsearCsv`, `normalizarFilaNinoDesdeCsv`, `validarNinoFormulario` in `ninosService.js`) before confirming inserts one-by-one through `guardarNino`.

## Deploy

- Frontend: Netlify (`netlify.toml`, `npm run build` → `build/`).
- Legacy API: Render, via a `render.yaml` blueprint described in [README.md](README.md) (not present in the repo root at present — check before assuming it exists).
