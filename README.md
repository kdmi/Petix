# Petix

Character creation flow with Solana wallet auth.

## Overview

- Wallet auth with signed challenge/session.
- Main page `/` stays as placeholder.
- Character flow page is on `/pet-creation/`.
- Character Forge wizard:
1. Choose character type (preset or custom).
2. Generate a draft on the server while the loading screen is shown.
3. Pull random character variables from the shared Google Sheet columns.
4. Build image/powers prompts and persist the draft on the server.
5. Pick one of 3 generated superpowers.
6. Distribute exactly 15 points across 4 attributes.
7. Finalize the character and attach it to the connected wallet.
- Excluded from scope: extra points for holding coin in wallet.
- Image generation falls back to a placeholder while external model credentials are not configured.

## API routes

Auth:
- `POST /api/auth/solana/challenge`
- `POST /api/auth/solana/verify`
- `GET /api/auth/solana/me`
- `POST /api/auth/solana/logout`

Character:
- `GET /api/character/me` - current draft or finalized character state.
- `GET /api/character/image` - current wallet character image.
- `POST /api/character/start` - create a persisted draft.
- `POST /api/character/select-power` - save selected power on the draft.
- `POST /api/character/create` - finalize the draft with attributes.
