// src/game.ts
// Hysports SkyBall — Quidditch‑style prototype scaffold.
// Replace the adapter methods at the bottom with your Hytopia SDK equivalents.

import * as fs from "fs";

// --------------------------- Types ---------------------------

type Vec3 = { x:number; y:number; z:number };
type EntityId = string;

interface MapData {
  blockTypes: { id:number; name:string; textureUri:string; isLiquid:boolean }[];
  // "x,y,z" -> block id
  blocks: Record<string, number>;
}

interface Team {
  id: string;
  name: string;
  color: string;
  spawn: Vec3;
  score: number;
}

interface PhysicsCfg {
  maxSpeed: number;
  accel: number;
  lift: number;
  gravity: number;
  drag: number;
  bludgerKnockback: number;
  stunMs: number;
}

interface Ball {
  id: EntityId;
  kind: "quaffle" | "bludger" | "snitch";
  pos: Vec3;
  vel: Vec3;
  owner?: EntityId; // player id when held
}

interface GoalZone {
  center: Vec3;
  radius: number;
  teamId?: string; // optional: assign sides for keeper logic
}

interface PlayerState {
  id: EntityId;
  name: string;
  teamId: string;
  pos: Vec3;
  vel: Vec3;
  mounted: boolean;
  stamina: number; // 0..1
  stunnedUntil: number; // epoch ms
  carrying?: EntityId; // ball id
}

// --------------------------- Config ---------------------------

const Physics: PhysicsCfg = {
  maxSpeed: 22,
  accel: 45,
  lift: 30,
  gravity: 16,
  drag: 0.08,
  bludgerKnockback: 28,
  stunMs: 800,
};

const SCORE_QUAFFLE = 10;
const SCORE_SNITCH  = 150;

const ARENA_PATH = `${__dirname}/../quidditch-arena.json`; // adjust if needed
const GOAL_BLOCK_ID = 7; // "Gold Hoop" from your palette

// --------------------------- World State ---------------------------

const players = new Map<EntityId, PlayerState>();
let teams: Team[] = [];
let goals: GoalZone[] = [];
let balls: Ball[] = [];
let bounds: { min: Vec3; max: Vec3 } = { min:{x:0,y:0,z:0}, max:{x:0,y:0,z:0} };

// --------------------------- Init ---------------------------

export function createSkyBallGame() {
  const map = loadArena(ARENA_PATH);
  bounds = calcBounds(map);
  goals  = extractGoals(map, GOAL_BLOCK_ID).map(c => ({ center: c, radius: 2.2 }));

  teams = makeDefaultTeams(bounds);

  // Spawn balls
  balls.push(makeBall("quaffle", midAir(bounds, 8)));
  balls.push(makeBall("bludger", midAir(bounds, 10)));
  balls.push(makeBall("bludger", midAir(bounds, 12)));
  balls.push(makeBall("snitch",  midAir(bounds, 14)));

  broadcastHUD();
}

// --------------------------- Arena Helpers ---------------------------

function loadArena(path: string): MapData {
  const raw = fs.readFileSync(path, "utf-8");
  return JSON.parse(raw);
}

function parseKey(key:string): Vec3 {
  const [x,y,z] = key.split(",").map(Number);
  return {x,y,z};
}

function calcBounds(map: MapData) {
  let min = {x: Infinity, y: Infinity, z: Infinity};
  let max = {x:-Infinity, y:-Infinity, z:-Infinity};
  for (const key of Object.keys(map.blocks)) {
    const {x,y,z} = parseKey(key);
    if (x<min.x) min.x=x; if (y<min.y) min.y=y; if (z<min.z) min.z=z;
    if (x>max.x) max.x=x; if (y>max.y) max.y=y; if (z>max.z) max.z=z;
  }
  return {min, max};
}

function extractGoals(map: MapData, blockId:number): Vec3[] {
  const out: Vec3[] = [];
  for (const [key, id] of Object.entries(map.blocks)) {
    if (id === blockId) out.push(parseKey(key));
  }
  return dedupeClosePositions(out, 2.0);
}

function dedupeClosePositions(points: Vec3[], thresh:number) {
  const kept: Vec3[] = [];
  for (const p of points) {
    if (!kept.some(k => dist(k,p) < thresh)) kept.push(p);
  }
  return kept;
}

function makeDefaultTeams(b:{min:Vec3;max:Vec3}): Team[] {
  const cx = (b.min.x + b.max.x) / 2;
  const cz = (b.min.z + b.max.z) / 2;
  const y  = b.min.y + 60;

  return [
    { id:"gry", name:"Gryffindor", color:"#B31B1B", spawn:{x:cx-35,y, z:cz}, score:0 },
    { id:"sly", name:"Slytherin", color:"#2E7D32",  spawn:{x:cx+35,y, z:cz}, score:0 },
    { id:"rav", name:"Ravenclaw", color:"#0D47A1",  spawn:{x:cx, y, z:cz-35}, score:0 },
    { id:"huf", name:"Hufflepuff",color:"#FBC02D",  spawn:{x:cx, y, z:cz+35}, score:0 },
  ];
}

function midAir(b:{min:Vec3;max:Vec3}, h:number): Vec3 {
  const x = (b.min.x + b.max.x)/2;
  const z = (b.min.z + b.max.z)/2;
  const y = b.min.y + 60 + h;
  return {x,y,z};
}

// --------------------------- Entities ---------------------------

function makeBall(kind: Ball["kind"], pos:Vec3): Ball {
  return { id: `ball_${kind}_${Math.random().toString(36).slice(2)}`, kind, pos, vel:{x:0,y:0,z:0} };
}

// --------------------------- Game Loop (server‑side) ---------------------------

export function tick(dt: number, nowMs:number) {
  // Update balls
  for (const b of balls) {
    if (b.owner) continue; // carried
    integrateBall(b, dt);
    if (b.kind === "bludger") bludgerSeek(b, dt);
    if (b.kind === "snitch")  snitchErratic(b, nowMs, dt);
  }

  // Resolve collisions (players <-> balls, goals, bludgers knockback)
  resolveInteractions(nowMs);

  // Drain/regen stamina, apply gravity & drag to players
  for (const p of players.values()) updatePlayerPhysics(p, dt);

  // Periodically update HUD
  if (Math.random() < 0.1) broadcastHUD();
}

function integrateBall(b:Ball, dt:number) {
  // simple physics
  b.vel.y -= Physics.gravity * dt;
  b.vel.x *= (1-Physics.drag);
  b.vel.y *= (1-Physics.drag);
  b.vel.z *= (1-Physics.drag);
  b.pos.x += b.vel.x * dt;
  b.pos.y += b.vel.y * dt;
  b.pos.z += b.vel.z * dt;
}

function bludgerSeek(b:Ball, dt:number) {
  // Optional: add light homing toward nearest player
  const target = nearestPlayer(b.pos);
  if (!target) return;
  const dir = norm(sub(target.pos, b.pos));
  const speed = 12;
  b.vel.x += dir.x * speed * dt;
  b.vel.y += dir.y * speed * dt;
  b.vel.z += dir.z * speed * dt;
}

function snitchErratic(b:Ball, nowMs:number, dt:number) {
  const t = nowMs / 1000;
  b.vel.x += Math.sin(t*5) * 3 * dt;
  b.vel.y += Math.cos(t*7) * 4 * dt;
  b.vel.z += Math.sin(t*6) * 3 * dt;
}

// --------------------------- Interactions ---------------------------

function resolveInteractions(nowMs:number) {
  // Player ↔ Ball pickup/throw is handled via input; here check goal scoring + bludger hits.
  for (const p of players.values()) {
    if (p.carrying) {
      const carried = balls.find(b => b.id === p.carrying);
      if (carried?.kind === "quaffle") {
        for (const g of goals) {
          if (dist(p.pos, g.center) < g.radius) {
            const t = teamById(p.teamId);
            if (t) {
              t.score += SCORE_QUAFFLE;
              announce(`${t.name} scored +${SCORE_QUAFFLE}!`);
              // reset quaffle
              carried.owner = undefined;
              carried.pos = midAir(bounds, 8);
              carried.vel = {x:0,y:0,z:0};
              p.carrying = undefined;
              broadcastHUD();
            }
          }
        }
      }
    }
  }

  // Bludger knockback
  for (const b of balls) if (b.kind === "bludger") {
    for (const p of players.values()) {
      if (dist(b.pos, p.pos) < 1.8) {
        const d = norm(sub(p.pos, b.pos));
        p.vel.x += d.x * Physics.bludgerKnockback;
        p.vel.y += 6; // pop up
        p.vel.z += d.z * Physics.bludgerKnockback;
        p.stunnedUntil = nowMs + Physics.stunMs;
        if (p.carrying) {
          const carried = balls.find(x => x.id === p.carrying);
          if (carried) {
            carried.owner = undefined;
            carried.vel = {x:p.vel.x, y:p.vel.y, z:p.vel.z};
            carried.pos = {...p.pos};
          }
          p.carrying = undefined;
        }
      }
    }
  }

  // Snitch capture
  const snitch = balls.find(b => b.kind === "snitch");
  if (snitch) {
    for (const p of players.values()) {
      if (dist(snitch.pos, p.pos) < 1.5) {
        const t = teamById(p.teamId);
        if (t) {
          t.score += SCORE_SNITCH;
          announce(`${t.name} caught the Snitch! +${SCORE_SNITCH}. Match over.`);
          endRound();
        }
        break;
      }
    }
  }
}

function endRound() {
  // Freeze entities, publish final scoreboard, schedule next match, etc.
  broadcastHUD(true);
}

// --------------------------- Player & Input ---------------------------

export function onPlayerJoin(id:EntityId, name:string) {
  const team = autoAssignTeam();
  const spawn = team.spawn;
  players.set(id, {
    id, name, teamId: team.id,
    pos: {...spawn},
    vel: {x:0,y:0,z:0},
    mounted: true,
    stamina: 1,
    stunnedUntil: 0,
  });
  announce(`${name} joined ${team.name}`);
  broadcastHUD();
}

export function onPlayerLeave(id:EntityId) {
  players.delete(id);
  broadcastHUD();
}

export function onPlayerInput(id:EntityId, input:{
  move: Vec3;  // -1..1 per axis
  ascend: boolean;
  descend: boolean;
  interact: boolean; // pickup/throw
  beaterSwing: boolean;
  throwDir?: Vec3; // aim vector for throws
}, dt:number, nowMs:number) {
  const p = players.get(id);
  if (!p) return;
  if (nowMs < p.stunnedUntil) return;

  // Flight forces
  const mv = clampVec(input.move, 1);
  p.vel.x += mv.x * Physics.accel * dt;
  p.vel.z += mv.z * Physics.accel * dt;
  if (input.ascend) p.vel.y += Physics.lift * dt;
  if (input.descend) p.vel.y -= Physics.lift * dt;

  // Drag & clamp
  p.vel.x *= (1-Physics.drag);
  p.vel.z *= (1-Physics.drag);
  const sp = Math.hypot(p.vel.x, p.vel.z);
  if (sp > Physics.maxSpeed) {
    const s = Physics.maxSpeed / sp;
    p.vel.x *= s; p.vel.z *= s;
  }

  // Gravity
  p.vel.y -= Physics.gravity * dt;

  // Integrate
  p.pos.x += p.vel.x * dt;
  p.pos.y += p.vel.y * dt;
  p.pos.z += p.vel.z * dt;

  // Interact: pickup/throw
  if (input.interact) {
    if (!p.carrying) {
      const nearby = balls.find(b => !b.owner && dist(b.pos,p.pos) < 2.0 && (b.kind==="quaffle" || b.kind==="snitch"));
      if (nearby) {
        nearby.owner = p.id;
        p.carrying = nearby.id;
      }
    } else {
      const carried = balls.find(b => b.id === p.carrying);
      if (carried) {
        carried.owner = undefined;
        const dir = norm(input.throwDir ?? {x:p.vel.x, y:0.2, z:p.vel.z});
        const power = 26;
        carried.vel = { x: dir.x*power, y: dir.y*power, z: dir.z*power };
        carried.pos = { ...p.pos };
      }
      p.carrying = undefined;
    }
  }

  // Beater swing: transfer impulse to nearest bludger within range
  if (input.beaterSwing) {
    const bl = nearestBallOfKind(p.pos, "bludger");
    if (bl && dist(bl.pos,p.pos) < 2.4) {
      const dir = norm(sub(bl.pos, p.pos));
      const power = 32;
      bl.vel.x += dir.x * power;
      bl.vel.y += 6;
      bl.vel.z += dir.z * power;
    }
  }
}

// --------------------------- Utility ---------------------------

function nearestPlayer(pos:Vec3): PlayerState | undefined {
  let best: PlayerState | undefined;
  let bd = Infinity;
  for (const p of players.values()) {
    const d = dist(pos,p.pos);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

function nearestBallOfKind(pos:Vec3, kind:Ball["kind"]) {
  let best: Ball | undefined;
  let bd = Infinity;
  for (const b of balls) {
    if (b.kind !== kind) continue;
    const d = dist(pos,b.pos);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

function teamById(id:string) { return teams.find(t => t.id === id); }

function autoAssignTeam(): Team {
  // Simple round‑robin
  const counts = new Map<string, number>();
  for (const t of teams) counts.set(t.id, 0);
  for (const p of players.values()) counts.set(p.teamId, (counts.get(p.teamId)||0)+1);
  let pick = teams[0], best = Infinity;
  for (const t of teams) {
    const c = counts.get(t.id)!;
    if (c < best) { best = c; pick = t; }
  }
  return pick;
}

function updatePlayerPhysics(p:PlayerState, dt:number) {
  // Simple floor to prevent falling forever
  const floorY = bounds.min.y + 40;
  if (p.pos.y < floorY) {
    p.pos.y = floorY;
    p.vel.y = Math.max(0, p.vel.y);
  }
}

function broadcastHUD(final:boolean=false) {
  const table = teams.map(t => `${t.name}: ${t.score}`).join("  |  ");
  uiBroadcast(final ? `🏁 ${table}` : `⏱️ ${table}`);
}

function announce(msg:string) {
  uiBroadcast(msg);
}

// Math helpers
function sub(a:Vec3,b:Vec3):Vec3 { return {x:a.x-b.x, y:a.y-b.y, z:a.z-b.z}; }
function dist(a:Vec3,b:Vec3){ return Math.hypot(a.x-b.x, a.y-b.y, a.z-b.z); }
function len(a:Vec3){ return Math.hypot(a.x, a.y, a.z); }
function norm(a:Vec3){ const L=len(a)||1; return {x:a.x/L, y:a.y/L, z:a.z/L}; }
function clampVec(a:Vec3, m:number){ const L=len(a); return L>m ? {x:a.x*m/L,y:a.y*m/L,z:a.z*m/L} : a; }

// --------------------------- Engine Adapters ---------------------------
// Replace these with your actual Hytopia SDK bindings.

function uiBroadcast(text:string) {
  // TODO: map to your engine's chat/system message + HUD layer
  console.log(text);
}

// If you need to spawn real engine entities (models, particles), create
// wrappers like: spawnEntity("broom", position), attachToPlayer(), etc.
// Those are intentionally left for you to wire to the SDK you’re using.
