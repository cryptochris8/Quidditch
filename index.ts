/**
 * SkyBall - Aerial Sports Game for HYTOPIA
 *
 * A Quidditch-inspired aerial sports game featuring:
 * - Zero-gravity free flight (WASD + Space/C for vertical)
 * - Team-based gameplay (Red vs Blue)
 * - Quaffle scoring, Bludger hazards, and Golden Snitch
 * - Proximity-based ball pickup, click to throw
 */

import {
  startServer,
  Audio,
  Entity,
  EntityEvent,
  DefaultPlayerEntity,
  PlayerEvent,
  BaseEntityControllerEvent,
  ColliderShape,
  Quaternion,
  type World,
  type Player,
} from 'hytopia';

import { FlyingController } from './src/controllers/FlyingController';
import { TeamManager } from './src/game/TeamManager';
import { GameManager } from './src/game/GameManager';
import { GAME_NAME, BROOMSTICK, BALL } from './src/config';
import type { SkyBallPlayerState } from './src/types';

const quidditchArena = require('./assets/maps/quidditch-arena.json');

// ========================= WORLD STATE =========================

const players = new Map<string, SkyBallPlayerState>();
let world: World;
let teamManager: TeamManager;
let gameManager: GameManager;

// ========================= SERVER START =========================

startServer(gameWorld => {
  world = gameWorld;

  // Load the arena map (disabled for skybox preview)
  // world.loadMap(quidditchArena);

  // Set magical Quidditch stadium skybox (golden sunset with crowds)
  world.setSkyboxUri('skyboxes/quidditch_stadium');
  console.log('Quidditch stadium skybox loaded');

  // Initialize managers
  teamManager = new TeamManager(players);
  gameManager = new GameManager(world, players, teamManager);

  // Set up game callbacks
  gameManager.onAnnounce = (message, colorHex) => {
    for (const playerState of players.values()) {
      world.chatManager.sendPlayerMessage(
        playerState.entity.player,
        message,
        colorHex ?? 'FFFFFF'
      );
    }
  };

  // Initialize game with arena data (disabled for skybox preview)
  // gameManager.initialize(quidditchArena);

  console.log(`${GAME_NAME} arena loaded!`);
  console.log(`Teams: ${teamManager.getTeams().map(t => t.name).join(' vs ')}`);

  // Game tick loop (60 FPS)
  const tickRate = 1000 / 60;
  setInterval(() => {
    gameManager.tick(tickRate);

    // Check ball pickups for all players
    for (const playerState of players.values()) {
      if (!playerState.carryingBall && Date.now() >= playerState.stunnedUntil) {
        gameManager.checkBallPickup(playerState);
      }
    }
  }, tickRate);

  // ========================= PLAYER JOIN =========================

  world.on(PlayerEvent.JOINED_WORLD, ({ player }) => {
    // Auto-assign team
    const team = teamManager.autoAssignTeam();
    const spawnPos = teamManager.getSpawnPosition(team.id);

    // Create player entity with FlyingController
    const flyingController = new FlyingController();

    const playerEntity = new DefaultPlayerEntity({
      player,
      name: player.username ?? `Player${player.id}`,
      controller: flyingController,
    });

    playerEntity.spawn(world, spawnPos);

    // Enable zero gravity flight
    playerEntity.setGravityScale(0);

    // Attach broomstick visual
    const broomstick = new Entity({
      modelUri: BROOMSTICK.modelUri,
      modelScale: BROOMSTICK.scale,
      modelPreferredShape: ColliderShape.NONE, // No collision - visual only
      parent: playerEntity,
      parentNodeName: 'torso-anchor',
      name: 'Broomstick',
    });

    // Spawn broomstick with proper rotation (horizontal position)
    broomstick.spawn(
      world,
      BROOMSTICK.offset,
      Quaternion.fromEuler(
        BROOMSTICK.rotation.x,
        BROOMSTICK.rotation.y,
        BROOMSTICK.rotation.z
      )
    );

    // Create player state
    const playerState: SkyBallPlayerState = {
      entity: playerEntity,
      teamId: team.id,
      stamina: 1,
      stunnedUntil: 0,
      carryingBall: null,
      broomstick,
    };

    players.set(player.id, playerState);

    // Handle left-click to throw ball
    flyingController.on(BaseEntityControllerEvent.TICK_WITH_PLAYER_INPUT, ({ input }) => {
      if (input.ml && playerState.carryingBall) {
        gameManager.throwBall(playerState);
        input.ml = false; // Consume the input
      }
    });

    // Load UI
    player.ui.load('ui/index.html');

    // Welcome messages
    const colorHex = teamManager.getTeamColorHex(team.id);
    world.chatManager.sendPlayerMessage(player, `Welcome to ${GAME_NAME}!`, colorHex);
    world.chatManager.sendPlayerMessage(player, `You've joined ${team.name}!`, colorHex);
    world.chatManager.sendPlayerMessage(player, 'Controls: WASD=fly, SPACE=up, C=down, SHIFT=turbo');
    world.chatManager.sendPlayerMessage(player, 'Fly into balls to pick up, LEFT-CLICK to throw!');

    // Announce join
    gameManager.onAnnounce?.(`${playerEntity.name} joined ${team.name}!`, colorHex);
    gameManager.onAnnounce?.(teamManager.getScoreboard());

    console.log(`Player ${playerEntity.name} joined ${team.name}`);
  });

  // ========================= PLAYER LEAVE =========================

  world.on(PlayerEvent.LEFT_WORLD, ({ player }) => {
    const playerState = players.get(player.id);
    if (!playerState) return;

    // Drop any carried ball
    if (playerState.carryingBall) {
      playerState.carryingBall.drop();
    }

    // Despawn broomstick
    if (playerState.broomstick?.isSpawned) {
      playerState.broomstick.despawn();
    }

    // Despawn player entity
    if (playerState.entity.isSpawned) {
      playerState.entity.despawn();
    }

    players.delete(player.id);

    console.log(`Player ${player.id} left`);
  });

  // ========================= CHAT COMMANDS =========================

  // Debug commands
  world.chatManager.registerCommand('/scores', player => {
    world.chatManager.sendPlayerMessage(player, teamManager.getScoreboard());
  });

  world.chatManager.registerCommand('/rocket', player => {
    const playerState = players.get(player.id);
    if (playerState) {
      playerState.entity.applyImpulse({ x: 0, y: 50, z: 0 });
    }
  });

  world.chatManager.registerCommand('/reset', player => {
    const playerState = players.get(player.id);
    if (playerState) {
      const spawnPos = teamManager.getSpawnPosition(playerState.teamId);
      playerState.entity.setPosition(spawnPos);
      playerState.entity.setLinearVelocity({ x: 0, y: 0, z: 0 });
    }
  });

  // ========================= AMBIENT AUDIO =========================

  new Audio({
    uri: 'audio/music/hytopia-main.mp3',
    loop: true,
    volume: 0.1,
  }).play(world);

  console.log(`${GAME_NAME} server started!`);
});
