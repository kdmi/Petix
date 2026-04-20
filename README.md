# Petix

Petix is a Solana pet-creation game where users connect a wallet, generate a character, choose a battle power, and build a personal collection of pets.

## Implemented

- [x] Solana wallet authentication with signed session flow
- [x] Character creation flow with preset and custom creature types
- [x] Server-side generation of character variables from local project data
- [x] AI-generated character names
- [x] AI-generated battle powers
- [x] AI-generated character images
- [x] Rarity system with different starting attribute budgets
- [x] Power selection step
- [x] Attribute distribution step
- [x] Success state with final pet card
- [x] Dashboard with created pets linked to the connected wallet
- [x] Character creation limits for regular wallets
- [x] Local rarity configuration stored in the repo
- [x] Randomized 2-6 active prompt variables per character draft
- [x] Conditional prompt assembly that omits inactive character details
- [x] Offensive-only power generation prompt
- [x] Left-facing image direction constraints for generated character art

## Main User Routes

- `/`
- `/pet-creation/`
- `/dashboard/`
