# Expeditions (feature 026) — how it works and how to run it

PvE mode: a season map of 10 bosses, each a tribute to a Robinhood Chain NFT collection. The player fields 1–4 own pets, pays
**1 battle energy + a Points fee**, plays a match-3 fight and earns Points per star (once per star tier). A perfect **3★ run earns
the boss trophy NFT** (ERC-721 `ExpeditionTrophies`, minted by the server). Bosses are opened by hand from the admin panel; three
at launch. Holders of boss collections claim bonus energy; capsule holders get it airdropped.

Design source: `expedition-demo/` (UI reference, popups gallery `popups.html`, admin mockup `admin.html`), spec and plan in
`specs/026-expeditions/` (not in git).

## Player rules (what the UI says)

- First boss is free; from the second one the fee is per boss (`EXPEDITION_FEES`). After 3★ a boss replays for free and pays nothing.
- Rewards: 1★ = 0.5× fee, 2★ = 1× fee, 3★ = 2× fee (`EXPEDITION_REWARD_MULTS`); the free boss pays from `EXPEDITION_FREE_BOSS_REWARD_BASE`.
  Each tier pays **once** — reaching 2★ first time pays tiers 1 and 2; a later 1★ pays nothing.
- Stars: win · finish with ≥ 50 % squad HP · win within the boss's fixed `par` turns.
- Linear access: boss N+1 is playable after beating N. Hidden bosses show "Coming soon".
- A fight costs `EXPEDITION_ENERGY_PER_ATTEMPT` energy (daily → granted → purchased) and the fee; both are checked before start.
- Leaving mid-fight keeps the attempt active for 24 h; starting a new fight forfeits it (no refund).

## Battle protocol (2 profile writes per fight)

1. `POST /api/expeditions/start { bossIndex, squadIds[] }` — gate (feature flag, admin-only, linear access), spend energy + fee, pick
   wild fillers from the roster index by seed, store `expeditions.active` (seed, frozen squad stats, wilds). **Write 1.**
2. The client plays locally with `assets/expeditions/engine.js` (same file the server uses) and keeps the move list in
   `localStorage` (`petix-xp-attempt:<attemptId>`) for resume after a reload.
3. `POST /api/expeditions/finish { attemptId, moves[] }` — the server replays every move (neighbour swap with a match, HIT only on a full
   ring), computes stars, pays the missing tiers, updates `expeditions.progress`. Idempotent per `attemptId`. **Write 2.**
   `{ attemptId, forfeit: true }` closes an attempt without payout (used when the moves are gone, e.g. another device).
4. `GET /api/expeditions/state` — boss views, progress, active/stale attempt, wallet (Points, energy), rules, tutorial flag.

Bots that compute a perfect game from the seed are an accepted risk: the fee and the fixed par are the limiters.

## NFT trophies

- Contract `contracts/ExpeditionTrophies.sol`: `mint(to, bossId)` by the `minter` only, `claimed[bossId][wallet]` enforced on-chain,
  `tokenURI = baseURI + tokenId`, ERC-2981, ERC-4906 (`setBaseURI` emits a batch refresh).
- `POST /api/expeditions/claim-nft { bossIndex }` (3★ required) → status `minted` (tokenId, txHash) or `pending` (minting paused,
  RPC down, receipt late). A failed send returns the button to the player (toast) and logs the failure.
- Cron `/api/expeditions/mint-sync` (every minute) settles sent mints and mints the queue once `EXPEDITION_NFT_MINT_ENABLED = 1`.
- Metadata `GET /api/expeditions/metadata/<tokenId>` (public): name `<Boss> #<serial>`, image = season-map art
  (`/assets/expeditions/nft/<n>.png`, 1000×1000 with the background baked in; the map cards use `/bosses/<n>.png`), attributes Level / Family / Season / Number (per-boss serial, #1 = first wallet to clear the boss); the name is `<Boss> #<Number>`. Replace the art → call `setBaseURI` or
  `notifyBatchMetadataUpdate` so marketplaces refresh.
- Scripts: `node scripts/expeditions/compile.js` → `deploy.js` (owner key, prints the address) → `preflight.js` (minter matches,
  ETH for gas, baseURI).

## Holder energy

- Partner collections: the player presses Claim on the Expeditions page; the server checks the wallet over RPC (`balanceOf`, Transfer logs since the boss was opened, `ownerOf`; Blockscout is Cloudflare-gated for server fetches and is only a fallback),
  counts NFTs that did **not** arrive by plain transfer after the boss's `openedBlock` (mints and marketplace purchases count),
  and grants a flat `EXPEDITION_COLLECTION_ENERGY[boss]` once per collection per wallet. *(Routes land in the last phase of 026.)*
- Capsules: one-off airdrop from the admin panel (`capsule-airdrop`, per capsule by tier `EXPEDITION_CAPSULE_ENERGY`), idempotent
  per label; wallets without a profile receive it on their first visit (`expedition-energy-grants-pending.json`).
- Manual grants: `energy-grant` with a list of wallets, same idempotency.
- Granted energy lives in `battleState.energyGranted`: never resets at midnight, spent after the free allowance and before purchased.

## Admin panel · Expeditions tab

Access switch (Off / Admins only / Everyone = `EXPEDITIONS_ENABLED` + `EXPEDITIONS_ADMIN_ONLY`), minting switch, today / 7-day
stats (from per-wallet daily counters, no shared document), season board (open/hide per boss, contract, fee, energy per claim),
economy levers, capsule airdrop (amount chosen at drop time: per capsule / per holder / by tier; repeatable, one label per drop) and manual grants, mint queue with a manual run, latest attempts. All writes go through
`/api/admin/economy-config` with a reason (audited) or the dedicated admin actions.

**Opening a boss**: enter the collection contract → Save → Open boss. The server verifies ERC-165/721 via RPC and stores the
current block as `openedBlock` (claim cut-off). A boss with attempts can't be hidden — pause the mode instead.

## Env

| Variable | Required | Meaning |
|---|---|---|
| `EXPEDITION_NFT_CONTRACT` | for minting | Deployed `ExpeditionTrophies` address |
| `EXPEDITION_MINTER_SECRET` | quiet test only | Separate test operator for the throwaway collection; unset at launch → the $PETIX operator mints |
| `EXPEDITION_NFT_TEST_MODE` | optional | `1` → the metadata route answers with neutral names and a placeholder image (not used in the current rollout plan) |
| `NFT_RPC_URL`, `NFT_CHAIN_ID` | yes | Chain RPC (Alchemy) and chain id, shared with capsules |
| `PUBLIC_BASE_URL` | for deploy | Base of the metadata URL baked into the contract |
| `CRON_SECRET` | yes | Already used by the other crons |
| `NFT_OPENSEA_API_KEY` | optional | Lets the admin tab ask OpenSea to re-read trophy metadata (shared with capsules) |

Trophy records in profiles and the mint registry are keyed by the contract address: a test collection and the real one never
mix, and switching `EXPEDITION_NFT_CONTRACT` lets every wallet claim again on the new contract.

Runtime levers live in the economy config (`EXPEDITION_*`), never in env — see `api/_lib/economy-config.js`.

## Incidents

- **Mint failed for a player**: they saw a toast and the button is back; the failure is in the admin mint journal. Check minter ETH
  (`preflight.js`), then let them retry or run the queue.
- **RPC down**: claims answer 503, fights are unaffected (no chain calls on start/finish). Minting queues up.
- **Wrong payouts / exploit suspected**: Access → Admins only (instant), investigate `expeditions.progress[*].lastResult`,
  fix, reopen.
- **Rollback**: `EXPEDITIONS_ENABLED = 0` hides the tab and makes every route 404; data stays in profiles.
