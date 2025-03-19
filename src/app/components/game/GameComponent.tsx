'use client';

import React, { useRef, useEffect, useState, RefObject, Suspense } from 'react';
import { Canvas, useFrame, useThree, useLoader } from '@react-three/fiber';
import { Box, Plane, Sky, useGLTF, useAnimations } from '@react-three/drei';
import * as THREE from 'three';

// Define prop types for Player component
interface PlayerProps {
  playerRef: RefObject<THREE.Mesh | null>;
  playerPosition: THREE.Vector3;
  setPlayerPosition: (position: THREE.Vector3) => void;
  playerRotation: number;
  setPlayerRotation: React.Dispatch<React.SetStateAction<number>>;
}

// Define prop types for Camera component
interface CameraProps {
  playerRef: RefObject<THREE.Mesh | null>;
  playerRotation: number;
}

// Props for ModelWithFallback
interface ModelWithFallbackProps {
  playerRef: RefObject<THREE.Mesh | null>;
  position: [number, number, number];
  rotation: [number, number, number];
}

// Game Scene with player and camera as siblings
const GameScene = () => {
  // Shared player position state
  const [playerPosition, setPlayerPosition] = useState(new THREE.Vector3(0, 0, 0));
  const [playerRotation, setPlayerRotation] = useState(0);
  const [mouseLocked, setMouseLocked] = useState(false);
  const playerRef = useRef<THREE.Mesh>(null);
  
  // Handle pointer lock events
  useEffect(() => {
    const handlePointerLockChange = () => {
      setMouseLocked(!!document.pointerLockElement);
    };
    
    document.addEventListener('pointerlockchange', handlePointerLockChange);
    
    return () => {
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
    };
  }, []);
  
  // Handle click to lock pointer
  const handleCanvasClick = () => {
    const canvas = document.querySelector('canvas');
    if (canvas && !document.pointerLockElement) {
      canvas.requestPointerLock();
    }
  };
  
  return (
    <>
      <Environment />
      <Player 
        playerRef={playerRef} 
        playerPosition={playerPosition} 
        setPlayerPosition={setPlayerPosition}
        playerRotation={playerRotation}
        setPlayerRotation={setPlayerRotation}
      />
      <PlayerCamera 
        playerRef={playerRef}
        playerRotation={playerRotation}
      />
      {/* Invisible overlay to capture clicks for pointer lock */}
      <mesh position={[0, 0, -100]} onClick={handleCanvasClick}>
        <planeGeometry args={[1000, 1000]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
    </>
  );
};

// Player component with FBX model
const Player: React.FC<PlayerProps> = ({ 
  playerRef, 
  playerPosition, 
  setPlayerPosition, 
  playerRotation, 
  setPlayerRotation
}) => {
  const [moveDirection, setMoveDirection] = useState({ forward: 0, right: 0 });
  
  // Mouse movement for rotation
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Only rotate if pointer is locked
      if (document.pointerLockElement) {
        // mouse X movement corresponds to Y-axis rotation (horizontal rotation)
        setPlayerRotation((prev: number) => prev - e.movementX * 0.003);
      }
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [setPlayerRotation]);
  
  // Movement controls - capture both WASD and arrow keys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.code) {
        // WASD controls
        case 'KeyW': 
        case 'ArrowUp': 
          setMoveDirection(prev => ({ ...prev, forward: -1 })); 
          break;
        case 'KeyS': 
        case 'ArrowDown': 
          setMoveDirection(prev => ({ ...prev, forward: 1 })); 
          break;
        case 'KeyA': 
        case 'ArrowLeft': 
          setMoveDirection(prev => ({ ...prev, right: -1 })); 
          break;
        case 'KeyD': 
        case 'ArrowRight': 
          setMoveDirection(prev => ({ ...prev, right: 1 })); 
          break;
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
        case 'KeyS':
        case 'ArrowDown': 
          setMoveDirection(prev => ({ ...prev, forward: 0 })); 
          break;
        case 'KeyA':
        case 'ArrowLeft':
        case 'KeyD':
        case 'ArrowRight': 
          setMoveDirection(prev => ({ ...prev, right: 0 })); 
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);
  
  // Update player position based on movement
  useFrame((state, delta) => {
    if (!playerRef.current) return;
    
    const speed = 5;
    
    // Important: Move relative to player's facing direction
    // Create a direction vector and rotate it by player's rotation
    const directionVector = new THREE.Vector3(
      moveDirection.right, 
      0, 
      moveDirection.forward
    ).normalize();
    directionVector.applyAxisAngle(new THREE.Vector3(0, 1, 0), playerRotation);
    
    // Scale by speed and delta time
    directionVector.multiplyScalar(speed * delta);
    
    // Update position
    const newX = playerPosition.x + directionVector.x;
    const newZ = playerPosition.z + directionVector.z;
    
    // Create a new position
    const newPosition = new THREE.Vector3(newX, playerPosition.y, newZ);
    
    // Update mesh position directly
    playerRef.current.position.copy(newPosition);
    playerRef.current.rotation.y = playerRotation;
    
    // Update state - only if position actually changed
    if (moveDirection.forward !== 0 || moveDirection.right !== 0) {
      setPlayerPosition(newPosition);
    }
  });
  
  return (
    <Suspense fallback={
      <mesh 
        ref={playerRef} 
        position={[playerPosition.x, playerPosition.y, playerPosition.z]}
        rotation={[0, playerRotation, 0]}
      >
        <boxGeometry args={[1, 2, 1]} />
        <meshStandardMaterial color="blue" />
      </mesh>
    }>
      <ModelWithFallback 
        playerRef={playerRef} 
        position={[playerPosition.x, playerPosition.y, playerPosition.z]} 
        rotation={[0, playerRotation, 0]} 
      />
    </Suspense>
  );
};

// GLB model with fallback to blue cube when loading or on error
const ModelWithFallback: React.FC<ModelWithFallbackProps> = ({ playerRef, position, rotation }) => {
  const [modelLoaded, setModelLoaded] = useState(false);
  const [modelError, setModelError] = useState(false);
  const [modelOffset, setModelOffset] = useState(0);
  
  // Load GLB model
  const { scene, animations } = useGLTF('/models/player/warrior.glb');
  
  // Setup model on first load
  useEffect(() => {
    try {
      if (scene) {
        console.log('Loading GLB model...', scene);
        
        // Setup materials and shadows
        scene.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            console.log('Found mesh:', child.name);
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        
        // Scale the model appropriately
        scene.scale.set(2, 2, 2);
        
        // Calculate bounding box to properly position the model
        const box = new THREE.Box3().setFromObject(scene);
        const height = box.max.y - box.min.y;
        const offset = box.min.y;
        
        console.log('Model height:', height);
        console.log('Model offset:', offset);
        
        // Store the offset for use in rendering
        setModelOffset(-offset);
        
        setModelLoaded(true);
        setModelError(false);
      }
    } catch (error) {
      console.error("Failed to load GLB model:", error);
      setModelError(true);
      setModelLoaded(false);
    }
  }, [scene]);
  
  // If model loaded successfully, return it
  if (modelLoaded && !modelError) {
    return (
      <group
        ref={playerRef}
        position={position} 
        rotation={rotation}
      >
        <group position={[0, modelOffset, 0]}>
          <primitive object={scene} />
        </group>
        {/* Yellow indicator to show which way is forward */}
        <mesh position={[0, 0, -0.6]} scale={[0.2, 0.2, 0.2]}>
          <boxGeometry />
          <meshStandardMaterial color="yellow" />
        </mesh>
      </group>
    );
  }
  
  // Fallback to blue cube if model fails to load or is still loading
  return (
    <group 
      ref={playerRef}
      position={position} 
      rotation={rotation}
    >
      <mesh>
        <boxGeometry args={[1, 2, 1]} />
        <meshStandardMaterial color="blue" />
      </mesh>
      {/* Directional indicator (front of player) */}
      <mesh position={[0, 0, -0.6]}>
        <boxGeometry args={[0.2, 0.2, 0.2]} />
        <meshStandardMaterial color="yellow" />
      </mesh>
    </group>
  );
};

// Preload the model
useGLTF.preload('/models/player/warrior.glb');

// Camera that follows the player
const PlayerCamera: React.FC<CameraProps> = ({ playerRef, playerRotation }) => {
  const { camera } = useThree();
  
  // Set initial camera position
  useEffect(() => {
    camera.position.set(0, 5, 8);
    camera.lookAt(0, 1, 0);
  }, [camera]);
  
  // Update camera position to follow player with rotation
  useFrame(() => {
    if (!playerRef.current) return;
    
    const playerPos = playerRef.current.position;
    
    // Camera offset positioned behind and slightly to the right of player
    const offsetDistance = 4;  // Distance behind player
    const offsetHeight = 5;    // Increased height from 3 to 5
    const offsetRight = 1.2;   // Offset to the right for over-the-shoulder view
    
    // Calculate offset based on player rotation
    const backwardOffset = new THREE.Vector3(0, 0, offsetDistance);
    backwardOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), playerRotation);
    
    const rightOffset = new THREE.Vector3(offsetRight, 0, 0);
    rightOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), playerRotation);
    
    // Position camera relative to player with proper offset
    camera.position.set(
      playerPos.x + backwardOffset.x + rightOffset.x,
      playerPos.y + offsetHeight,
      playerPos.z + backwardOffset.z + rightOffset.z
    );
    
    // Look at point slightly ahead of player (where they're facing)
    const lookAtPoint = new THREE.Vector3(0, 0, -4);
    lookAtPoint.applyAxisAngle(new THREE.Vector3(0, 1, 0), playerRotation);
    
    camera.lookAt(
      playerPos.x + lookAtPoint.x,
      playerPos.y + 1, // Look at player's head level
      playerPos.z + lookAtPoint.z
    );
  });
  
  return null;
};

// Monster component
const Monster: React.FC<{ position: [number, number, number] }> = ({ position }) => {
  const [modelLoaded, setModelLoaded] = useState(false);
  const [modelOffset, setModelOffset] = useState(0);
  
  // Load GLB model
  const { scene } = useGLTF('/models/player/monster.glb');
  
  // Setup model on first load
  useEffect(() => {
    if (scene) {
      console.log('Loading monster model...');
      
      // Setup materials and shadows
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      
      // Scale the model appropriately
      scene.scale.set(2.5, 2.5, 2.5);
      
      // Calculate bounding box to properly position the model
      const box = new THREE.Box3().setFromObject(scene);
      const offset = box.min.y;
      
      // Store the offset for use in rendering
      setModelOffset(-offset);
      setModelLoaded(true);
    }
  }, [scene]);
  
  if (!modelLoaded) return null;
  
  return (
    <group position={position}>
      <group position={[0, modelOffset, 0]}>
        <primitive object={scene} />
      </group>
    </group>
  );
};

// Preload the monster model
useGLTF.preload('/models/player/monster.glb');

// Custom skybox component
const Skybox = () => {
  const { scene } = useThree();
  const loader = new THREE.CubeTextureLoader();
  
  useEffect(() => {
    // Load cubemap for environment lighting
    const envMap = loader.load([
      '/skybox/posx.jpg',
      '/skybox/negx.jpg',
      '/skybox/posy.jpg',
      '/skybox/negy.jpg',
      '/skybox/posz.jpg',
      '/skybox/negz.jpg'
    ]);
    
    // Set environment map for lighting
    scene.environment = envMap;
    
    // Create canvas for gradient background
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 2;
    const context = canvas.getContext('2d');
    
    if (context) {
      // Create gradient for dark sunset
      const gradient = context.createLinearGradient(0, 0, 0, 2);
      gradient.addColorStop(0, '#0a0a1a');    // Dark blue-black at top
      gradient.addColorStop(0.5, '#1a1025');   // Deep purple-blue
      gradient.addColorStop(0.7, '#1f1028');   // Slightly lighter purple
      gradient.addColorStop(0.8, '#2a1030');   // Rich purple
      gradient.addColorStop(0.9, '#3d1030');   // Deep magenta
      gradient.addColorStop(0.95, '#4d1030');  // Darker red
      gradient.addColorStop(1, '#661030');     // Deep red at horizon
      
      // Fill canvas with gradient
      context.fillStyle = gradient;
      context.fillRect(0, 0, 2, 2);
      
      // Create texture from canvas
      const texture = new THREE.CanvasTexture(
        canvas,
        THREE.UVMapping,
        THREE.ClampToEdgeWrapping,
        THREE.ClampToEdgeWrapping,
        THREE.LinearFilter,
        THREE.LinearFilter
      );
      
      // Set as scene background
      scene.background = texture;
    }
  }, [scene]);
  
  return null;
};

// Simple environment
const Environment = () => {
  // Load the texture
  const texture = useLoader(THREE.TextureLoader, '/texture/asphalt_02_diff_4k.jpg');
  
  // Configure texture
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(20, 20); // Adjust the number to change the texture repeat
  
  return (
    <>
      {/* Ground - Dark with grid pattern */}
      <group position={[0, 0.01, 0]}>
        <gridHelper args={[100, 100]} position={[0, 0, 0]}>
          <lineBasicMaterial color="#00ffff" opacity={0.8} transparent />
        </gridHelper>
      </group>
      <Plane 
        rotation={[-Math.PI / 2, 0, 0]} 
        position={[0, 0, 0]} 
        args={[100, 100]}
      >
        <meshStandardMaterial
          map={texture}
          metalness={0.1}
          roughness={0.9}
          emissive="#000000"
          emissiveIntensity={0.1}
        />
      </Plane>
      
      {/* Custom skybox */}
      <Skybox />
      
      {/* Ambient light - Brighter base light */}
      <ambientLight color="#ffffff" intensity={0.6} />
      
      {/* Main directional light - Brighter and whiter */}
      <directionalLight 
        position={[10, 10, 10]} 
        intensity={1.5}
        color="#ffffff"
      />
      
      {/* Accent lights for cyberpunk feel */}
      <pointLight position={[0, 15, 0]} intensity={2} color="#ff00ff" />
      <pointLight position={[20, 15, 20]} intensity={2} color="#00ffff" />
      <pointLight position={[-20, 15, -20]} intensity={2} color="#ff00ff" />

      {/* Basic level geometry */}
      {/* Central structure */}
      <Box position={[0, 5, -20]} args={[10, 10, 2]}>
        <meshStandardMaterial 
          color="#333333" 
          metalness={0.3} 
          roughness={0.7}
          emissive="#00ffff"
          emissiveIntensity={0.2}
        />
      </Box>

      {/* Side barriers */}
      <Box position={[15, 3, 0]} args={[2, 6, 40]}>
        <meshStandardMaterial 
          color="#333333" 
          metalness={0.3} 
          roughness={0.7}
          emissive="#ff00ff"
          emissiveIntensity={0.2}
        />
      </Box>
      <Box position={[-15, 3, 0]} args={[2, 6, 40]}>
        <meshStandardMaterial 
          color="#333333" 
          metalness={0.3} 
          roughness={0.7}
          emissive="#00ffff"
          emissiveIntensity={0.2}
        />
      </Box>

      {/* Cover blocks */}
      <Box position={[7, 2, 10]} args={[4, 4, 4]}>
        <meshStandardMaterial 
          color="#333333" 
          metalness={0.3} 
          roughness={0.7}
          emissive="#ff00ff"
          emissiveIntensity={0.2}
        />
      </Box>
      <Box position={[-7, 2, -10]} args={[4, 4, 4]}>
        <meshStandardMaterial 
          color="#333333" 
          metalness={0.3} 
          roughness={0.7}
          emissive="#00ffff"
          emissiveIntensity={0.2}
        />
      </Box>
      <Box position={[0, 2, 0]} args={[6, 4, 6]}>
        <meshStandardMaterial 
          color="#333333" 
          metalness={0.3} 
          roughness={0.7}
          emissive="#ff00ff"
          emissiveIntensity={0.2}
        />
      </Box>

      {/* Monsters */}
      <Suspense fallback={null}>
        <Monster position={[5, 0, 0]} />
        <Monster position={[-5, 0, -5]} />
      </Suspense>
    </>
  );
};

// Main Game Component
const GameComponent = () => {
  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <Canvas>
        <GameScene />
      </Canvas>
    </div>
  );
};

export default GameComponent; 