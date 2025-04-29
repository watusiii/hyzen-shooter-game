export const PHYSICS = {
    GRAVITY: -9.81 * 2.5, // Adjusted gravity for better feel
    MAX_FALL_SPEED: -20,
    JUMP: {
        FORCE: 10,           // Initial jump force
        MAX_HOLD_TIME: 0,    // Hold time for variable height
        HOLD_FORCE: 0,       // Hold force for extra height
        BUFFER_TIME: 0.1     // Time window for jump input buffer (seconds)
    },
    JET: {
        FORCE: 30,           // Further increased upward force for better control
        MAX_VELOCITY: 15,    // Increased maximum upward velocity 
        FUEL: {
            MAX: 150,        // Increased maximum fuel capacity for longer flight
            CONSUMPTION: 15, // Higher consumption for balance
            RECHARGE: 8      // Faster recharge for better gameplay flow
        }
    },
    GROUND: {
        FRICTION: 0.9,       // Ground friction coefficient
        Y_POSITION: 0        // Ground Y position
    },
    TIME: {
        FIXED_TIMESTEP: 1/60 // Fixed physics timestep (60 Hz)
    }
} as const;

// Character physics state interface
export interface IPhysicsState {
    position: { x: number; y: number; z: number };
    velocity: { x: number; y: number; z: number };
    grounded: boolean;
    jumpHoldTime: number;
    lastJumpTime: number;
    jumpBufferTime: number;
    jetActive: boolean;
    fuel: number;
    isRecharging: boolean;
} 