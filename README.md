# Petix

Petix is a Vercel-hosted Solana app with wallet auth, character creation, dashboard, and admin panel.

## Routes

- `/`
  Public landing placeholder with wallet connect.
  If a session already exists, the user is redirected immediately:
  - no characters -> `/pet-creation/`
  - one or more characters -> `/dashboard/`
- `/pet-creation/`
  Character creation flow only.
- `/dashboard/`
  Character gallery for the connected wallet.
- `/admin/`
  Admin table for viewing and deleting created characters.

## Character flow

1. User connects a Solana wallet.
2. User chooses a creature type or enters a custom one.
3. Server creates a draft:
   - loads variable pools from Google Sheets with CSV fallback
   - rolls rarity
   - generates character name
   - generates 3 combat powers
   - generates character image with Gemini
4. User chooses one power.
5. User distributes attribute points.
6. Character is finalized and attached to the wallet.

## Current rules

- Regular wallet: maximum 3 created characters.
- Admin wallet: no character limit.
- If image generation fails, character creation fails and the user is returned to the start.
- Placeholder images are not used for created characters anymore.
- Attribute budget depends on rarity:
  - Common: 10
  - Rare: 12
  - Epic: 13
  - Legendary: 15
- Per-attribute maximum stays 15 for all rarities.

## Storage

- Production:
  - character records are stored in Vercel Blob
  - generated character images are stored in Vercel Blob
- Local development:
  - fallback storage is in `.data/`
  - local images are written to `.data/character-images/`

## API

### Auth

- `POST /api/auth/solana/challenge`
- `POST /api/auth/solana/verify`
- `GET /api/auth/solana/me`
- `POST /api/auth/solana/logout`

### Character

- `GET /api/character/me`
  Returns wallet character state, including `draft`, `character`, and `characters`.
- `GET /api/character/image`
  Returns the current image for a requested character.
- `POST /api/character/start`
  Starts a new draft and runs server-side generation.
- `POST /api/character/select-power`
  Saves the chosen power on the draft.
- `POST /api/character/create`
  Finalizes the draft with selected attributes.

### Admin

- `GET /api/admin/characters`
- `POST /api/admin/delete-character`

## Main server files

- `app.js`
  Root landing wallet flow and authenticated redirect logic.
- `pet-creation/app.js`
  Creation wizard, dashboard, and admin UI logic.
- `api/_lib/auth.js`
  Solana challenge verification, session cookies, admin wallet checks.
- `api/_lib/character.js`
  Draft generation, Google Sheet loading, Gemini prompts, rarity rules.
- `api/_lib/store.js`
  Blob/local storage implementation for profiles and images.

## Environment

Core variables used by the current codebase:

- `SOLANA_AUTH_SECRET`
- `ADMIN_WALLETS`
- `GEMINI_API_KEY` or `GOOGLE_AI_API_KEY`
- `GEMINI_TEXT_MODEL`
- `GEMINI_IMAGE_MODEL`
- `BLOB_READ_WRITE_TOKEN`

Optional/internal variables already supported:

- `INTERNAL_API_SECRET`
- `CHARACTER_DB_BLOB_PATH`
- `BLOB_CHARACTER_IMAGE_PREFIX`
- `WALLET_PROFILE_BLOB_PREFIX`

## Local development

This repo does not define npm scripts.

Typical local run options:

- `npx vercel dev`
- `node scripts/dev-server.js`

Useful local helpers:

- `scripts/dev-server.js`
- `scripts/migrate-images-to-blob.js`
