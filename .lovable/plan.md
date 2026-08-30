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

### 3. Move AI server-side
- Enable Lovable Cloud.
- Replace the browser-side Anthropic call with a server-side streaming chat endpoint using the AI SDK and the Lovable AI Gateway.
- Delete the API-key bar and `corridor.api_key` entirely — users never supply a key again.
- Keep the existing system prompts, tariff/MCS prompt blocks, memory injection, and assessment prompts; they move into the server handler unchanged.

### 4. Real persistence and accounts
- Enable authentication so each user has an account.
- Move `localStorage` state into the database: projects, threads and messages, memories, documents, results, assessments, lanes, and watch items.
- Row-level security so a user only sees their own projects; structured so team/org sharing can be added later.
- One-time import path so an existing browser's `localStorage` projects can be migrated into the account on first sign-in.

### 5. Datasets
- Serve `tariffs-2026.json` and `mcs2026.json` from `public/data/` with the existing lazy index-first loading, so first paint stays fast.
- Keep the index files as the search entry point, exactly as `tariffs.js`/`mcs.js` do now.

### 6. Verify
- Confirm the home page, workspace, chat streaming, tariff duty computation, origin comparison, map rendering, and assessments all work end-to-end in the preview.
- Add unique page metadata per route (title, description, OG/Twitter).

## Scope note

This is a port plus a backend, not a rewrite of the product logic. Broadening beyond tariffs into the wider risk-tracking vision (sanctions, geopolitical events, insurance-grade risk scoring across arbitrary "spaces") is the natural next milestone — the assessment-module and watch-item structures already in the code are the right foundation for it, but this MVP focuses on getting what exists onto a real, secure, multi-user platform.

## Technical details

- Stack: TanStack Start v1, React 19, Tailwind v4, Lovable Cloud (Postgres + auth), Lovable AI Gateway via the AI SDK.
- Chat streaming goes through a server route under `src/routes/api/`; one-shot AI calls (assessments, memory extraction, watch checks) go through `createServerFn`.
- Ported domain logic lives in `src/lib/corridor/*.ts` as pure, testable modules with no DOM dependencies.
- The Python tools in `tools/` stay as build-time scripts — they are not part of the runtime.

## Open questions

- Should the MVP require sign-in to use the workspace, or allow an anonymous trial session that can be claimed later?
- Do you want to keep the current Claude model behaviour, or is switching to the Lovable AI Gateway's default model acceptable for the MVP?
- Is the `hello@corridor.trade` mailto flow on the home page staying, or should "Request an analysis" become an in-app form?
