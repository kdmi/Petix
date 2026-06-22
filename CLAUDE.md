# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Summary

Petix is a browser-based pet battler with Solana wallet identity. Players connect a wallet, generate AI-assisted pets, fight other players' pets, earn XP, level up, and replay past battles. The repo contains the player experience, battle backend, progression system, replayable arena history, and an admin panel — all in one codebase.

## Commands

Install dependencies:
```bash
npm install
```

Run the local dev server (serves static pages and API routes on http://127.0.0.1:3000):
```bash
node scripts/dev-server.js
```

Run the full test suite (Node's built-in test runner — no Jest/Mocha):
```bash
npm test
```

Run a single test file:
```bash
node --test tests/unit/battle-simulation.test.js
```

Run a single named test inside a file (Node test runner filter):
```bash
node --test --test-name-pattern="pattern" tests/unit/battle-simulation.test.js
```

There is no lint script configured in `package.json` despite `AGENTS.md` mentioning `npm run lint` — only `npm test` is wired up.

## Environment

Create `.env.local` at the repo root. See `README.md` for the full variable table. Key points:

- `SOLANA_AUTH_SECRET` (required, ≥32 chars) — HMAC secret for session/challenge/character cookies in `api/_lib/auth.js`.
- `INTERNAL_API_SECRET` (≥24 chars) — enables internal route auth and produces stable hashed blob paths for storage.
- `GEMINI_API_KEY` / `GOOGLE_AI_API_KEY` — optional; when absent, battle narration falls back to deterministic template copy.
- `BLOB_READ_WRITE_TOKEN` + `NODE_ENV=production` — switches storage from local JSON to `@vercel/blob`.
- `ADMIN_WALLETS` / `ADMIN_WALLET` — extra admin wallets on top of the hard-coded default in `api/_lib/auth.js` (`AwtqC9r5Wgvjfhqw5DrtzC5W73QRVF14DZVop8caECi9`).

The dev server loads `.env.local` then `.env` manually (no dotenv dep) — only keys not already in `process.env` are set.

## Architecture

### Routing model — Vercel serverless functions served by a dev shim

Production runs on Vercel with file-system routing under `api/`. Locally, `scripts/dev-server.js` emulates that: any URL starting with `/api/` is resolved to a matching `.js` file in `api/`, including dynamic `[param].js` segments. Everything else is served as a static file from the repo root (so `/dashboard/` serves `dashboard/index.html`, `/pet-creation/` serves `pet-creation/index.html`, etc.).

The dev server clears the `require` cache for project modules on every request, so code changes to API handlers take effect without restart.

### Two-layer API: `api/*` wrappers → `server-routes/*` handlers

Many API endpoints are a thin wrapper in `api/` that dispatches to a real handler in `server-routes/`. The dispatcher pattern uses a dynamic segment (e.g. `api/admin/[action].js`, `api/character/[action].js`, `api/auth/solana/[action].js`) that maps the last path segment to a handler module. When adding a new admin action, for example, create `server-routes/admin/<name>.js` and add it to the `HANDLERS` map in `api/admin/[action].js` — adding a file in `server-routes/` alone will not route.

Battle endpoints (`api/battles/*`) are the exception — they live directly under `api/battles/` because their handler logic was kept inline.

### Shared backend library — `api/_lib/`

All persistence, auth, and game logic lives here and is imported by both the `api/` wrappers and the `server-routes/` handlers. Most important modules:

- `auth.js` — Solana signature verification (tweetnacl + bs58), HMAC-signed cookies for challenge/session/character, CORS helper, internal-secret header auth, and the admin-wallet allowlist.
- `store.js` — wallet profile storage. One profile per wallet holds `draft`, `characters`, `notifications`, and `battleState`. Writes are serialized per wallet via a `walletWriteQueues` map. In dev it reads/writes `.data/local-dev/`; in production it reads/writes `@vercel/blob` under a hashed path derived from `INTERNAL_API_SECRET`.
- `battle-store.js` — battle record storage with the same dev/prod dual backend. Records have lifecycle states (`generating` → `ready`/`failed`) and support paginated history queries per wallet.
- `battle.js` — battle simulation (deterministic given a seed), reveal bundle construction, and progression application to character records.
- `battle-matchmaking.js` — opponent selection and reveal carousel candidate shortlisting.
- `battle-progression.js` — XP/level/upgrade-point math.
- `battle-energy.js` — daily battle-energy state normalization and refill logic.
- `battle-narration.js` — Gemini-backed narration with template fallback; respects `BATTLE_NARRATION_BUDGET_MS`.
- `character.js` — character serialization, validation, rarity/attribute rules, and image URL handling (large file).

### Battle POST flow (`api/battles/index.js`)

The POST handler is the core write path and worth understanding before touching anything adjacent. High level:

1. Resolve attacker from the session's wallet + `attackerPetId` and assert battle energy is available.
2. Build authoritative opponent + reveal carousel from all characters.
3. Pre-compute the full simulation (so both sides can be mutated atomically).
4. Mutate attacker profile (consume energy, apply progression), **save a `generating` battle record**, then mutate defender profile.
5. Generate narration, then save the finalized battle record and send a passive notification to the defender.
6. On any failure, the handler restores both wallet profiles from snapshots captured during mutation and marks the battle record `failed`. Preserve this rollback behavior when editing.

Idempotency and authoritative-reveal rules matter here — see `docs/local-battle-rules.md` and `docs/local-battle-ai-prompt.md`.

### Frontend — single shared SPA across three entry points

There is no build step and no framework. The player dashboard, pet creation, and admin panel are three separate HTML entrypoints that all load the same `pet-creation/app.js` (~267 KB) and `pet-creation/styles.css`:

- `dashboard/index.html` — main player dashboard; screens are selected via `?screen=cabinet|arena|upgrade` query params.
- `pet-creation/index.html` — pet creation flow.
- `admin/index.html` — admin panel.

`pet-creation/app.js` is a monolithic client that routes by screen query param and renders all three experiences. Smaller helpers like `admin-panel-state.js`, `upgrade-screen-state.js`, and `battle-round-direction.js` sit alongside it.

The root `app.js`, `index.html`, `styles.css`, and `prod-root-styles.css` at the repo root are the legacy landing page — not the dashboard.

### Storage layout

- Dev: `.data/local-dev/` — JSON files for characters and battles plus a `character-images/` dir. Gitignored.
- Prod: `@vercel/blob` — the DB path is a SHA-256 hash derived from `INTERNAL_API_SECRET` (or `SOLANA_AUTH_SECRET` as fallback), so changing that secret silently orphans existing data.

## Specs and docs

- `specs/` contains per-feature spec folders (001–008) generated via `.specify/` tooling. They document intended behavior for features that have already landed.
- `docs/local-battle-rules.md` and `docs/local-battle-ai-prompt.md` describe battle rules and the narration prompt contract.
- `AGENTS.md` is auto-generated from spec plans and can be stale; prefer the code and this file.

## Conventions

- CommonJS throughout — use `require`/`module.exports` in Node code.
- Tests use `node:test` + `node:assert/strict`. Shared test setup lives in `tests/unit/helpers/`.
- Handlers return JSON via the `json(res, status, body)` helper from `api/_lib/auth.js` and must call `handleCors(req, res)` first when they accept cross-origin requests.
- Wallet profile writes go through `updateWalletProfile(wallet, mutator)` so the per-wallet write queue serializes them — do not call `saveWalletProfile` directly in new write paths unless rolling back. A mutator that `throw`s aborts the write (used by farm/slot handlers to return 4xx without a spurious write).
- Economy coefficients (farm rate, battle reward, slot prices, withdrawal params) live in the runtime-tunable `economy-config.js` (defaults ⊕ overrides via `economy-config-store.js`), not hard-coded — read with `getEconomyConfig()`, change via admin `economy-config`. Farm accrual is lazy from timestamps (`farm.js`), no cron. Phase 2 (Points→$PETIX withdrawal, on-ramp, balance reset) is **designed but not built** — see [specs/013-farm-economy/](specs/013-farm-economy/).

<!-- SPECKIT START -->
Current plan: [specs/013-farm-economy/plan.md](specs/013-farm-economy/plan.md)

See also:
- [specs/013-farm-economy/spec.md](specs/013-farm-economy/spec.md) — business-level feature spec (token earn/spend mechanics)
- [specs/013-farm-economy/research.md](specs/013-farm-economy/research.md) — Phase 0 decisions + economic model + alternatives
- [specs/013-farm-economy/data-model.md](specs/013-farm-economy/data-model.md) — entities, invariants, config defaults
- [specs/013-farm-economy/contracts/](specs/013-farm-economy/contracts/) — farm/slot/admin endpoints + store + POST /api/battles invariants
- [specs/013-farm-economy/quickstart.md](specs/013-farm-economy/quickstart.md) — dev loop + verification
- [CLAUDE.local.md](CLAUDE.local.md) — private decisions log (013-farm-economy tokenomics)
- [specs/012-blob-ops-quick-wins/](specs/012-blob-ops-quick-wins/) — preceding feature: Vercel Blob op reduction
- [specs/011-currency-admin-panel/](specs/011-currency-admin-panel/) — admin section for Points stats and balance adjustments
- [specs/009-points-integration/](specs/009-points-integration/) — preceding feature: Points currency emission + header balance
<!-- SPECKIT END -->
