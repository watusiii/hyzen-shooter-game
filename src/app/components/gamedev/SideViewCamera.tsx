'use client';

import React, { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface SideViewCameraProps {
  // Target to follow - typically the player character
  target?: THREE.Object3D | null;
  // How quickly the camera follows the target
  followSpeed?: number;
  // Camera offset from target
  offset?: [number, number, number];
  // Field of view
  fov?: number;
  // Whether to follow the target
  follow?: boolean;
}

/**
 * SideViewCamera component for 2.5D side-scrolling game
 * Sets up an orthographic camera that follows the player horizontally only
 */
const SideViewCamera: React.FC<SideViewCameraProps> = ({
  target = null,
  followSpeed = 5,
  offset = [0, 5, 15],
  fov = 50,
  follow = true
}) => {
  const { camera, size } = useThree();
  const prevPositionRef = useRef<[number, number, number]>([0, 0, 0]);
  const initialized = useRef(false);
  
  // Initial camera setup - add more debug logging
  useEffect(() => {
    console.log('SideViewCamera: Setting up camera at position', offset);
    
    // Set camera position and orientation
    camera.position.set(offset[0], offset[1], offset[2]);
    camera.lookAt(0, offset[1], 0);
    
    // Store initial position
    prevPositionRef.current = [camera.position.x, camera.position.y, camera.position.z];
    
    // Reset rotation to default
    camera.rotation.y = 0; 
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    
    // Mark as initialized
    initialized.current = true;
    
    console.log('SideViewCamera: Camera initialized', {
      position: camera.position,
      rotation: camera.rotation,
      target: target ? 'Present' : 'Missing'
    });
    
    // Force camera to update
    requestAnimationFrame(() => {
      if (target) {
        const targetPos = target.position;
        console.log('SideViewCamera: Initial target position', targetPos);
      }
    });
    
    return () => {
      // Reset camera on unmount
      console.log('SideViewCamera: Unmounting, resetting camera');
      camera.position.set(0, 0, 0);
      camera.lookAt(0, 0, 0);
      initialized.current = false;
    };
  }, [camera, offset, target]);
  
  // Follow target on X-axis only with consistent updates
  useFrame((state) => {
    if (!target || !follow || !initialized.current) return;
    
    // Debug log every few frames
    if (state.clock.elapsedTime % 5 < 0.01) {
      console.log('SideViewCamera: Following target', {
        targetPos: target.position,
        cameraPos: camera.position,
        followActive: follow,
        initialized: initialized.current
      });
    }
    
    // Get current target position
    const targetX = target.position.x;
    
    // Calculate lag effect
    const directionOffset = targetX - prevPositionRef.current[0];
    
    // Determine camera target position with lag
    let cameraTargetX = targetX;
    if (Math.abs(directionOffset) > 0.01) {
      // Lag effect - negative for trailing behind the player
      const lagFactor = -1.5;
      cameraTargetX = targetX + directionOffset * lagFactor;
    }
    
    // Apply camera movement with variable damping factor based on distance
    const distanceFactor = Math.abs(cameraTargetX - camera.position.x) / 10;
    const dampingFactor = Math.min(0.01 * followSpeed * (0.5 + distanceFactor), 0.1);
    camera.position.x += (cameraTargetX - camera.position.x) * dampingFactor;
    
    // Update previous position for next frame
    prevPositionRef.current = [targetX, target.position.y, target.position.z];
    
    // Keep Y and Z constant
    camera.position.y = offset[1];
    camera.position.z = offset[2];
    
    // Always look at player's position
    camera.lookAt(targetX, offset[1] - 2, 0);
  });
  
  return null;
};

export default SideViewCamera; 