# Corridor — Global Trade Insights MVP Plan

## Goal
Turn Corridor into a working MVP: a chat-first market-research platform that lets large global companies, investors, insurers, and similar players track trade and geopolitical risk across spaces they care about (tariffs, sanctions, supply-chain disruptions, etc.).

## Current state
- This project is a fresh TanStack Start + Tailwind v4 template.
- Only the root layout and a placeholder `src/routes/index.tsx` exist.
- No Lovable Cloud backend, auth, or data persistence is configured yet.
- The Corridor code lives in a private GitHub repo (`radebe24/corridor`) that still needs to be made accessible for audit.

## Plan

### 1. Audit the existing Corridor codebase
- Clone or review the shared GitHub repo.
- Document: framework/stack, existing routes/components, data model, auth approach, AI/chat integration, external APIs, and any assets/branding.
- Identify what can be imported directly vs. what needs to be rebuilt to fit TanStack Start / Lovable Cloud.

### 2. Decide migration strategy
- **Option A — Direct import:** Copy compatible files into this project and reconcile routing/state.
- **Option B — Rebuild using Corridor as reference:** Keep the design and logic, but rewrite on the current stack for cleaner integration.
- Choose based on the audit; default to the path that gets a working MVP fastest.

### 3. Set up backend foundation
- Enable Lovable Cloud for persistence, auth, and server-side logic.
- Create the core schema for:
  - Users / organizations
  - Chat threads and messages
  - Risk "spaces" or watchlists (topics/countries/sectors the user tracks)
  - Data sources / events attached to spaces
- Apply RLS and GRANT statements per project conventions.

### 4. Build the chat-first research experience
- Implement a streaming chat UI backed by a server route or `createServerFn`.
- Use Lovable AI Gateway with the AI SDK for research-style responses.
- Add tools for structured output: risk summaries, tariff updates, country/sector snapshots.
- Persist threads and messages in the database.

### 5. Create risk tracking spaces
- Let users create and follow "spaces" (e.g., "US–China tariffs", "EU battery regulations", "Red Sea shipping").
- Store space metadata and associate AI-generated insights or external events with each space.
- Surface recent activity and risk signals in a dashboard or sidebar.

### 6. Landing page + navigation
- Replace the placeholder `src/routes/index.tsx` with a Corridor-branded landing page.
- Add app routes: `/chat`, `/spaces`, `/space/:id`, and auth routes if needed.
- Ensure every route has unique `head()` metadata (title, description, OG/Twitter tags).

### 7. Verify and ship
- Run `build:dev` and fix any SSR/import issues.
- Test chat streaming, space creation, and persistence end-to-end.
- Confirm the dev preview renders the MVP correctly before declaring the milestone done.

## Open questions to resolve before implementation
- How should I access the private Corridor repo?
- Does the MVP need user authentication immediately, or can it start with anonymous sessions?
- Are there specific data sources (e.g., official tariff feeds, news APIs) the research agent should call, or should it rely on the model's knowledge for the MVP?

## Technical details
- Stack: TanStack Start v1, React 19, Tailwind CSS v4, Lovable Cloud (Supabase), Lovable AI Gateway via AI SDK.
- Server boundaries: chat streaming via server route; other AI calls via `createServerFn`.
- Auth: Lovable Cloud managed auth if required; otherwise defer to a later milestone.
