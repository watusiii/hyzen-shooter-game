'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import * as THREE from 'three';
import CharacterController, { CharacterControllerRef } from './CharacterController';
import SideViewCamera from './SideViewCamera';
import { HUD } from '../hud';
import ProjectileManager from './ProjectileManager';

// Simple debug panel for our development environment
const DebugPanel = ({ children }: { children: React.ReactNode }) => {
  return (
    <div style={{
      position: 'absolute',
      top: '20px',
      right: '20px',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      color: 'white',
      padding: '16px',
      borderRadius: '6px',
      maxHeight: '80vh',
      overflowY: 'auto',
      zIndex: 1000,
      minWidth: '300px',
      maxWidth: '400px'
    }}>
      <h3 style={{ 
        fontSize: '1.125rem', 
        fontWeight: 'bold', 
        marginBottom: '12px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.3)',
        paddingBottom: '8px'
      }}>
        Game Development Environment
      </h3>
      {children}
    </div>
  );
};

// Animation controls component
const AnimationControls = () => {
  const [animationList, setAnimationList] = useState<string[]>([]);
  const [currentAnimation, setCurrentAnimation] = useState<string | null>(null);

  // Update animation info from the window object
  useEffect(() => {
    const updateInterval = setInterval(() => {
      // @ts-ignore - Using window for debugging
      if (window.characterAnimations) {
        // @ts-ignore - Using window for debugging
        setAnimationList(window.characterAnimations.list || []);
        // @ts-ignore - Using window for debugging
        setCurrentAnimation(window.characterAnimations.current);
      }
    }, 100); // Update every 100ms to avoid performance issues

    return () => {
      clearInterval(updateInterval);
    };
  }, []);

  // Function to play animation
  const playAnimation = (name: string) => {
    // @ts-ignore - Using window for debugging
    if (window.characterAnimations && window.characterAnimations.play) {
      // @ts-ignore - Using window for debugging
      window.characterAnimations.play(name);
    }
  };

  if (animationList.length === 0) {
    return (
      <div style={{ marginTop: '16px' }}>
        <h4 style={{ 
          fontSize: '1rem', 
          fontWeight: 'bold', 
          marginBottom: '8px',
          color: '#00aa66'
        }}>
          Animation Controls
        </h4>
        <div style={{ fontSize: '0.9rem', opacity: 0.7 }}>
          Loading animations...
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: '16px' }}>
      <h4 style={{ 
        fontSize: '1rem', 
        fontWeight: 'bold', 
        marginBottom: '8px',
        color: '#00aa66'
      }}>
        Animation Controls
      </h4>
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '4px',
        maxHeight: '200px',
        overflowY: 'auto',
        paddingRight: '8px',
        marginTop: '8px'
      }}>
        {animationList.map(name => (
          <button
            key={name}
            onClick={() => playAnimation(name)}
            style={{
              padding: '4px 8px',
              backgroundColor: currentAnimation === name ? '#009955' : '#333',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              textAlign: 'left',
              cursor: 'pointer',
              fontSize: '0.85rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <span>{name}</span>
            {currentAnimation === name && (
              <span style={{ 
                fontSize: '0.7rem', 
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                padding: '2px 4px',
                borderRadius: '2px'
              }}>
                PLAYING
              </span>
            )}
          </button>
        ))}
      </div>
      <div style={{ fontSize: '0.85rem', marginTop: '8px', opacity: 0.7 }}>
        Tip: You can also use number keys 1-9 to quickly test animations
      </div>
    </div>
  );
};

// Debug info for character controller
const CharacterDebugInfo = () => {
  const [debugInfo, setDebugInfo] = useState({
    position: [0, 0, 0],
    rotation: '0',
    isMoving: false,
    currentAnimation: null as string | null
  });

  // Update debug info from the window object
  useEffect(() => {
    const updateInterval = setInterval(() => {
      // @ts-ignore - Using window for debugging
      if (window.characterDebug) {
        // @ts-ignore - Using window for debugging
        setDebugInfo(window.characterDebug);
      }
    }, 100); // Update every 100ms to avoid performance issues

    return () => {
      clearInterval(updateInterval);
    };
  }, []);

  return (
    <div style={{ marginTop: '16px' }}>
      <h4 style={{ 
        fontSize: '1rem', 
        fontWeight: 'bold', 
        marginBottom: '8px',
        color: '#00aa66'
      }}>
        Character Debug
      </h4>
      <div style={{ fontSize: '0.9rem' }}>
        <div>
          <strong>Position:</strong> 
          X: {debugInfo.position[0].toFixed(2)}, 
          Y: {debugInfo.position[1].toFixed(2)}, 
          Z: {debugInfo.position[2].toFixed(2)}
        </div>
        <div>
          <strong>Rotation:</strong> {debugInfo.rotation}
        </div>
        <div>
          <strong>Moving:</strong> {debugInfo.isMoving ? 'Yes' : 'No'}
        </div>
        <div>
          <strong>Animation:</strong> {debugInfo.currentAnimation || 'None'}
        </div>
      </div>
      <div style={{ marginTop: '8px' }}>
        <h5 style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>Controls:</h5>
        <div style={{ fontSize: '0.85rem' }}>
          <div>WASD / Arrow Keys: Move</div>
          <div>Q / E: Rotate</div>
          <div>Space: Jump/Up</div>
        </div>
      </div>
    </div>
  );
};

// Basic environment setup with a grid for reference
const Environment = () => {
  return (
    <>
      {/* Dark background sky */}
      <color attach="background" args={['#050A24']} />
      
      {/* Add fog for depth and atmosphere */}
      <fog attach="fog" args={['#050A24', 15, 60]} />
      
      {/* Lights */}
      <ambientLight intensity={0.3} /> {/* Reduced ambient for darker feel */}
      <directionalLight position={[10, 10, 5]} intensity={0.8} castShadow />
      <spotLight 
        position={[0, 10, 0]} 
        intensity={0.5} 
        castShadow 
        penumbra={0.8} 
        angle={0.6}
      />
      
      {/* Reference grid */}
      <Grid 
        args={[20, 20]} 
        cellSize={1} 
        cellThickness={0.6} 
        cellColor="#444444"
        sectionSize={5}
        sectionThickness={1.2}
        sectionColor="#6d3434"
        fadeDistance={30}
        fadeStrength={1}
        followCamera={false}
        infiniteGrid={true}
      />
      
      {/* Add a simple ground plane with dark material */}
      <mesh 
        rotation={[-Math.PI / 2, 0, 0]} 
        position={[0, -0.01, 0]} 
        receiveShadow
      >
        <planeGeometry args={[100, 100]} />
        <meshStandardMaterial color="#111111" />
      </mesh>
    </>
  );
};

// Camera Controller component - this will handle camera setup and following
const CameraController = ({ characterRef }: { characterRef: React.RefObject<CharacterControllerRef | null> }) => {
  const { camera } = useThree();
  const [target, setTarget] = useState<THREE.Object3D | null>(null);
  
  // Poll for character reference until we find it
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    const checkForTarget = () => {
      if (characterRef.current?.characterRef) {
        setTarget(characterRef.current.characterRef);
        console.log('CameraController: Target found!', characterRef.current.characterRef);
      } else {
        console.log('CameraController: Target not found yet, polling...');
        timeoutId = setTimeout(checkForTarget, 100);
      }
    };
    
    // Start polling
    checkForTarget();
    
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [characterRef]);
  
  // Apply side camera configuration
  useEffect(() => {
    // Initial camera setup
    const offset = [0, 5, 15];
    camera.position.set(offset[0], offset[1], offset[2]);
    
    // For true side-scrolling, we look straight ahead
    camera.lookAt(offset[0], offset[1] - 2, 0);
    
    // Reset rotation to ensure we're looking along Z axis
    camera.rotation.y = 0;
    camera.updateProjectionMatrix();
    
    console.log('CameraController: Initial camera setup complete', {
      position: camera.position,
      rotation: camera.rotation
    });
    
    return () => {
      console.log('CameraController: Cleaning up');
    };
  }, [camera]);
  
  // Update camera position to follow target with lag effect
  useEffect(() => {
    if (!target) return;
    
    console.log('CameraController: Target acquired, setting up following');
    
    const offset = [0, 5, 15];
    const followSpeed = 5;
    const previousPosition = { x: 0, y: 0, z: 0 };
    
    // Update previous position initially
    previousPosition.x = target.position.x;
    previousPosition.y = target.position.y;
    previousPosition.z = target.position.z;
    
    const updateCamera = () => {
      if (!target) return;
      
      // For mouse-based shooting, we want the camera to stay centered on the player
      // with minimal lag for better aim precision
      
      // Target the player's position directly
      const cameraTargetX = target.position.x;
      
      // Apply camera movement with quick response for aiming
      // Higher damping factor means more responsive camera
      const dampingFactor = 0.15; // Faster camera tracking
      camera.position.x += (cameraTargetX - camera.position.x) * dampingFactor;
      
      // Keep Y constant but preserve current Z (zoom level)
      camera.position.y = offset[1];
      
      // For true side-scrolling, we always look forward, not at the player
      // This creates a pure panning effect without any rotation
      camera.lookAt(camera.position.x, offset[1] - 2, 0);
      
      // Update previous position
      previousPosition.x = target.position.x;
      previousPosition.y = target.position.y;
      previousPosition.z = target.position.z;
    };
    
    // Create an animation frame loop for smooth following
    let frameId: number;
    const animate = () => {
      updateCamera();
      frameId = requestAnimationFrame(animate);
    };
    
    // Start the animation loop
    frameId = requestAnimationFrame(animate);
    
    return () => {
      // Clean up animation frame on unmount
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [target, camera]);
  
  return null;
};

// Main scene component
const Scene = () => {
  const characterRef = useRef<CharacterControllerRef>(null);
  const [useSideCamera, setUseSideCamera] = useState(true);
  
  // Debug character reference to ensure it's available
  useEffect(() => {
    const checkRef = () => {
      if (characterRef.current && characterRef.current.characterRef) {
        console.log('Scene: Character reference available', {
          characterRefExists: !!characterRef.current,
          characterMeshExists: !!characterRef.current.characterRef,
          position: characterRef.current.characterRef.position
        });
      } else {
        console.log('Scene: Character reference not yet available', {
          characterRefExists: !!characterRef.current,
          characterMeshExists: characterRef.current ? !!characterRef.current.characterRef : false
        });
        // Try again until we have a reference
        setTimeout(checkRef, 500);
      }
    };
    
    // Start checking after a small delay to allow component to mount
    setTimeout(checkRef, 100);
    
    return () => {
      console.log('Scene: Unmounting, cleaning up character reference');
    };
  }, []);
  
  // Additional debug logging for camera toggling
  useEffect(() => {
    console.log('Scene: Side camera enabled:', useSideCamera);
  }, [useSideCamera]);
  
  return (
    <>
      <Environment />
      
      {/* Create a platform for the character to stand on */}
      <mesh 
        position={[0, -0.5, 0]} 
        rotation={[-Math.PI / 2, 0, 0]} 
        receiveShadow
      >
        <planeGeometry args={[50, 15]} />
        <meshStandardMaterial color="#444" />
      </mesh>
      
      {/* Character with controller */}
      <CharacterController 
        ref={characterRef}
        position={[0, 0, 0]}
        scale={2}
        debug={true}
      />
      
      {/* Add ProjectileManager for bullet rendering and physics */}
      <ProjectileManager debug={true} />
      
      {/* New camera controller component */}
      {useSideCamera && <CameraController characterRef={characterRef} />}
    </>
  );
};

// Main component that sets up the canvas and debug UI
const GameDevEnvironment = () => {
  const [showDebug, setShowDebug] = useState(true);

  // Toggle debug panel visibility
  const toggleDebug = useCallback(() => {
    const newShowDebug = !showDebug;
    setShowDebug(newShowDebug);
  }, [showDebug]);

  // Prevent context menu to allow right-click functionality
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    window.addEventListener('contextmenu', handleContextMenu);
    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      <HUD />
      <Canvas 
        shadows 
        camera={{ 
          position: [0, 5, 15],
          fov: 50,
          near: 0.1,
          far: 1000
        }}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          outputColorSpace: THREE.SRGBColorSpace
        }}
      >
        <Scene />
        <OrbitControls 
          makeDefault
          enabled={false}
        />
      </Canvas>
      
      {showDebug ? (
        <DebugPanel>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <p>Debug Panel</p>
            <button 
              onClick={toggleDebug}
              style={{
                padding: '4px 8px',
                backgroundColor: '#444',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.85rem'
              }}
            >
              Hide Debug
            </button>
          </div>
          <p>Use <strong>mouse</strong> to orbit camera</p>
          <p>Use <strong>scroll</strong> to zoom</p>
          <p>Hold <strong>right click</strong> to pan</p>
          <CharacterDebugInfo />
          <AnimationControls />
          <div style={{ marginTop: '16px', fontSize: '0.9rem', opacity: 0.7 }}>
            This is a development environment for building and testing game components in isolation.
          </div>
        </DebugPanel>
      ) : null}
    </div>
  );
};

export default GameDevEnvironment; 