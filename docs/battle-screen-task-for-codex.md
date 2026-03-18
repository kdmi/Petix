# Petix MVP Battle Screen — Task Prompt for Codex

Implement the MVP battle screen for Petix.

Read and follow `battle-screen-mvp-spec.md` exactly.

## Context

- Pet creation already exists
- Opponent selection flow already exists
- We are implementing only the battle screen and battle generation logic
- This is MVP
- There are **no battle locations**, **no arenas**, and **no location modifiers**
- Backend decides the combat outcome
- AI only generates narration for already calculated battle steps
- Frontend replays existing battle data step by step

## Your tasks

Implement:

1. battle domain types
2. backend combat simulation
3. reward calculation
4. AI narration generation with fallback template narration
5. `POST /api/battles`
6. `GET /api/battles/:battleId`
7. frontend `/battle/:battleId` page
8. step-by-step playback UI
9. final result screen
10. loading and error states
11. passive defender notification creation

## Constraints

Do not add:

- battle locations
- arena effects
- extra game systems not described in the spec
- frontend battle calculation
- AI-driven combat logic
- token economy
- betting
- persistent damage between battles
- healing system between battles

## Implementation order

Work in this order:

1. inspect the existing project structure
2. identify where battle domain logic should live
3. create battle types and interfaces
4. implement combat simulator
5. implement reward calculation
6. implement AI narration generation
7. implement fallback narration builder
8. implement backend endpoints
9. implement frontend battle page
10. implement playback behavior
11. implement final result UI
12. wire notifications for passive defender
13. summarize all changed files

## Coding rules

- Prefer simple deterministic MVP-safe implementation
- Keep combat logic on backend only
- Keep frontend as a replay layer only
- Use clear type-safe interfaces
- Reuse existing project patterns where possible
- If something is unclear, choose the simplest solution that matches the spec

## Deliverables

At the end, provide:

1. list of changed files
2. short summary of what was implemented
3. known limitations or TODOs
