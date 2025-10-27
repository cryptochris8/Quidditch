# Hytopia Quidditch - Complete Game Guide

## Overview

A fully functional Quidditch game for HYTOPIA featuring:
- **4 Teams**: Gryffindor, Slytherin, Ravenclaw, Hufflepuff
- **3 Ball Types**: Quaffle (scoring), Bludgers (knockback), Golden Snitch (game-ender)
- **Auto-balancing**: Players are automatically assigned to the team with fewest members
- **Goal Detection**: Goals are automatically detected from the arena map
- **Real-time Physics**: Custom physics for ball movement and player interactions

## How to Run

```bash
# Install dependencies (if not already done)
npm install

# Start the game server
npx hytopia dev
```

## Game Mechanics

### Teams & Scoring

**Teams:**
- **Gryffindor** (Red) - Spawns West
- **Slytherin** (Green) - Spawns East
- **Ravenclaw** (Blue) - Spawns North
- **Hufflepuff** (Yellow) - Spawns South

**Scoring:**
- Quaffle through goal hoop: **+10 points**
- Catching the Golden Snitch: **+150 points** (ends game)

### Ball Behaviors

**Quaffle (Yellow):**
- Can be picked up and thrown
- Score by flying through goal hoops while carrying it
- Resets to center after scoring

**Bludgers (Black - 2 total):**
- Autonomous AI that seeks nearest player
- Knockback on contact (28 units of force)
- Stuns player for 800ms
- Causes player to drop any carried ball

**Golden Snitch (Gold):**
- Erratic, fast movement pattern
- Very difficult to catch
- Capturing it awards 150 points and ends the match

### Player Controls

**Movement (True Flying Physics):**
- `WASD` - Fly in horizontal directions (no gravity!)
- `Space` - Ascend / Jump upward
- `Shift + WASD` - Fly faster (turbo mode)
- Players have **zero gravity** - you fly freely like on a broomstick!

**Actions:**
- `/pickup` or `/throw` - Pick up nearby ball or throw carried ball
- `/rocket` - Easter egg: Launch yourself upward

**Mobile Controls:**
- Touch buttons in bottom-right corner
- Interact button (target icon)
- Jump button

### Game Flow

1. **Join** - Players connect and are auto-assigned to a team
2. **Spawn** - Players spawn at their team's designated position (60 blocks up)
3. **Play** - Grab the Quaffle, avoid Bludgers, score goals
4. **Win** - First team to catch the Snitch or highest score when Snitch is caught

## Technical Details

### Architecture

**Main Components:**
- `BallEntity` - Base class for all balls with physics
- `QuaffleEntity` - Scoring ball
- `BludgerEntity` - AI-controlled hazard with player-seeking
- `SnitchEntity` - Erratic end-game ball
- `QuidditchPlayerEntity` - Custom player with team assignment

**Physics Configuration:**
```typescript
{
  // Ball physics
  maxSpeed: 22,
  accel: 45,
  lift: 30,
  gravity: 16,
  drag: 0.08,
  bludgerKnockback: 28,
  stunMs: 800,

  // Player physics (TRUE FLYING)
  gravityScale: 0,      // Zero gravity - free flight!
  jumpVelocity: 20,     // Upward thrust
  walkVelocity: 12,     // Normal flying speed
  runVelocity: 22       // Turbo flying speed
}
```

**Game Loop:**
- Runs at 60 FPS (16.67ms tick rate)
- Updates ball physics
- Checks goal scoring
- Detects Bludger collisions
- Monitors Snitch capture

### Arena System

The game automatically:
- Parses `quidditch-arena.json` for block data
- Finds all "Gold Hoop" blocks (ID 7) as goal positions
- Deduplicates nearby blocks into single goal zones (3.5 block radius)
- Calculates arena bounds for team spawn placement
- Centers balls in the middle of the arena

**Current Arena Stats:**
- Bounds: Automatically calculated from map blocks
- Goals: Extracted from Gold Hoop blocks in the map
- Teams spawn 40 blocks from center in cardinal directions

## Commands

- `/pickup` - Pick up nearby Quaffle or Snitch (3 block range)
- `/throw` - Throw carried ball in facing direction (26 units/s)
- `/rocket` - Launch yourself upward with 25 units of force

## Development Notes

### Ball Models

Currently using Hytopia asset library models:
- **Quaffle**: `models/items/snowball.gltf` (scale 1.5) - White snowball for scoring
- **Bludger**: `models/projectiles/energy-orb-projectile.gltf` (scale 1.2) - Energy orb with glow
- **Snitch**: `models/projectiles/fireball.gltf` (scale 0.8) - Golden fireball sphere

**To add custom models:**
1. Place `.gltf` models in `assets/models/balls/`
2. Update model URIs in `BallEntity` constructor (line 79-81)

### Extending the Game

**Add Power-ups:**
```typescript
class PowerUpEntity extends Entity {
  // Extend with special abilities
}
```

**Custom Team Colors:**
Edit team definitions in `createTeams()` function (line 244-249)

**Adjust Physics:**
Modify `PHYSICS` constants (line 51-58)

**Add Roles (Seeker, Beater, Chaser):**
Extend `QuidditchPlayerState` interface with role property

## Troubleshooting

**Balls not spawning:**
- Check console for "Quidditch game server started!" message
- Verify arena JSON loaded successfully
- Check bounds calculation output

**Goals not detecting:**
- Ensure Gold Hoop blocks (ID 7) exist in arena map
- Goal radius is 3.5 blocks - adjust in `extractGoals()` if needed

**Players falling through floor:**
- Floor collision set to Y=55
- Adjust in `BallEntity.updatePhysics()` if arena has different Y level

**TypeScript errors:**
```bash
npm install --save-dev @types/ws @types/node
```

## Performance Optimization

**Current Performance:**
- 4 ball entities (low overhead)
- Distance checks: O(players × balls) - negligible until 100+ players
- 60 FPS game loop
- Arena loaded once at startup

**Potential Bottlenecks:**
- Large arena JSON (133k lines) - only affects initial load
- Multiple concurrent Snitch captures - handled with early break

## Future Enhancements

- [ ] Role selection (Seeker, Beater, Chaser, Keeper)
- [ ] Match timer with sudden death
- [ ] Replay system
- [ ] Team cosmetics (colored uniforms)
- [ ] Broom models for players
- [ ] Beater bat swing mechanic (deflect Bludgers)
- [ ] Keeper AI for goal defense
- [ ] Tournament bracket system
- [ ] Spectator mode
- [ ] Match statistics (goals, catches, knockouts)

## Credits

Built with the HYTOPIA SDK v0.10.34
Arena: Custom-built Quidditch pitch with team-colored stands

---

**Have fun playing Quidditch!** ⚡🧹
