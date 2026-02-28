# Character Forge Kanban

## Done

- [x] Backend foundation for character flow (`/api/character/me`, `/api/character/start`, `/api/character/create`)
- [x] Reusable auth helpers for session + signed payload tokens
- [x] One-character restriction logic per wallet session profile
- [x] Draft generation: archetype, random traits, generated name, generated image, generated powers
- [x] Step 1 UI: type selection (preset + custom)
- [x] Step 2 UI: preview + superpower selection
- [x] Step 3 UI: 15 XP distribution with validation
- [x] Step 4 UI: success state + temporary cabinet
- [x] README update

## Next

- [ ] Integrate exact Figma visuals and spacing for node `2:5429`
- [ ] Connect real image model (instead of deterministic avatar URL) if required
- [ ] Add persistent shared storage (DB/KV) for strict cross-device one-character guarantee
- [ ] Add e2e checks for wizard steps and server validation
