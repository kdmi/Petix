# Petix

Petix is a browser-based pet battler built around Solana wallet identity. Players connect a wallet, generate unique pets with AI-assisted traits and art, fight other players' pets, earn XP, level up, spend upgrade points, and revisit past battles through replay links.

The project includes the public player experience, the battle backend, progression systems, replayable arena history, and an admin panel for character and battle oversight.

## What Is Live In The Project

### Player Experience

- Solana wallet authentication with signed sessions
- Pet creation flow with rarity, attribute allocation, and power selection
- AI-assisted pet names, powers, images, and battle narration with safe fallbacks
- Wallet-based pet collection in `My Pets`
- Daily battle energy system with refill logic and UI feedback
- Battle matchmaking against real player-owned pets
- Animated battle flow with round-by-round combat log
- Replayable battle history in `Arena`
- XP rewards, leveling, and upgrade points
- Pet upgrade screen for spending newly earned stat points

### Battle System

- Server-side battle simulation
- Persistent battle records and replay recovery
- Idempotent reward finalization to prevent duplicate XP grants
- Authoritative opponent reveal bundle for the battle-start carousel
- AI narration with non-AI fallback copy if the model times out or is disabled
- Admin battle exceptions for the configured admin wallet

### Admin Panel

- Character roster with wallet ownership, level, and XP
- One-click wallet pivot from a row into filtered character search
- Global `Battles` tab with completed battle feed
- Battle lifecycle metadata for investigation
- Summary stats such as total completed battles and average rounds for the latest 50 battles
- Replay links from admin battle rows

## Core Product Flow

1. Connect a Solana wallet.
2. Create a pet and finalize its attributes and power.
3. Open `My Pets` and send a pet into battle.
4. Review results in live battle UI or later from `Arena` history.
5. Spend earned upgrade points when the pet levels up.

## Tech Stack

- Plain browser JavaScript for the shared player and admin app
- Node.js CommonJS serverless-style routes
- `tweetnacl` and `bs58` for Solana signature verification
- `@vercel/blob` for production persistence
- Local JSON storage for development
- Gemini APIs for optional text and image generation

## Local Development

### Install

```bash
npm install
```

### Configure Environment

Create `.env.local` in the project root.

Minimum recommended variables:

| Variable | Required | Purpose |
| --- | --- | --- |
| `SOLANA_AUTH_SECRET` | Yes | Signs auth/session tokens |
| `INTERNAL_API_SECRET` | Recommended | Internal route auth and stable storage paths |
| `GEMINI_API_KEY` or `GOOGLE_AI_API_KEY` | Optional | Enables live AI generation and battle narration |
| `BLOB_READ_WRITE_TOKEN` | Production only | Enables Vercel Blob persistence |
| `ADMIN_WALLETS` or `ADMIN_WALLET` | Optional | Extra admin wallets beyond the built-in default |
| `CORS_ALLOWED_ORIGINS` | Optional | Comma-separated allowed origins |
| `BATTLE_NARRATION_BUDGET_MS` | Optional | Timeout budget for battle narration |

### Start The App

```bash
node scripts/dev-server.js
```

The local server runs on [http://127.0.0.1:3000](http://127.0.0.1:3000) by default.

### Run Tests

```bash
npm test
```

## Main Routes

| Route | Purpose |
| --- | --- |
| `/` | Landing page |
| `/pet-creation/` | Pet creation experience |
| `/dashboard/` | Main player dashboard |
| `/dashboard/?screen=cabinet` | `My Pets` view |
| `/dashboard/?screen=arena` | Arena history and battle replay entry point |
| `/dashboard/?screen=upgrade&petId=...` | Pet upgrade screen |
| `/admin/` | Admin dashboard |

## API Surface

Key routes currently used by the app:

- `/api/auth/solana/challenge`
- `/api/auth/solana/verify`
- `/api/auth/solana/me`
- `/api/auth/solana/logout`
- `/api/character/me`
- `/api/character/create`
- `/api/character/upgrade`
- `/api/battles`
- `/api/battles/opponents`
- `/api/battles/:battleId`
- `/api/admin/characters`
- `/api/admin/battles`
- `/api/waitlist/subscribe`

## Data And Storage Model

- Development uses local files under `.data/local-dev`
- Production uses Vercel Blob-backed storage
- Wallet profiles store draft state, completed pets, notifications, battle energy, and reward ledger data
- Battle storage keeps completed replays plus lifecycle metadata for failed or pending attempts

## Project Structure

```text
admin/                 Admin HTML entrypoint
api/                   API routes and shared backend libs
assets/                Shared static assets
dashboard/             Player dashboard entrypoint
docs/                  Internal battle and prompt documentation
pet-creation/          Shared frontend app, styles, battle UI, admin UI
scripts/               Dev server and maintenance scripts
server-routes/         Route handlers used by API wrappers
tests/unit/            Unit and route-level regression tests
```

## Deployment Notes

- Production is designed to run on Vercel
- Blob-backed persistence activates when `NODE_ENV=production` and `BLOB_READ_WRITE_TOKEN` is present
- Replay links, battle history, progression, and admin summaries all rely on persisted battle records being available in shared storage

## Status

Petix is no longer just a character generator prototype. The repository currently contains a working wallet-authenticated pet game loop with:

- creation
- collection management
- PvP-style pet battles
- XP and upgrade progression
- replayable battle history
- admin inspection tools

That makes this repo a solid base for the next stage: deeper combat systems, economy, live ops, and social gameplay.
