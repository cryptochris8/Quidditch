/**
 * FlyingController - Custom controller for zero-gravity flight
 *
 * Extends DefaultPlayerEntityController to provide:
 * - Zero gravity flight (players float in air)
 * - WASD horizontal movement relative to camera (from base controller)
 * - Space to fly up, C to fly down
 * - Shift for turbo speed (horizontal + vertical)
 * - Walk/run animations play while airborne
 * - Joystick support for mobile
 * - External impulse support (bludger knockback)
 */

import {
  DefaultPlayerEntityController,
  PlayerEntity,
  type PlayerInput,
  type PlayerCameraOrientation,
} from 'hytopia';

import { FLIGHT } from '../config';

export interface FlyingControllerOptions {
  horizontalSpeed?: number;
  verticalSpeed?: number;
  turboSpeed?: number;
}

export class FlyingController extends DefaultPlayerEntityController {
  public horizontalSpeed: number;
  public verticalSpeed: number;
  public turboSpeed: number;

  constructor(options: FlyingControllerOptions = {}) {
    super({
      jumpVelocity: 0,
      walkVelocity: options.horizontalSpeed ?? FLIGHT.horizontal,
      runVelocity: options.turboSpeed ?? FLIGHT.turbo,
      idleLoopedAnimations: ['idle-upper', 'idle-lower'],
      walkLoopedAnimations: ['walk-upper', 'walk-lower'],
      runLoopedAnimations: ['run-upper', 'run-lower'],
    });

    this.horizontalSpeed = options.horizontalSpeed ?? FLIGHT.horizontal;
    this.verticalSpeed = options.verticalSpeed ?? FLIGHT.vertical;
    this.turboSpeed = options.turboSpeed ?? FLIGHT.turbo;
  }

  /**
   * Override tick to add vertical flight controls.
   *
   * Strategy:
   * - Let the base controller handle horizontal movement (WASD/joystick),
   *   character rotation/facing, external impulses (bludger knockback),
   *   and mouse click processing (throw).
   * - After base runs, override Y velocity for vertical flight.
   * - Override animations since base requires isGrounded for walk/run.
   */
  public override tickWithPlayerInput(
    entity: PlayerEntity,
    input: PlayerInput,
    cameraOrientation: PlayerCameraOrientation,
    deltaTimeMs: number
  ): void {
    if (!entity.isSpawned || !entity.world) return;

    // Ensure zero gravity every tick (in case something resets it)
    if (entity.gravityScale !== 0) {
      entity.setGravityScale(0);
    }

    // Capture vertical input before super processes it
    const wantsUp = !!input.sp;
    const wantsDown = !!input.c;
    const wantsTurbo = !!input.sh;
    const isMoving = !!(input.w || input.a || input.s || input.d)
      || typeof input.jd === 'number'
      || wantsUp
      || wantsDown;

    // Base controller handles:
    //   - WASD/joystick → horizontal velocity via impulse (camera-relative)
    //   - Diagonal movement normalization
    //   - Character rotation based on camera yaw + movement direction
    //   - External impulse decay (bludger knockback)
    //   - Mouse click → interact animation
    //   - Event emission (TICK_WITH_PLAYER_INPUT for throw handler)
    //
    // Note: jump won't fire (isGrounded is false), and sp/c are unused by
    // the base controller in this state, so there's no conflict.
    super.tickWithPlayerInput(entity, input, cameraOrientation, deltaTimeMs);

    // --- Vertical flight ---
    // The base controller's Y impulse is 0 when not grounded/swimming,
    // so we can safely set Y velocity directly without conflict.
    let targetY = 0;
    if (wantsUp) {
      targetY = this.verticalSpeed;
    } else if (wantsDown) {
      targetY = -this.verticalSpeed;
    }

    // Turbo multiplier for vertical (same ratio as horizontal walk→run)
    if (wantsTurbo && targetY !== 0) {
      targetY *= (this.turboSpeed / this.horizontalSpeed);
    }

    // Read post-impulse velocity from base controller, override only Y
    const velocity = entity.linearVelocity;
    entity.setLinearVelocity({
      x: velocity.x,
      y: targetY,
      z: velocity.z,
    });

    // --- Animation fix ---
    // The base controller only plays walk/run when isGrounded is true.
    // Since we're always airborne, it falls through to idle. Override here.
    if (isMoving) {
      const animations = wantsTurbo ? this.runLoopedAnimations : this.walkLoopedAnimations;
      entity.stopAllModelLoopedAnimations(animations);
      entity.startModelLoopedAnimations(animations);
    }
  }
}

export default FlyingController;
