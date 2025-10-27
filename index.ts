/**
 * HYTOPIA Quidditch Game
 *
 * A full-featured Quidditch game implementation for HYTOPIA.
 * Features team-based aerial gameplay with Quaffles, Bludgers, and the Golden Snitch.
 */

import {
  startServer,
  Audio,
  Entity,
  DefaultPlayerEntity,
  PlayerEvent,
  BaseEntityControllerEvent,
  type World,
  type Player,
} from 'hytopia';

const quidditchArena = require('./assets/maps/quidditch-arena.json');

// ========================= TYPES =========================

type Vec3 = { x: number; y: number; z: number };
type EntityId = string;

interface Team {
  id: string;
  name: string;
  color: string;
  spawn: Vec3;
  score: number;
}

interface QuidditchPlayerState {
  entity: DefaultPlayerEntity;
  teamId: string;
  stamina: number;
  stunnedUntil: number;
  carryingBall?: BallEntity;
  broomstick?: Entity; // Visual broomstick attachment
}

interface GoalZone {
  center: Vec3;
  radius: number;
  teamId?: string;
}

// ========================= CONFIG =========================

const PHYSICS = {
  maxSpeed: 22,
  accel: 45,
  lift: 30,
  gravity: 16,
  drag: 0.08,
  bludgerKnockback: 28,
  stunMs: 800,
};

const FLYING_SPEED = {
  vertical: 15,  // Speed for ascending/descending
  horizontal: 12,
  turbo: 22,
};

const SCORE_QUAFFLE = 10;
const SCORE_SNITCH = 150;
const GOAL_BLOCK_ID = 7; // Gold Hoop from arena

// ========================= WORLD STATE =========================

const quidditchPlayers = new Map<string, QuidditchPlayerState>();
let teams: Team[] = [];
let goals: GoalZone[] = [];
let gameWorld: World;

// ========================= BALL ENTITIES =========================

class BallEntity extends Entity {
  kind: 'quaffle' | 'bludger' | 'snitch';
  velocity: Vec3 = { x: 0, y: 0, z: 0 };
  owner?: QuidditchPlayerState;

  constructor(kind: 'quaffle' | 'bludger' | 'snitch', world: World, position: Vec3) {
    // Use different model URIs based on ball type from Hytopia assets
    const modelUri = kind === 'quaffle' ? 'models/items/snowball.gltf' :
                     kind === 'bludger' ? 'models/projectiles/energy-orb-projectile.gltf' :
                     'models/projectiles/fireball.gltf';

    const scale = kind === 'quaffle' ? 1.5 : kind === 'bludger' ? 1.2 : 0.8;

    super({
      modelUri,
      modelLoopedAnimations: kind === 'snitch' ? ['idle'] : [],
      modelScale: scale,
      name: kind.charAt(0).toUpperCase() + kind.slice(1),
    });

    this.kind = kind;
    this.spawn(world, position);

    console.log(`✨ Spawned ${kind} at position:`, position);
  }

  updatePhysics(dt: number) {
    if (this.owner) {
      // Ball is carried - stick to player
      const ownerPos = this.owner.entity.position;
      this.setPosition({ x: ownerPos.x, y: ownerPos.y + 2, z: ownerPos.z });
      return;
    }

    // Apply gravity and drag
    this.velocity.y -= PHYSICS.gravity * dt;
    this.velocity.x *= (1 - PHYSICS.drag);
    this.velocity.y *= (1 - PHYSICS.drag);
    this.velocity.z *= (1 - PHYSICS.drag);

    // Update position
    const newPos = {
      x: this.position.x + this.velocity.x * dt,
      y: this.position.y + this.velocity.y * dt,
      z: this.position.z + this.velocity.z * dt,
    };

    // Floor collision (simple) - use arena floor level
    if (newPos.y < 51) {
      newPos.y = 51;
      this.velocity.y = Math.abs(this.velocity.y) * 0.5; // Bounce
    }

    this.setPosition(newPos);
  }

  applyImpulse(impulse: Vec3) {
    this.velocity.x += impulse.x;
    this.velocity.y += impulse.y;
    this.velocity.z += impulse.z;
  }
}

class QuaffleEntity extends BallEntity {
  constructor(world: World, position: Vec3) {
    super('quaffle', world, position);
  }
}

class BludgerEntity extends BallEntity {
  constructor(world: World, position: Vec3) {
    super('bludger', world, position);
  }

  updatePhysics(dt: number) {
    super.updatePhysics(dt);

    if (this.owner) return;

    // Seek nearest player
    const target = findNearestPlayer(this.position);
    if (target) {
      const dir = normalize(subtract(target.entity.position, this.position));
      const speed = 12;
      this.velocity.x += dir.x * speed * dt;
      this.velocity.y += dir.y * speed * dt;
      this.velocity.z += dir.z * speed * dt;
    }
  }
}

class SnitchEntity extends BallEntity {
  private startTime: number = Date.now();

  constructor(world: World, position: Vec3) {
    super('snitch', world, position);
  }

  updatePhysics(dt: number) {
    super.updatePhysics(dt);

    if (this.owner) return;

    // Erratic movement
    const t = (Date.now() - this.startTime) / 1000;
    this.velocity.x += Math.sin(t * 5) * 3 * dt;
    this.velocity.y += Math.cos(t * 7) * 4 * dt;
    this.velocity.z += Math.sin(t * 6) * 3 * dt;
  }
}

// ========================= PLAYER HELPERS =========================

// We'll track team assignment separately in QuidditchPlayerState
// and use DefaultPlayerEntity directly

// ========================= ARENA HELPERS =========================

function parseBlockKey(key: string): Vec3 {
  const [x, y, z] = key.split(',').map(Number);
  return { x, y, z };
}

function extractGoals(arena: any): GoalZone[] {
  const goalPositions: Vec3[] = [];

  for (const [key, blockId] of Object.entries(arena.blocks)) {
    if (blockId === GOAL_BLOCK_ID) {
      goalPositions.push(parseBlockKey(key));
    }
  }

  // Deduplicate close positions (goals are clusters of blocks)
  const uniqueGoals: Vec3[] = [];
  for (const pos of goalPositions) {
    if (!uniqueGoals.some(g => distance(g, pos) < 5)) {
      uniqueGoals.push(pos);
    }
  }

  return uniqueGoals.map(center => ({ center, radius: 3.5 }));
}

function calculateArenaBounds(arena: any) {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const key of Object.keys(arena.blocks)) {
    const { x, y, z } = parseBlockKey(key);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }

  return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } };
}

function createTeams(bounds: { min: Vec3; max: Vec3 }): Team[] {
  // Use pitch center based on goal positions, not arena bounds
  // Goals are at X=-75 and X=+75, Z range ~145-175
  const pitchCenterX = 0;
  const pitchCenterZ = 160;
  const y = 70; // Spawn at reasonable flying height

  return [
    { id: 'gry', name: 'Gryffindor', color: '#B31B1B', spawn: { x: -40, y, z: pitchCenterZ }, score: 0 },
    { id: 'sly', name: 'Slytherin', color: '#2E7D32', spawn: { x: 40, y, z: pitchCenterZ }, score: 0 },
    { id: 'rav', name: 'Ravenclaw', color: '#0D47A1', spawn: { x: pitchCenterX, y, z: 125 }, score: 0 },
    { id: 'huf', name: 'Hufflepuff', color: '#FBC02D', spawn: { x: pitchCenterX, y, z: 195 }, score: 0 },
  ];
}

// ========================= GAME LOGIC =========================

let balls: BallEntity[] = [];

function spawnBalls(world: World, bounds: { min: Vec3; max: Vec3 }) {
  // Spawn balls at pitch center, not arena bounds center
  const pitchCenterX = 0;
  const pitchCenterZ = 160;
  const baseY = 75; // Spawn at mid-air height

  balls.push(new QuaffleEntity(world, { x: pitchCenterX, y: baseY, z: pitchCenterZ }));
  balls.push(new BludgerEntity(world, { x: pitchCenterX - 10, y: baseY + 2, z: pitchCenterZ }));
  balls.push(new BludgerEntity(world, { x: pitchCenterX + 10, y: baseY + 4, z: pitchCenterZ }));
  balls.push(new SnitchEntity(world, { x: pitchCenterX, y: baseY + 6, z: pitchCenterZ }));
}

function gameLoop(dt: number) {
  const nowMs = Date.now();

  // Update all balls
  for (const ball of balls) {
    ball.updatePhysics(dt);
  }

  // Check interactions
  checkGoalScoring(nowMs);
  checkBludgerHits(nowMs);
  checkSnitchCapture(nowMs);
}

function checkGoalScoring(nowMs: number) {
  for (const [playerId, playerState] of quidditchPlayers.entries()) {
    if (!playerState.carryingBall || playerState.carryingBall.kind !== 'quaffle') continue;

    const playerPos = playerState.entity.position;

    for (const goal of goals) {
      if (distance(playerPos, goal.center) < goal.radius) {
        const team = teams.find(t => t.id === playerState.teamId);
        if (team) {
          team.score += SCORE_QUAFFLE;
          announce(`${team.name} scored! +${SCORE_QUAFFLE} points`);

          // Reset quaffle
          const ball = playerState.carryingBall;
          if (ball) {
            ball.owner = undefined;
            const bounds = calculateArenaBounds(quidditchArena);
            const cx = (bounds.min.x + bounds.max.x) / 2;
            const cz = (bounds.min.z + bounds.max.z) / 2;
            ball.setPosition({ x: cx, y: bounds.min.y + 78, z: cz });
            ball.velocity = { x: 0, y: 0, z: 0 };
            playerState.carryingBall = undefined;
          }

          broadcastScoreboard();
        }
      }
    }
  }
}

function checkBludgerHits(nowMs: number) {
  for (const ball of balls) {
    if (ball.kind !== 'bludger' || ball.owner) continue;

    for (const [playerId, playerState] of quidditchPlayers.entries()) {
      if (nowMs < playerState.stunnedUntil) continue;

      const playerPos = playerState.entity.position;
      if (distance(ball.position, playerPos) < 2.0) {
        // Apply knockback
        const dir = normalize(subtract(playerPos, ball.position));
        playerState.entity.applyImpulse({
          x: dir.x * PHYSICS.bludgerKnockback,
          y: 6,
          z: dir.z * PHYSICS.bludgerKnockback,
        });

        playerState.stunnedUntil = nowMs + PHYSICS.stunMs;

        // Drop carried ball
        if (playerState.carryingBall) {
          playerState.carryingBall.owner = undefined;
          playerState.carryingBall.velocity = { x: dir.x * 10, y: 4, z: dir.z * 10 };
          playerState.carryingBall = undefined;
        }

        announce(`${playerState.entity.name} was hit by a Bludger!`);
      }
    }
  }
}

function checkSnitchCapture(nowMs: number) {
  const snitch = balls.find(b => b.kind === 'snitch');
  if (!snitch || snitch.owner) return;

  for (const [playerId, playerState] of quidditchPlayers.entries()) {
    const playerPos = playerState.entity.position;

    if (distance(snitch.position, playerPos) < 2.0) {
      const team = teams.find(t => t.id === playerState.teamId);
      if (team) {
        team.score += SCORE_SNITCH;
        announce(`${playerState.entity.name} caught the Golden Snitch! ${team.name} wins with ${team.score} points!`);

        snitch.despawn();
        broadcastScoreboard();

        // End game logic here (optional)
      }
      break;
    }
  }
}

function handlePlayerInteract(playerId: string) {
  const playerState = quidditchPlayers.get(playerId);
  if (!playerState || Date.now() < playerState.stunnedUntil) return;

  if (!playerState.carryingBall) {
    // Try to pick up a ball
    const playerPos = playerState.entity.position;
    const nearbyBall = balls.find(b =>
      !b.owner &&
      (b.kind === 'quaffle' || b.kind === 'snitch') &&
      distance(b.position, playerPos) < 3.0
    );

    if (nearbyBall) {
      nearbyBall.owner = playerState;
      playerState.carryingBall = nearbyBall;
      announce(`${playerState.entity.name} picked up the ${nearbyBall.kind}!`);
    }
  } else {
    // Throw the ball
    const ball = playerState.carryingBall;
    ball.owner = undefined;

    // Get throw direction from player's facing direction
    const throwPower = 26;
    const facing = playerState.entity.rotation;
    const dir = {
      x: Math.sin(facing.y) * Math.cos(facing.x),
      y: Math.sin(facing.x) + 0.2,
      z: Math.cos(facing.y) * Math.cos(facing.x),
    };

    ball.velocity = {
      x: dir.x * throwPower,
      y: dir.y * throwPower,
      z: dir.z * throwPower,
    };

    playerState.carryingBall = undefined;
    announce(`${playerState.entity.name} threw the ${ball.kind}!`);
  }
}

// ========================= TEAM & UI =========================

function autoAssignTeam(): Team {
  const counts = new Map<string, number>();
  teams.forEach(t => counts.set(t.id, 0));
  quidditchPlayers.forEach(p => counts.set(p.teamId, (counts.get(p.teamId) || 0) + 1));

  let bestTeam = teams[0];
  let minCount = Infinity;

  for (const team of teams) {
    const count = counts.get(team.id) || 0;
    if (count < minCount) {
      minCount = count;
      bestTeam = team;
    }
  }

  return bestTeam;
}

function broadcastScoreboard() {
  const scoreText = teams.map(t => `${t.name}: ${t.score}`).join(' | ');
  announce(`⚡ SCORES: ${scoreText}`);
}

function announce(message: string) {
  // Broadcast to all players
  for (const [playerId, playerState] of quidditchPlayers.entries()) {
    gameWorld.chatManager.sendPlayerMessage(playerState.entity.player, message);
  }
}

// ========================= MATH HELPERS =========================

function subtract(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function length(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z);
}

function normalize(v: Vec3): Vec3 {
  const len = length(v) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function findNearestPlayer(pos: Vec3): QuidditchPlayerState | undefined {
  let nearest: QuidditchPlayerState | undefined;
  let minDist = Infinity;

  for (const playerState of quidditchPlayers.values()) {
    const dist = distance(pos, playerState.entity.position);
    if (dist < minDist) {
      minDist = dist;
      nearest = playerState;
    }
  }

  return nearest;
}

// ========================= SERVER START =========================

startServer(world => {
  gameWorld = world;

  // Load the Quidditch arena
  world.loadMap(quidditchArena);

  // Initialize game
  const bounds = calculateArenaBounds(quidditchArena);
  goals = extractGoals(quidditchArena);
  teams = createTeams(bounds);

  console.log(`🏟️  Quidditch Arena loaded!`);
  console.log(`   Bounds: ${JSON.stringify(bounds)}`);
  console.log(`   Goals found: ${goals.length}`);
  console.log(`   Teams: ${teams.map(t => t.name).join(', ')}`);

  // Spawn balls
  spawnBalls(world, bounds);

  // Game loop (60 FPS)
  const tickRate = 1000 / 60;
  setInterval(() => gameLoop(tickRate / 1000), tickRate);

  // Handle player join
  world.on(PlayerEvent.JOINED_WORLD, ({ player }) => {
    const team = autoAssignTeam();
    const playerName = `Player${player.id}`;

    const playerEntity = new DefaultPlayerEntity({
      player,
      name: playerName,
    });

    playerEntity.spawn(world, team.spawn);

    // Enable TRUE FLYING mode for Quidditch - disable gravity!
    playerEntity.setGravityScale(0); // No gravity - players can fly freely

    // Enhanced movement speeds for broomstick flying
    playerEntity.controller.jumpVelocity = 20;  // Space key for upward thrust
    playerEntity.controller.walkVelocity = FLYING_SPEED.horizontal;  // WASD horizontal movement
    playerEntity.controller.runVelocity = FLYING_SPEED.turbo;   // Shift + WASD for faster flying

    // Custom vertical flight controls (Space to ascend, Ctrl to descend)
    playerEntity.controller.on(BaseEntityControllerEvent.TICK_WITH_PLAYER_INPUT, ({ input }) => {
      // Space key - fly upward
      if (input.space) {
        const upwardForce = FLYING_SPEED.vertical * playerEntity.mass;
        playerEntity.applyImpulse({ x: 0, y: upwardForce, z: 0 });
      }
      // Ctrl key - fly downward
      else if (input.ctrl) {
        const downwardForce = -FLYING_SPEED.vertical * playerEntity.mass;
        playerEntity.applyImpulse({ x: 0, y: downwardForce, z: 0 });
      }
    });

    // Attach broomstick visual
    const broomstick = new Entity({
      modelUri: 'models/items/fishing-rod.gltf',
      modelScale: 1.2,
      parent: playerEntity,
      name: 'Broomstick',
    });
    broomstick.spawn(world, { x: 0, y: 0, z: 0 });
    // Position and rotate the broom to look like player is riding it
    broomstick.setPosition({ x: 0, y: -0.5, z: 0 });
    broomstick.setRotation({ x: 0, y: 1.57, z: 0 }); // 90 degrees rotation

    console.log(`👤 Spawned ${playerName} for team ${team.name} at:`, team.spawn);

    quidditchPlayers.set(player.id, {
      entity: playerEntity,
      teamId: team.id,
      stamina: 1,
      stunnedUntil: 0,
      broomstick,
    });

    // Load UI
    player.ui.load('ui/index.html');

    // Welcome messages (remove # from hex colors)
    const colorHex = team.color.replace('#', '');
    world.chatManager.sendPlayerMessage(player, `🧙 Welcome to Quidditch!`, colorHex);
    world.chatManager.sendPlayerMessage(player, `You've been assigned to ${team.name}!`, colorHex);
    world.chatManager.sendPlayerMessage(player, 'Controls: WASD to fly, Space=UP, Ctrl=DOWN, Shift=TURBO');
    world.chatManager.sendPlayerMessage(player, 'Use /pickup or /throw to grab and toss balls!');

    announce(`${playerName} joined ${team.name}!`);
    broadcastScoreboard();
  });

  // Handle player leave
  world.on(PlayerEvent.LEFT_WORLD, ({ player }) => {
    const playerState = quidditchPlayers.get(player.id);
    if (playerState) {
      // Drop any carried ball
      if (playerState.carryingBall) {
        playerState.carryingBall.owner = undefined;
      }

      playerState.entity.despawn();
      quidditchPlayers.delete(player.id);
    }
  });

  // Register interact command
  world.chatManager.registerCommand('/pickup', player => handlePlayerInteract(player.id));
  world.chatManager.registerCommand('/throw', player => handlePlayerInteract(player.id));

  // Easter egg
  world.chatManager.registerCommand('/rocket', player => {
    const playerState = quidditchPlayers.get(player.id);
    if (playerState) {
      playerState.entity.applyImpulse({ x: 0, y: 25, z: 0 });
    }
  });

  // Play ambient music
  new Audio({
    uri: 'audio/music/hytopia-main.mp3',
    loop: true,
    volume: 0.1,
  }).play(world);

  console.log('🎮 Quidditch game server started!');
});
