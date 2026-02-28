# Petix

Character creation flow with Solana wallet auth.

## Implemented now

- Wallet auth with signed challenge/session.
- Main page `/` stays as placeholder.
- Character flow page is on `/pet-creation/`.
- Character Forge wizard:
1. Choose character type (preset or custom).
2. Generate character draft (image, prompt, funny name).
3. Pick one of 3 generated superpowers.
4. Distribute exactly 15 XP points across 5 stats.
5. Complete flow and open temporary cabinet with created character.
- Restriction: one character per wallet session profile.
- Excluded from scope: extra points for holding coin in wallet.

## API routes

Auth:
- `POST /api/auth/solana/challenge`
- `POST /api/auth/solana/verify`
- `GET /api/auth/solana/me`
- `POST /api/auth/solana/logout`

Character:
- `GET /api/character/me` - current character state.
- `POST /api/character/start` - create character draft.
- `POST /api/character/create` - finalize character with selected power + stats.

## Environment

Required:
- `SOLANA_AUTH_SECRET` - long random string used for signing tokens.

## Local run

1. `npm install`
2. `SOLANA_AUTH_SECRET=your-long-random-secret npx --yes vercel dev`
