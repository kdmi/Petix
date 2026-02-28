# Petix

Petix project repository.

## Solana wallet auth (backend)

The project now includes backend API routes for Solana sign-in:
- `POST /api/auth/solana/challenge`
- `POST /api/auth/solana/verify`
- `GET /api/auth/solana/me`
- `POST /api/auth/solana/logout`

Required environment variable:
- `SOLANA_AUTH_SECRET` - long random string used to sign auth/challenge tokens.

Run locally:
1. `npm install`
2. `SOLANA_AUTH_SECRET=your-long-random-secret npx --yes vercel dev`
