'use client';

import React, { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Projectile, ProjectileConfig } from '../physics/core/Projectile';

// Maximum number of projectiles to show at once
const MAX_PROJECTILES = 100;

interface ProjectileManagerProps {
  debug?: boolean;
}

/**
 * ProjectileManager handles spawning, updating, and rendering projectiles
 * It uses instanced meshes for performance
 */
const ProjectileManager: React.FC<ProjectileManagerProps> = ({ 
  debug = false 
}) => {
  // Reference to instanced mesh
  const bulletInstanceRef = useRef<THREE.InstancedMesh>(null);
  
  // Array of active projectiles
  const projectiles = useRef<Projectile[]>([]);
  
  // Matrix object reused for updates
  const tempMatrix = useRef(new THREE.Matrix4());
  
  // Create function to spawn a new projectile
  const spawnProjectile = (config: ProjectileConfig) => {
    // Create a new projectile with the given config
    const projectile = new Projectile(config);
    
    // Find an empty slot or replace the oldest projectile if full
    if (projectiles.current.length >= MAX_PROJECTILES) {
      // Find the first inactive projectile or the oldest one
      const inactiveIndex = projectiles.current.findIndex(p => !p.isActive());
      // Use the inactive projectile slot if found, otherwise use index 0 (oldest)
      const replaceIndex = inactiveIndex !== -1 ? inactiveIndex : 0;
      projectiles.current[replaceIndex] = projectile;
    } else {
      // Add new projectile
      projectiles.current.push(projectile);
    }
    
    if (debug) {
      console.log(`Spawned projectile at: ${projectile.position.x.toFixed(2)}, ${projectile.position.y.toFixed(2)}, ${projectile.position.z.toFixed(2)}`);
      console.log(`Velocity: ${projectile.velocity.x.toFixed(2)}, ${projectile.velocity.y.toFixed(2)}, ${projectile.velocity.z.toFixed(2)}`);
    }
    
    return projectile;
  };
  
  // Set up global access to spawnProjectile
  useEffect(() => {
    // Make spawnProjectile available globally for other components to use
    // @ts-ignore - Using window for debugging and cross-component access
    window.spawnProjectile = spawnProjectile;
    
    return () => {
      // Clean up global access on unmount
      // @ts-ignore - Using window for debugging and cross-component access
      window.spawnProjectile = undefined;
    };
  }, []);
  
  // Update projectiles each frame
  useFrame((state, delta) => {
    if (!bulletInstanceRef.current) return;
    
    // Limit delta time to prevent large jumps
    const clampedDelta = Math.min(delta, 0.1);
    
    // Count active projectiles
    let activeCount = 0;
    
    // Update each projectile
    projectiles.current.forEach((projectile, index) => {
      if (projectile.isActive()) {
        // Update projectile physics
        projectile.update(clampedDelta);
        
        // Get updated matrix
        tempMatrix.current = projectile.getMatrix();
        
        // Debug the matrix very occasionally
        if (debug && Math.random() < 0.01) {
          const position = new THREE.Vector3();
          const quaternion = new THREE.Quaternion();
          const scale = new THREE.Vector3();
          tempMatrix.current.decompose(position, quaternion, scale);
          console.log(`Projectile matrix ${index} position:`, position);
        }
        
        // Apply to instanced mesh
        bulletInstanceRef.current?.setMatrixAt(index, tempMatrix.current);
        
        // Increment active count
        activeCount++;
      }
    });
    
    // Debug active count occasionally
    if (debug && Math.random() < 0.05) {
      console.log(`Active projectiles: ${activeCount}`);
    }
    
    // Set visible instance count
    bulletInstanceRef.current.count = activeCount;
    
    // Mark instance matrix as needing update
    bulletInstanceRef.current.instanceMatrix.needsUpdate = true;
  });
  
  return (
    <>
      {/* Instanced mesh for bullet rendering */}
      <instancedMesh
        ref={bulletInstanceRef}
        args={[undefined, undefined, MAX_PROJECTILES]}
        frustumCulled={false}
        castShadow
        receiveShadow
      >
        {/* Bullet geometry - LARGER bullet shape, pre-rotated to align with direction of travel */}
        <cylinderGeometry args={[0.08, 0.08, 0.4, 8]} />
        
        {/* Bullet material - much more visible appearance */}
        <meshStandardMaterial 
          color="#ffff00" 
          emissive="#ff8800"
          emissiveIntensity={2}
          metalness={0.8}
          roughness={0.2}
        />
      </instancedMesh>
      
      {/* Add trail effect for bullets */}
      {debug && (
        <pointLight 
          color="#ff6600" 
          intensity={2}
          distance={10}
          position={[0, 5, 0]}
        />
      )}
    </>
  );
};

export default ProjectileManager; 