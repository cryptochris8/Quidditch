# Hysports **SkyBall** (Quidditch‑style) — Prototype

A lightweight prototype for a Quidditch‑style aerial sport built for Hytopia.  
This repo includes a simple server‑side game loop, entity definitions for a **Quaffle**, **Bludgers**, and a **Snitch**, plus logic to **auto‑detect goal hoops** from your uploaded arena JSON.

> ⚠️ **Note:** Hytopia’s SDK APIs evolve. The code in `src/game.ts` is deliberately written with clear adapter functions (e.g., `spawnEntity`, `onPlayerInput`) that you can map to the exact SDK calls in your version. Treat it as a working blueprint you can paste into Cursor/Claude Code and wire to the current Hytopia APIs.

---

## Quickstart

1. **Install deps (TypeScript & node types):**
   ```bash
   npm init -y
   npm i -D typescript @types/node
   npx tsc --init
   ```

2. **Add your arena JSON:**
   - Use the provided `quidditch-arena.json` at the project root (already copied here if you uploaded it).
   - If you have a newer export, replace this file with your latest.

3. **Build:**
   ```bash
   npx tsc
   ```

4. **Run (example):**
   - Integrate `dist/src/game.js` with your Hytopia game server bootstrap.
   - Or import the module and call `createSkyBallGame()` as part of your world init.

---

## Controls (Suggested)
- **W/A/S/D**: Strafe/forward/back
- **Space**: Ascend
- **Shift**: Descend
- **Left‑click / E**: Interact (pickup/throw)
- **Right‑click / Q**: Beater swing (knockback when aimed at Bludger)
- **F**: Toggle broom mount (if you allow dismounting)

Bind these to your engine’s input system in `bindDefaultControls()`.

---

## How it works

- **Arena loading**: We parse `quidditch-arena.json`, scan the `blocks` and identify **Gold Hoop** blocks (`id === 7`) as **goal centers**.
- **Map bounds**: We infer world bounds from all keys in `blocks` (e.g., `x,y,z`), then place **team spawns** at the 4 cardinal edges above the pitch.
- **Entities**:
  - **Quaffle**: caught by Chasers; scoring through a goal awards points.
  - **Bludger(s)**: AI‑driven or free‑moving; collision applies knockback/stun.
  - **Snitch**: fast, erratic path; catching it ends the round and grants a large bonus.
- **Teams**: Four teams supported out of the box (Gryffindor/Slytherin/Ravenclaw/Hufflepuff theming optional). Rename to franchise teams if you prefer non‑HP branding.
- **Match flow**:
  1. Countdown → kickoff → spawn balls
  2. Timed round OR sudden‑death on Snitch capture
  3. Highest score wins; stats saved to match summary

---

## Project Layout

```
hysports-skyball/
├─ quidditch-arena.json         # Your uploaded arena (auto‑copied here)
├─ src/
│  └─ game.ts                   # Main prototype logic (entities, scoring, inputs)
└─ README.md                    # This file
```

---

## Next Steps

- Replace adapter functions with your Hytopia SDK calls.
- Hook `broadcastHUD()` to your UI layer for scores/time/team rosters.
- Add cosmetics & marketplace items (broom skins, trails, uniforms).
- Tweak physics constants in `PhysicsCfg` to your liking.
- Add matchmaking (4v4 or 5v5) and role selection (Chaser/Beater/Keeper/Seeker).

---

## License
MIT — do anything, attribution appreciated.
