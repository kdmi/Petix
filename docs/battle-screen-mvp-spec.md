# Petix MVP Battle Screen — Technical Spec

## 1. Goal

Implement the **MVP battle screen** for Petix where:

- two already selected characters fight each other
- the battle is fully simulated on the backend
- the frontend replays the battle step by step
- each step shows combat changes and story text
- the final result shows the winner, XP rewards, soft currency rewards, and passive XP for the defender if applicable

### Core rule

- **Backend decides combat outcome**
- **AI only generates narration for already computed battle events**
- **Frontend only replays the battle payload it receives**

AI must never decide:

- winner
- damage
- hit / miss / dodge / crit result
- reward amounts
- extra turns
- extra mechanics not already computed by backend

---

## 2. Scope

This spec is only for the **MVP battle screen and battle generation logic**.

### In scope

- backend battle simulation
- AI narration generation for battle steps
- battle API endpoints
- frontend battle screen playback
- final result state
- passive XP for defender
- notifications for passive defender

### Out of scope

- arenas
- battle locations
- location modifiers
- token economy
- betting
- live multiplayer synchronization
- persistent damage between battles
- healing system between battles
- advanced animation system

---

## 3. Route

Recommended route:

```txt
/battle/:battleId
```

Flow:

1. user already selected opponent before entering battle screen
2. frontend calls backend to create battle
3. backend simulates full battle and stores result
4. frontend opens `/battle/:battleId`
5. frontend fetches battle payload
6. frontend replays battle step by step

---

## 4. High-level flow

### 4.1 Entry flow

The battle page must open only after backend already knows:

- attacker pet
- defender pet
- full round-by-round simulation
- final rewards
- round narration text

The battle page must **not** simulate battle on the client.

### 4.2 Correct order

1. opponent is chosen before battle screen
2. frontend calls create battle endpoint
3. backend loads both pets
4. backend simulates full fight
5. backend generates narration
6. backend stores battle record
7. frontend navigates to `/battle/:battleId`
8. frontend fetches battle payload
9. frontend animates battle playback

---

## 5. Backend domain entities

### 5.1 Battle

```ts
export type Battle = {
  id: string
  status: "generating" | "ready" | "playing" | "finished"
  attackerPetId: string
  defenderPetId: string
  attackerOwnerWallet: string
  defenderOwnerWallet: string
  battleType: "pvp_random"
  createdAt: string
  winnerPetId: string
  loserPetId: string
  rounds: BattleRound[]
  result: BattleResult
  narrationMode: "ai" | "template"
}
```

### 5.2 BattlePetSnapshot

Use immutable snapshot data so old battle replays never change if a pet levels up later.

```ts
export type BattlePetSnapshot = {
  id: string
  name: string
  type: string
  rarity: "common" | "rare" | "epic" | "legendary"
  imageUrl: string
  level: number
  experienceBefore: number

  stamina: number
  strength: number
  agility: number
  intelligence: number

  selectedPower: {
    id: string
    name: string
    description: string
    effectType: "direct_damage" | "shield" | "stun" | "crit_boost" | "heal" | "dot"
    effectValue: number
  }

  traits: {
    element?: string
    topItem?: string
    professionStyle?: string
    sideDetails?: string
    facialFeatures?: string
    elementEffects?: string
  }
}
```

### 5.3 BattleRound

One battle round record = one action.

```ts
export type BattleRound = {
  roundNumber: number
  actorPetId: string
  targetPetId: string

  actorRoll: number
  targetRoll?: number

  actionType: "basic_attack" | "ability" | "counter"
  hitResult: "hit" | "miss" | "dodge" | "crit"
  damage: number

  hpBeforeTarget: number
  hpAfterTarget: number

  abilityUsed?: boolean
  abilityName?: string

  statusApplied?: {
    type: "stun" | "burn" | "shield" | "slow"
    value: number
    duration?: number
  }

  narrationText: string
}
```

### 5.4 BattleResult

```ts
export type BattleResult = {
  winnerPetId: string
  loserPetId: string

  attackerRewards: {
    xpGained: number
    softCurrencyGained: number
    levelUp: boolean
    newLevel?: number
    attributePointsGained?: number
  }

  defenderRewards: {
    xpGained: number
    softCurrencyGained: number
    levelUp: boolean
    newLevel?: number
    attributePointsGained?: number
    passiveParticipationXp?: boolean
  }

  finalSummaryText: string
}
```

---

## 6. Battle page states

Frontend state machine:

```ts
export type BattleScreenState =
  | "loading"
  | "intro"
  | "round_playback"
  | "battle_finished"
  | "error"
```

### loading
Shown while fetching battle payload.

### intro
Short pre-battle reveal with both pets.

### round_playback
Rounds appear one by one.

### battle_finished
Show winner and rewards.

### error
Show fallback UI if request failed or payload is invalid.

---

## 7. Battle page UI structure

### 7.1 Top area

Must show:

- attacker avatar, name, rarity, level
- defender avatar, name, rarity, level
- current round indicator

Recommended structure:

```txt
[Attacker Card]   VS   [Defender Card]
Round: 2 / 6
```

Each fighter card should include:

- image
- name
- type
- rarity badge
- HP bar
- current HP / max HP

Optional small row:

- power name
- short trait labels

### 7.2 Middle area: battle log

Scrollable vertical feed.

Each round appends one log card.

Each log card must show:

- round number
- actor name
- action label
- narration text
- result chip: HIT / MISS / DODGE / CRIT / ABILITY
- damage dealt
- HP change

Example:

```txt
Round 3
Meow Blockbuster uses Robotic Eyes

Meow Blockbuster fixes its robotic stare on the opponent and releases a violent burst of crypto-charged force.

CRIT
Damage: 12
Froggy Mage HP: 41 → 29
```

### 7.3 Bottom action area

During playback:

- Pause / Resume
- Skip to result

After playback:

- Back to dashboard
- View pet
- Fight again

---

## 8. Frontend behavior

### 8.1 On page load

Frontend does:

```ts
GET /api/battles/:battleId
```

If response says `status === "generating"`:

- show “Preparing battle...”
- poll every 1 second
- stop after timeout, e.g. 20 seconds

If response says `status === "ready"`:

- preload both pet images
- render intro state
- start playback automatically after a short delay

### 8.2 Playback model

Frontend must not call AI during playback.

All narration must already be stored in:

```ts
rounds[].narrationText
```

Playback logic:

1. initialize displayed HP from battle payload
2. for each round in order:
   - highlight acting pet
   - wait short delay
   - append new log card
   - animate target HP bar to new value
   - wait before next round
3. if target HP reaches 0, stop playback
4. show result state

Suggested timings:

```ts
const INTRO_DELAY = 1500
const ROUND_START_DELAY = 400
const LOG_REVEAL_DELAY = 500
const HP_ANIMATION_DURATION = 700
const ROUND_END_DELAY = 700
```

---

## 9. Backend battle generation flow

### Step 1. Load pet snapshots

Load both pets and freeze battle snapshots.

### Step 2. Compute derived stats

For each pet:

```ts
maxHp = 40 + stamina * 12 + level * 3
attackBase = strength * 2 + level
defenseBase = stamina + Math.floor(agility / 2)
critChance = 0.05 + intelligence * 0.01
dodgeChance = agility * 0.025
initiativeScore = agility + intelligence * 0.5
```

These are MVP formulas and can be tuned later.

### Step 3. Decide first attacker

- higher initiative starts
- if tied, random

### Step 4. Run turn simulation

Alternate turns until:

- one pet HP <= 0
- or max action count reached

### Step 5. Create structured round events

Each action becomes one `BattleRound`.

### Step 6. Generate narration text

AI receives structured events and returns narration for every round.

### Step 7. Calculate rewards

Apply XP and soft currency rewards.

### Step 8. Persist battle

Save battle record and return `battleId`.

---

## 10. MVP combat logic

### 10.1 Constraints

For MVP:

- each pet starts fully healed
- no persistent HP between battles
- each pet can use selected power only once per battle
- battle ends on KO or max action count
- no battle location or arena exists in MVP

### 10.2 Turn resolution order

For each action:

1. choose acting pet
2. check if pet should use ability this turn
3. roll attack
4. check dodge
5. check crit
6. compute damage
7. apply status effects if needed
8. reduce target HP
9. record round event
10. move to next turn

### 10.3 Hit logic

```ts
attackRoll = randomInt(1, 20)
attackScore = attackRoll + attacker.attackBase

defenseScore = 10 + defender.defenseBase
```

Rules:

- if `attackRoll === 1` => automatic miss
- if `attackRoll === 20` => automatic crit
- else if `randomFloat() < defender.dodgeChance` => dodge
- else if `attackScore >= defenseScore` => hit
- else => miss

### 10.4 Damage logic

For normal hit:

```ts
baseDamage = attacker.attackBase + randomInt(1, 4) - defender.defenseBase
damage = Math.max(1, baseDamage)
```

For crit:

```ts
damage = Math.max(2, Math.floor(baseDamage * 1.75))
```

For miss or dodge:

```ts
damage = 0
```

### 10.5 Ability usage logic

Each pet may use its selected power only once.

For MVP keep decision logic deterministic and simple:

- if pet has defensive ability and HP < 60%, use it
- otherwise if pet has offensive ability, use it on its 2nd or 3rd action
- if battle ends earlier, ability may never be used

Track usage with:

```ts
abilityUsedByPet[petId] = true
```

### 10.6 Supported normalized ability effects

Do not let LLM invent mechanics from raw power text.
Selected power must be normalized into one supported effect type.

Recommended effect types:

```txt
direct_damage
shield
stun
crit_boost
heal
dot
```

For first MVP, safest subset is:

```txt
direct_damage
shield
stun
```

### 10.7 Ability implementation examples

#### direct_damage

```ts
damage = normalDamage + effectValue
```

#### shield

Actor gains a temporary shield that reduces next incoming damage by `effectValue`.

#### stun

Target loses its next action.

For first MVP, that is enough.

---

## 11. AI narration generation

### 11.1 Rules

- AI adds flavor only
- AI must not modify mechanics
- AI must not invent numbers
- AI must not change winner

### 11.2 Best MVP approach

Simulate whole battle first.
Then call AI once with all round events.

Advantages:

- fewer API calls
- more coherent narration
- easier backend implementation
- consistent tone across all rounds

### 11.3 Input to AI

Backend should send:

- fighter A identity
- fighter B identity
- both traits
- both selected powers
- list of structured round events

Example payload shape:

```json
{
  "fighterA": {
    "name": "Meow Blockbuster",
    "type": "Phoenix",
    "element": "Crypto blockchain",
    "professionStyle": "Ghostbuster",
    "topItem": "Cat ears headband",
    "selectedPower": {
      "name": "Robotic Eyes",
      "description": "Robotic eyes bind foes with crypto. POW!"
    }
  },
  "fighterB": {
    "name": "Froggy Mage",
    "type": "Panda",
    "element": "Magic",
    "professionStyle": "Mage",
    "topItem": "Ancient staff",
    "selectedPower": {
      "name": "Arcane Shield",
      "description": "A glowing shield absorbs incoming force."
    }
  },
  "events": [
    {
      "roundNumber": 1,
      "actor": "Meow Blockbuster",
      "target": "Froggy Mage",
      "actionType": "basic_attack",
      "hitResult": "hit",
      "damage": 6,
      "abilityUsed": false
    }
  ]
}
```

### 11.4 System prompt for AI narration

```txt
You are writing battle narration for a fantasy-comedy AI pet battleground game.

Your job is to convert structured combat events into short, vivid, DnD-like narration.

Rules:
- Never change battle outcome.
- Never change damage numbers, hit/miss/crit result, or who used an ability.
- Never invent extra turns or extra effects.
- Use each fighter's traits, profession style, element, and item as flavor when relevant.
- Keep each round narration to 2-3 sentences max.
- Tone should feel dramatic, playful, and readable.
- Return valid JSON only.

Return format:
{
  "rounds": [
    {
      "roundNumber": 1,
      "narrationText": "..."
    }
  ],
  "finalSummaryText": "..."
}
```

### 11.5 User prompt template

```txt
Write battle narration for the following combat log.

Fighter A:
{{fighterA_json}}

Fighter B:
{{fighterB_json}}

Combat events:
{{events_json}}

Requirements:
- Do not modify any numeric values or results.
- If hitResult is miss or dodge, make that explicit in the text.
- If abilityUsed is true, mention the ability by name.
- Make the narration feel like a DnD combat recap.
- Keep each round concise and visually descriptive.
- Return JSON only.
```

### 11.6 Fallback if AI fails

If AI response fails or JSON is malformed, backend must generate template narration.

Example fallback:

```ts
function buildFallbackNarration(
  event: BattleRound,
  actor: BattlePetSnapshot,
  target: BattlePetSnapshot
): string {
  if (event.actionType === "ability") {
    return `${actor.name} uses ${event.abilityName} and hits ${target.name} for ${event.damage} damage.`
  }

  if (event.hitResult === "dodge") {
    return `${actor.name} attacks, but ${target.name} dodges the strike.`
  }

  if (event.hitResult === "miss") {
    return `${actor.name} lunges forward, but misses the attack.`
  }

  if (event.hitResult === "crit") {
    return `${actor.name} lands a critical hit on ${target.name}, dealing ${event.damage} damage.`
  }

  return `${actor.name} hits ${target.name} for ${event.damage} damage.`
}
```

Fallback is required.

---

## 12. API design

### 12.1 Create battle

```http
POST /api/battles
```

Request:

```json
{
  "attackerPetId": "pet_123",
  "defenderPetId": "pet_456"
}
```

Response:

```json
{
  "battleId": "battle_789",
  "status": "generating"
}
```

Backend responsibilities:

- validate pets exist
- validate attacker still has daily battle usage available
- simulate fight
- generate narration
- persist result
- return battle id

### 12.2 Get battle

```http
GET /api/battles/:battleId
```

Response:

```json
{
  "id": "battle_789",
  "status": "ready",
  "attacker": { ... },
  "defender": { ... },
  "startingHp": {
    "attacker": 76,
    "defender": 82
  },
  "rounds": [ ... ],
  "result": { ... }
}
```

---

## 13. Daily battle limits

For MVP, recommended model:

- battle limit is **account-level**
- not per pet
- example: `3 battles per day per wallet`

Why:

- easier to balance
- easier to explain
- prevents scaling too hard with multiple pets

Validation on `POST /api/battles`:

- count battles initiated by this wallet today
- reject if limit exceeded

Example error:

```json
{
  "error": "DAILY_BATTLE_LIMIT_REACHED",
  "message": "You have used all battles for today."
}
```

Passive defender may still receive small XP if randomly chosen.

---

## 14. Reward logic for MVP

Recommended reward model:

### Initiator / attacker

- win: higher XP + soft currency
- lose: lower XP + lower soft currency

### Passive defender

- if randomly selected and used in another player’s battle:
  - gets small passive XP only
  - gets no soft currency

Example:

```ts
if (attackerWins) {
  attackerXp = 20
  attackerCoins = 8
  defenderXp = 4
}

if (defenderWins) {
  attackerXp = 8
  attackerCoins = 3
  defenderXp = 6
}
```

This supports passive participation XP without making passive farming too strong.

---

## 15. Result screen requirements

When playback ends, UI must show:

- winner banner
- both fighter cards
- final HP state
- rewards for attacker
- passive XP for defender if applicable
- level-up indicator if triggered
- final battle summary

Example:

```txt
Victory
Meow Blockbuster defeated Froggy Mage

Meow Blockbuster:
+20 XP
+8 Arena Coins

Froggy Mage:
+4 Passive XP
```

If level-up happened:

```txt
Level Up!
Meow Blockbuster reached Level 3
+1 attribute point available
```

---

## 16. Notifications integration

If passive defender was selected while owner was offline, create notification.

```ts
export type Notification = {
  id: string
  wallet: string
  type: "pet_was_challenged"
  petId: string
  battleId: string
  title: string
  body: string
  createdAt: string
  isRead: boolean
}
```

Example body:

```txt
Your pet Froggy Mage was challenged and earned +4 passive XP.
```

---

## 17. Animation guidance for frontend

MVP does not need cinematic animation.

Enough:

- active pet card glows on turn
- new log card fades in
- target HP bar animates down
- crit result shakes slightly
- ability action gets highlight
- final result fades in

No sprite combat needed.

---

## 18. Edge cases

Codex must handle:

### Case 1. Battle generation failed
Show error state and retry button.

### Case 2. AI narration malformed
Use fallback template narration.

### Case 3. Battle ends before max rounds
Stop playback immediately after KO.

### Case 4. Both pets alive after max action count
Winner resolution:

1. higher remaining HP wins
2. if tied, higher total dealt damage wins
3. if tied, random tiebreaker or initiative winner

Pick one deterministic rule and keep it stable.

### Case 5. Passive defender levels up
Include it in result payload and create notification.

---

## 19. Implementation summary for Codex

Codex should implement:

### Backend

1. battle creation endpoint
2. combat simulator
3. ability effect resolver
4. AI narration generator
5. fallback narration builder
6. reward calculator
7. notification creator
8. battle fetch endpoint

### Frontend

1. `/battle/:battleId` page
2. loading state
3. intro state
4. round playback
5. HP animation
6. battle log cards
7. skip button
8. result block
9. error state

---

## 20. Minimal recommended JSON response

```json
{
  "id": "battle_789",
  "status": "ready",
  "attacker": {
    "id": "pet_1",
    "name": "Meow Blockbuster",
    "imageUrl": "/pets/1.png",
    "rarity": "rare",
    "level": 2,
    "maxHp": 76
  },
  "defender": {
    "id": "pet_2",
    "name": "Froggy Mage",
    "imageUrl": "/pets/2.png",
    "rarity": "rare",
    "level": 2,
    "maxHp": 82
  },
  "rounds": [
    {
      "roundNumber": 1,
      "actorPetId": "pet_1",
      "targetPetId": "pet_2",
      "actionType": "basic_attack",
      "hitResult": "hit",
      "damage": 6,
      "hpBeforeTarget": 82,
      "hpAfterTarget": 76,
      "abilityUsed": false,
      "narrationText": "Meow Blockbuster bursts forward and strikes first, forcing Froggy Mage back with a sharp, well-timed attack."
    }
  ],
  "result": {
    "winnerPetId": "pet_1",
    "attackerRewards": {
      "xpGained": 20,
      "softCurrencyGained": 8,
      "levelUp": false
    },
    "defenderRewards": {
      "xpGained": 4,
      "softCurrencyGained": 0,
      "levelUp": false,
      "passiveParticipationXp": true
    },
    "finalSummaryText": "Meow Blockbuster outlasted Froggy Mage after a short but intense clash."
  }
}
```

---

## 21. Final implementation rule

This separation must always stay true:

```txt
Backend decides the fight.
AI describes the fight.
Frontend replays the fight.
```
