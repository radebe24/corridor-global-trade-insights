# Corridor — Port the existing app and ship a working MVP

## What exists today (from the GitHub repo)

Corridor is already a substantial, working product — but as a static site with no build step and no backend:

- `index.html` (634 lines) — full single-page UI: home/marketing view, project workspace, sidebar with projects, settings panel.
- `app.js` (5,245 lines) — the whole application: projects, chat threads, memories, document uploads, results, assessments, trade model.
- Domain modules: `tariffs.js` (HTS lookup, rate resolution, duty computation, origin comparison, MPF/preference programs), `datasets.js` (dataset registry, SPI codes, country programs, trade actions, assessment modules and bands), `lanes.js` (ports, routes, chokepoints, lane exposure), `mcs.js` (USGS mineral commodity summaries search), `watch.js` (watch items, staleness, feed), `assessments.js` (module prompts, scoring, decision bands), `map.js` (SVG world map with lane arcs and chokepoints).
- `data/` — real datasets: `tariffs-2026.json` (4 MB), `mcs2026.json` (2.4 MB), plus indexes, `world.json`, `chokepoints.json`, `africa-gis-layers.json`.
- `tools/` — Python build scripts that generate those datasets from public sources.
- `styles.css` (5,274 lines) — a complete, distinctive design system (Instrument Serif / Inter Tight / JetBrains Mono, globe canvas, coordinate readouts).

Two structural problems block it from being the "premier global trade insights platform":

1. **The Anthropic API key is entered by the user in the browser** and every model call goes direct from the browser to `api.anthropic.com` with `anthropic-dangerous-direct-browser-access`. That is not shippable to enterprise customers.
2. **All state lives in `localStorage`** (`corridor.projects`, memories, results). Nothing is shared, nothing survives a device change, there are no accounts, and there is no team access.

## Goal for this MVP

Port Corridor onto this project's stack, move the AI and secrets server-side, and put projects/threads/results in a real database — while preserving the existing design, domain logic, and datasets exactly as they are.

## Plan

### 1. Bring the code in
- Copy the repo into this project: `styles.css` content merged into the design system, `data/` into `public/data/`, and `tools/` kept as-is for dataset regeneration.
- Port the domain modules (`tariffs`, `datasets`, `lanes`, `mcs`, `watch`, `assessments`, `map`) to TypeScript modules under `src/lib/corridor/`. These are pure logic and translate almost directly — no behaviour changes.
- Preserve the Corridor visual identity: same fonts (loaded via a `<link>` in the root route), same colour system and typography, ported into semantic design tokens.

### 2. Rebuild the UI as routes and components
- `/` — the home/marketing view (hero, globe canvas, how-it-works), replacing the placeholder index.
- `/app` — the project workspace: sidebar project list, chat thread, results.
- `/app/$projectId` and sub-views for the trade model, lanes/map, assessments, and watch feed.
- Break `app.js` into React components backed by the ported TypeScript logic rather than DOM manipulation.

### 3. Move AI server-side (keeping Claude)
- Enable Lovable Cloud.
- Keep the current Claude behaviour: same model (`claude-sonnet-4-5`), same system prompts, same web-search tool use — but the call moves from the browser to a server-side streaming endpoint.
- Store the Anthropic API key as a project secret so it is only ever read on the server. Users never supply a key.
- Delete the API-key bar and `corridor.api_key` entirely.
- Keep the tariff/MCS prompt blocks, memory injection, and assessment prompts unchanged; they move into the server handler as-is.

### 4. Real persistence, anonymous trial, and accounts
- Anonymous trial session: a first-time visitor can open the workspace and run a project immediately, with their work held against an anonymous session.
- Signing up claims that session — the anonymous project data is carried over to the new account rather than lost.
- Move `localStorage` state into the database: projects, threads and messages, memories, documents, results, assessments, lanes, and watch items.
- Row-level security so a user (or anonymous session) only sees their own projects; structured so team/org sharing can be added later.
- One-time import path so an existing browser's `localStorage` projects can be migrated into the account.

### 4b. In-app "Request an analysis"
- Replace the `hello@corridor.trade` mailto link with an in-app request form: contact details, rough SKU count, origins bought from, and a spreadsheet upload.
- Submissions are stored in the database and visible to you, so requests become tracked records rather than emails.


### 5. Datasets
- Serve `tariffs-2026.json` and `mcs2026.json` from `public/data/` with the existing lazy index-first loading, so first paint stays fast.
- Keep the index files as the search entry point, exactly as `tariffs.js`/`mcs.js` do now.

### 6. Verify
- Confirm the home page, workspace, chat streaming, tariff duty computation, origin comparison, map rendering, and assessments all work end-to-end in the preview.
- Add unique page metadata per route (title, description, OG/Twitter).

## Scope note

This is a port plus a backend, not a rewrite of the product logic. Broadening beyond tariffs into the wider risk-tracking vision (sanctions, geopolitical events, insurance-grade risk scoring across arbitrary "spaces") is the natural next milestone — the assessment-module and watch-item structures already in the code are the right foundation for it, but this MVP focuses on getting what exists onto a real, secure, multi-user platform.

## Technical details

- Stack: TanStack Start v1, React 19, Tailwind v4, Lovable Cloud (Postgres + auth).
- AI: the Anthropic Messages API called from the server with the existing model and prompts, using an `ANTHROPIC_API_KEY` project secret. Chat streaming goes through a server route under `src/routes/api/`; one-shot calls (assessments, memory extraction, watch checks) go through `createServerFn`.
- Anonymous sessions use Lovable Cloud anonymous auth so RLS applies uniformly and claiming an account is a straight user-id link.
- Ported domain logic lives in `src/lib/corridor/*.ts` as pure, testable modules with no DOM dependencies.
- The Python tools in `tools/` stay as build-time scripts — they are not part of the runtime.

## Note on the Anthropic key

Keeping Claude means the app needs your own Anthropic API key stored as a project secret (billed to your Anthropic account). I'll ask for it securely at the point I wire up the chat endpoint — nothing to do now.

