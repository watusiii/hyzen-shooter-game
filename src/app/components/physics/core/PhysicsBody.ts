import { PHYSICS, IPhysicsState } from './PhysicsConstants';
import * as THREE from 'three';

export class PhysicsBody {
    private state: IPhysicsState;
    private jumpPressed: boolean = false;
    private jetActive: boolean = false;

    constructor(initialPosition: THREE.Vector3) {
        this.state = {
            position: {
                x: initialPosition.x,
                y: initialPosition.y,
                z: initialPosition.z
            },
            velocity: { x: 0, y: 0, z: 0 },
            grounded: false,
            jumpHoldTime: 0,
            lastJumpTime: 0,
            jumpBufferTime: 0,
            jetActive: false,
            fuel: PHYSICS.JET.FUEL.MAX,
            isRecharging: false
        };
    }

    update(deltaTime: number, input: { jump: boolean, jet?: boolean }) {
        // Store previous state for collision resolution
        const previousY = this.state.position.y;

        // Handle jumping (separate from jetpack)
        if (input.jump && !this.jumpPressed && this.state.grounded) {
            // Initial jump - only allowed when grounded
            this.state.velocity.y = PHYSICS.JUMP.FORCE;
            this.state.grounded = false;
            this.jumpPressed = true;
            // Reset jump hold time for new jump
            this.state.jumpHoldTime = 0;
        } else if (input.jump && this.jumpPressed) {
            // Already jumping and still holding the button - do nothing
            // This prevents repeated jumping while holding space
        } else if (!input.jump) {
            // Button released, reset the jump pressed state
            this.jumpPressed = false;
        }

        // Handle jetpack propulsion (enhanced system)
        if (input.jet && this.state.fuel > 0) {
            // Calculate the jet force based on velocity
            // Apply more force when falling to recover control
            let jetForce = PHYSICS.JET.FORCE;
            
            // Boost recovery power when falling rapidly
            if (this.state.velocity.y < 0) {
                // Apply stronger force when falling - up to 2x normal force at max fall speed
                const fallRatio = Math.min(1, Math.abs(this.state.velocity.y) / Math.abs(PHYSICS.MAX_FALL_SPEED));
                const boostMultiplier = 1 + fallRatio; // 1.0 to 2.0 based on fall speed
                jetForce *= boostMultiplier;
            }
            
            // Apply continuous upward force
            this.state.velocity.y += jetForce * deltaTime;
            
            // Cap maximum upward velocity
            if (this.state.velocity.y > PHYSICS.JET.MAX_VELOCITY) {
                this.state.velocity.y = PHYSICS.JET.MAX_VELOCITY;
            }
            
            // Apply horizontal drag when using jet (for better air control)
            if (Math.abs(this.state.velocity.x) > 0) {
                const airDrag = 0.95;
                this.state.velocity.x *= airDrag;
            }
            
            // Consume fuel
            this.state.fuel = Math.max(0, this.state.fuel - PHYSICS.JET.FUEL.CONSUMPTION * deltaTime);
            
            // Set jet active flag for any systems that need to know
            this.jetActive = true;
            this.state.jetActive = true;
            this.state.isRecharging = false;
        } else {
            this.jetActive = false;
            this.state.jetActive = false;
            
            // Recharge fuel when not using jetpack
            if (!this.state.isRecharging && this.state.fuel < PHYSICS.JET.FUEL.MAX) {
                // Start recharging after a short delay, but only when on ground or fuel isn't critically low
                if (this.state.grounded || this.state.fuel > PHYSICS.JET.FUEL.MAX * 0.1) {
                    this.state.isRecharging = true;
                }
            }
            
            // Recharge fuel faster when on ground
            if (this.state.isRecharging) {
                const rechargeRate = this.state.grounded ? 
                    PHYSICS.JET.FUEL.RECHARGE : 
                    PHYSICS.JET.FUEL.RECHARGE * 0.25; // Slower recharge in air
                
                this.state.fuel = Math.min(
                    PHYSICS.JET.FUEL.MAX, 
                    this.state.fuel + rechargeRate * deltaTime
                );
            }
        }

        // Apply gravity
        this.state.velocity.y += PHYSICS.GRAVITY * deltaTime;

        // Clamp fall speed
        if (this.state.velocity.y < PHYSICS.MAX_FALL_SPEED) {
            this.state.velocity.y = PHYSICS.MAX_FALL_SPEED;
        }

        // Update position
        this.state.position.y += this.state.velocity.y * deltaTime;

        // Ground collision check
        if (this.state.position.y <= PHYSICS.GROUND.Y_POSITION) {
            this.state.position.y = PHYSICS.GROUND.Y_POSITION;
            this.state.velocity.y = 0;
            this.state.grounded = true;
        } else {
            this.state.grounded = false;
        }

        // Update last jump time for animation purposes
        if (this.state.grounded) {
            this.state.lastJumpTime = 0;
        } else {
            this.state.lastJumpTime += deltaTime;
        }
    }

    getState(): IPhysicsState & { jetActive: boolean } {
        return { ...this.state, jetActive: this.jetActive };
    }

    getPosition(): THREE.Vector3 {
        return new THREE.Vector3(
            this.state.position.x,
            this.state.position.y,
            this.state.position.z
        );
    }

    isGrounded(): boolean {
        return this.state.grounded;
    }

    isJetActive(): boolean {
        return this.jetActive;
    }

    getFuelPercentage(): number {
        return (this.state.fuel / PHYSICS.JET.FUEL.MAX) * 100;
    }

    setPosition(position: THREE.Vector3) {
        this.state.position.x = position.x;
        this.state.position.y = position.y;
        this.state.position.z = position.z;
    }
} 