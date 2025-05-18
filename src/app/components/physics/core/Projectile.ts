import * as THREE from 'three';
import { PHYSICS } from './PhysicsConstants';

// Define projectile configuration type
export interface ProjectileConfig {
  initialPosition: THREE.Vector3;
  initialVelocity: THREE.Vector3;
  gravity?: number;
  lifetime?: number;
  speed?: number;
  size?: number;
}

// Projectile class to handle physics and lifecycle of a single projectile
export class Projectile {
  // Position and physics
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  gravity: number;
  
  // Lifecycle
  lifetime: number;
  maxLifetime: number;
  active: boolean = true;
  
  // Visual properties
  size: number;

  constructor(config: ProjectileConfig) {
    // Set position (cloning to avoid reference issues)
    this.position = config.initialPosition.clone();
    
    // Set velocity and normalize + scale by speed
    this.velocity = config.initialVelocity.clone();
    const speed = config.speed || 30; // Default bullet speed
    this.velocity.normalize().multiplyScalar(speed);
    
    // Set physics properties
    this.gravity = config.gravity ?? (PHYSICS.GRAVITY * 0.05); // Lower gravity effect for bullets
    
    // Set lifecycle properties
    this.maxLifetime = config.lifetime || 3.0; // Default 3 second lifetime
    this.lifetime = this.maxLifetime;
    
    // Set visual properties - make bullets larger by default
    this.size = config.size || 0.2; // Increased from 0.05 to 0.2
    
    // Debug output on creation
    console.log(`Projectile created at position: [${this.position.x.toFixed(2)}, ${this.position.y.toFixed(2)}, ${this.position.z.toFixed(2)}]`);
    console.log(`Initial velocity: [${this.velocity.x.toFixed(2)}, ${this.velocity.y.toFixed(2)}, ${this.velocity.z.toFixed(2)}]`);
  }

  // Update projectile physics
  update(deltaTime: number): boolean {
    if (!this.active) return false;
    
    // Decrease lifetime
    this.lifetime -= deltaTime;
    if (this.lifetime <= 0) {
      this.active = false;
      console.log("Projectile lifetime ended");
      return false;
    }
    
    // Store previous velocity for trajectory calculation
    const previousVelocity = this.velocity.clone();
    
    // Apply gravity to velocity - increased effect
    this.velocity.y += this.gravity * deltaTime;
    
    // Apply velocity to position
    this.position.x += this.velocity.x * deltaTime;
    this.position.y += this.velocity.y * deltaTime;
    this.position.z += this.velocity.z * deltaTime;
    
    // Simple ground collision check
    if (this.position.y <= PHYSICS.GROUND.Y_POSITION + this.size/2) {
      this.position.y = PHYSICS.GROUND.Y_POSITION + this.size/2;
      this.active = false;
      console.log("Projectile hit ground");
      return false;
    }
    
    // Occasional position logging (about once per second)
    if (Math.random() < deltaTime * 0.5) {
      console.log(`Projectile at: [${this.position.x.toFixed(2)}, ${this.position.y.toFixed(2)}, ${this.position.z.toFixed(2)}]`);
      console.log(`Velocity: [${this.velocity.x.toFixed(2)}, ${this.velocity.y.toFixed(2)}, ${this.velocity.z.toFixed(2)}]`);
    }
    
    return true;
  }
  
  // Get matrix for instanced rendering
  getMatrix(): THREE.Matrix4 {
    const matrix = new THREE.Matrix4();
    
    // Create a rotation that points the projectile in the direction of travel
    const quat = new THREE.Quaternion();
    if (this.velocity.lengthSq() > 0) {
      // Create a rotation based on current velocity direction (including gravity effect)
      // This makes the projectile point downward as it falls
      const forward = new THREE.Vector3(0, 1, 0);
      forward.normalize();
      
      const direction = this.velocity.clone().normalize();
      quat.setFromUnitVectors(forward, direction);
    }
    
    // Calculate trail length based on velocity
    // Faster bullets have longer trails
    const speed = this.velocity.length();
    const trailLength = Math.min(6.0, speed * 0.15); // Reduced max length and scale factor
    
    // Offset the position slightly backward so the trail appears behind the projectile
    // First get the normalized negative velocity direction
    const trailDirection = this.velocity.clone().normalize().negate();
    
    // Create an offset that's a fraction of the trail length
    const trailOffset = trailDirection.clone().multiplyScalar(trailLength * 0.3 * this.size);
    
    // Apply this offset to create a position for the trail
    const trailPosition = this.position.clone().add(trailOffset);
    
    // Set transform matrix with position, rotation and scale
    // Scale Y (length) based on velocity to create stretching effect
    matrix.compose(
      trailPosition, // Use the offset position for better trail appearance
      quat,
      new THREE.Vector3(this.size, this.size * trailLength, this.size)
    );
    
    return matrix;
  }
  
  // Check if this projectile is active
  isActive(): boolean {
    return this.active;
  }
  
  // Deactivate this projectile (e.g. when it hits something)
  deactivate(): void {
    this.active = false;
  }
} 