'use client';

import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle, ForwardRefRenderFunction, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';
import * as THREE from 'three';
import * as dat from 'lil-gui';

import { PhysicsBody } from '../physics';
import { PHYSICS } from '../physics';

// Export interface for the ref
export interface CharacterControllerRef {
  characterRef: THREE.Group | THREE.Mesh | null;
  playAnimation: (name: string, isManualSelection?: boolean) => void;
  shoot: () => void;
}

interface CharacterControllerProps {
  // Model to use, if none provided will use a simple box
  modelPath?: string;
  // Path to the animation host model to use for animations
  animationsPath?: string;
  // Initial position
  position?: [number, number, number];
  // Scale of the model
  scale?: number;
  // Movement speed
  speed?: number;
  // Whether to enable keyboard controls
  enableKeyboardControls?: boolean;
  // Default animation to play when loaded
  defaultAnimation?: string;
  // Enable debug mode for verbose logging
  debug?: boolean;
  // Weapon model path
  weaponPath?: string;
}

/**
 * Character controller component that handles input, movement, and rendering
 * This combines both the model and controller in one component for simplicity
 */
const CharacterController: ForwardRefRenderFunction<CharacterControllerRef, CharacterControllerProps> = ({
  modelPath = '/models/player/2_2.glb',
  animationsPath = '/models/player/animation_host.glb', // Using the animation host GLB file instead of FBX
  position = [0, 0.1, 0], // Raised slightly above ground level to allow jet to work
  scale = 2,
  speed = 5,
  enableKeyboardControls = true,
  defaultAnimation = 'RifleIdle',
  debug = false,
  weaponPath = '/models/weapon/rifle2.glb'
}, ref) => {
  // Reference to the character model or group
  const characterRef = useRef<THREE.Group | THREE.Mesh>(null);
  
  // Reference for weapon
  const rifleRef = useRef<THREE.Group | null>(null);
  const handBoneRef = useRef<THREE.Object3D | null>(null);
  // Reference for the gun muzzle
  const muzzleRef = useRef<THREE.Object3D | null>(null);
  // Reference for shell ejection point
  const ejectorRef = useRef<THREE.Object3D | null>(null);
  
  // Add ref for sound effects
  const rifleFireSoundRef = useRef<HTMLAudioElement | null>(null);
  
  // State for movement direction
  const [moveDirection, setMoveDirection] = useState({ 
    x: 0,  // Left/right movement (this will be our main side-scrolling axis)
    y: 0,  // Up/down movement (jumping, gravity)
    z: 0,  // Forward/backward movement (limited for side-scrolling)
    jump: false, // Jump input state
    jet: false   // Jet pack input state
  });
  
  // State for movement constraints
  const [movementConstraints, setMovementConstraints] = useState({
    lockZ: true,     // Lock forward/backward movement for side-scrolling
    lockRotation: true, // Lock rotation for side-scrolling
    enableGravity: false // Will enable later with physics
  });
  
  // State for character rotation
  const [rotation, setRotation] = useState(0);
  
  // State for animation
  const [availableAnimations, setAvailableAnimations] = useState<string[]>([]);
  const [currentAnimation, setCurrentAnimation] = useState<string | null>(null);
  const [isManualAnimationActive, setIsManualAnimationActive] = useState(false);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<{ [key: string]: THREE.AnimationAction }>({});
  const clockRef = useRef<THREE.Clock | null>(null);
  
  // State for debugging
  const [debugInfo, setDebugInfo] = useState({
    position: position,
    rotation: rotation.toFixed(2),
    isMoving: false,
    currentAnimation: null as string | null,
    availableAnimations: [] as string[]
  });
  
  // Load model if provided
  const { scene } = useGLTF(modelPath, true);
  
  // Load animations from animation host
  const animationsResult = useGLTF(animationsPath, true);
  const animations = animationsResult.animations;
  
  // Load the rifle model
  const { scene: rifleScene } = useGLTF(weaponPath, true);
  
  // Mouse tracking for aiming
  const mousePosition = useRef(new THREE.Vector2());
  const [worldMousePosition, setWorldMousePosition] = useState(new THREE.Vector3());
  
  // Bone references for upper body aiming
  const [upperBodyBones, setUpperBodyBones] = useState<{
    spine: THREE.Object3D | null;
    spine1: THREE.Object3D | null;
    spine2: THREE.Object3D | null;
    neck: THREE.Object3D | null;
    leftHand: THREE.Object3D | null;
    rightHand: THREE.Object3D | null;
  }>({
    spine: null,
    spine1: null,
    spine2: null,
    neck: null,
    leftHand: null,
    rightHand: null
  });
  
  // Add state to track facing direction
  const [facingDirection, setFacingDirection] = useState<'left' | 'right'>('right');
  
  // Add state for rifle offsets
  const [rifleOffsets, setRifleOffsets] = useState({
    RifleRun: {
      position: { x: 0.06, y: 0.05, z: 0.35 },
      rotation: { x: Math.PI / 8, y: Math.PI / 1 + 1.8, z: -Math.PI / 2 }
    },
    RifleIdle: {
      position: { x: 0.08, y: 0.0, z: 0.15 },
      rotation: { 
        x: -5 * (Math.PI / 180),
        y: -90 * (Math.PI / 180),
        z: -100 * (Math.PI / 180)
      }
    },
    "Backwards Rifle Run": {
      position: { x: 0.07, y: 0.03, z: 0.3 },
      rotation: { 
        x: Math.PI / 10,
        y: Math.PI / 1 + 1,
        z: -Math.PI / 2
      }
    }
  });
  
  // Default offsets for any animation not in the mapping
  const DEFAULT_OFFSETS = {
    position: { x: 0.06, y: 0.02, z: 0.35 },
    rotation: { x: Math.PI / 16, y: Math.PI / 1 + 1.8, z: -Math.PI / 2 }
  };
  
  // Get camera from useThree
  const { camera } = useThree();
  
  // Add state for camera zoom
  const [cameraZoom, setCameraZoom] = useState(15); // Initial zoom distance
  
  // Add state for GUI visibility
  const [guiVisible, setGuiVisible] = useState(true);
  
  // Add state for smooth mouse direction tracking
  const smoothedScreenDirectionRef = useRef(new THREE.Vector2());
  
  // Remove the history state
  const [aimHistory, setAimHistory] = useState<{
    horizontalAngle: number[],
    verticalAngle: number[]
  }>({
    horizontalAngle: Array(6).fill(0),
    verticalAngle: Array(6).fill(0)
  });
  
  // Add state for handling shooting
  const [isShooting, setIsShooting] = useState(false);
  const [lastShotTime, setLastShotTime] = useState(0);
  const [isMouseDown, setIsMouseDown] = useState(false);
  const shootIntervalRef = useRef<number | null>(null);
  const isMouseDownRef = useRef(false); // Add a ref for tracking mouse state without rerender issues
  
  // Add weapon configuration state
  const [weaponConfig, setWeaponConfig] = useState({
    isAutomatic: true,
    fireRate: 10, // Shots per second
    muzzleFlashDuration: 50, // ms
    recoil: 0.02,
    maxRecoil: 0.1,
    recoilRecovery: 0.01
  });
  
  // Add recoil tracking
  const currentRecoilRef = useRef(0);
  
  // Add ref for muzzle flash
  const muzzleFlashRef = useRef<THREE.Mesh | null>(null);
  const muzzleFlashLightRef = useRef<THREE.PointLight | null>(null);
  const [muzzleFlashVisible, setMuzzleFlashVisible] = useState(false);
  
  // Add ref for shell casings
  const shellCasingsRef = useRef<THREE.InstancedMesh | null>(null);
  const maxShells = 30; // Maximum number of shell casings visible at once
  const shellMatrixRef = useRef<THREE.Matrix4[]>([]);
  const shellSpeedRef = useRef<{x: number, y: number, z: number}[]>([]);
  const shellLifeRef = useRef<number[]>([]);
  const nextShellIndexRef = useRef(0);
  
  // Add state for shell casings
  const [shellCasings, setShellCasings] = useState<{
    position: THREE.Vector3;
    rotation: THREE.Euler;
    velocity: { x: number, y: number, z: number };
    lifetime: number;
  }[]>([]);
  
  // Add physics body reference
  const physicsBodyRef = useRef<PhysicsBody | null>(null);
  
  // Initialize physics body
  useEffect(() => {
    if (characterRef.current) {
      physicsBodyRef.current = new PhysicsBody(characterRef.current.position);
    }
  }, []);
  
  // Log model details
  useEffect(() => {
    console.log('Model path:', modelPath);
    
    // Check for skeletons in the model
    let skeletonFound = false;
    scene.traverse((node) => {
      if (node.type === 'SkinnedMesh') {
        console.log('SkinnedMesh found:', node.name);
        skeletonFound = true;
        
        // @ts-ignore - skeleton property exists on SkinnedMesh
        if (node.skeleton) {
          // @ts-ignore - skeleton property exists on SkinnedMesh
          console.log('Skeleton bones:', node.skeleton.bones.length);
          // @ts-ignore - skeleton property exists on SkinnedMesh
          console.log('First few bone names:', node.skeleton.bones.slice(0, 5).map(b => b.name));
        }
      }
    });
    
    if (!skeletonFound) {
      console.warn('No skeletons found in model - animations may not work');
    }
  }, [scene, modelPath]);
  
  // Log animation host model details
  useEffect(() => {
    console.log('Animation host path:', animationsPath);
    
    // Check for skeletons in the animation host model
    let skeletonFound = false;
    
    // The animation host scene
    const animHostScene = animationsResult.scene;
    
    animHostScene.traverse((node) => {
      if (node.type === 'SkinnedMesh') {
        console.log('Animation host SkinnedMesh found:', node.name);
        skeletonFound = true;
        
        // @ts-ignore - skeleton property exists on SkinnedMesh
        if (node.skeleton) {
          // @ts-ignore - skeleton property exists on SkinnedMesh
          console.log('Animation host skeleton bones:', node.skeleton.bones.length);
          // @ts-ignore - skeleton property exists on SkinnedMesh
          console.log('Animation host first few bone names:', node.skeleton.bones.slice(0, 5).map(b => b.name));
        }
      }
    });
    
    if (!skeletonFound) {
      console.warn('No skeletons found in animation host model');
    }
  }, [animationsResult, animationsPath]);
  
  // Log animation details for debugging
  useEffect(() => {
    console.log('Animation host path:', animationsPath);
    console.log('Animations found:', animations?.length || 0);
    console.log('Animation names:', animations?.map(clip => clip.name) || []);
    
    // Check specifically for Rifle Fire animation
    const hasFiringAnimation = animations?.some(clip => clip.name === 'Rifle Fire');
    console.log('Rifle Fire animation available:', hasFiringAnimation ? 'Yes' : 'No');
  }, [animations, animationsPath]);
  
  // Set up animations - IMPORTANT FIX: Using original scene instead of clone
  const { actions, mixer } = useAnimations(animations, scene);
  
  // Log mixer and actions for debugging
  useEffect(() => {
    console.log('Mixer created:', mixer ? 'Yes' : 'No');
    console.log('Actions available:', actions ? Object.keys(actions).length : 0);
    if (actions) {
      console.log('Action names:', Object.keys(actions));
    }
  }, [mixer, actions]);
  
  // Initialize mixer and clock
  useEffect(() => {
    if (!mixer) return;
    
    mixerRef.current = mixer;
    clockRef.current = new THREE.Clock();
    
    return () => {
      mixer.stopAllAction();
      if (clockRef.current) {
        clockRef.current.running = false;
      }
    };
  }, [mixer]);
  
  // Setup animations once
  useEffect(() => {
    if (!animations?.length || !actions || !mixer) return;
    
    console.log(`Available animations:`, animations.map(clip => clip.name));
    
    // Configure all animations
    animations.forEach(clip => {
      const action = actions[clip.name];
      if (action) {
        // Special handling for RifleJump to prevent it from freezing
        if (clip.name === 'RifleJump') {
          action.reset();
          action.clampWhenFinished = false;
          action.setLoop(THREE.LoopOnce, 1);
          action.timeScale = 1.0;
          action.weight = 1.0;
        } else {
          // Reset and configure the action
          action.reset();
          action.clampWhenFinished = false;
          action.loop = THREE.LoopRepeat;
          action.repetitions = Infinity;
          action.timeScale = 1.0;
          action.weight = 1.0;
        }
        
        // Store the configured action
        actionsRef.current[clip.name] = action;
      }
    });
    
    // Save available animations for UI
    const animationNames = animations.map(clip => clip.name);
    setAvailableAnimations(animationNames);
    
    // Start animation loop
    let frameId: number;
    clockRef.current?.start();
    
    const animate = () => {
      if (mixerRef.current && clockRef.current) {
        const delta = clockRef.current.getDelta();
        mixerRef.current.update(delta);
      }
      frameId = requestAnimationFrame(animate);
    };
    
    animate();
    
    // Play default animation if available
    if (defaultAnimation && actions[defaultAnimation]) {
      playAnimation(defaultAnimation);
      console.log(`Playing default animation: ${defaultAnimation}`);
    } else if (animationNames.length > 0) {
      // Play the first animation if default not available
      playAnimation(animationNames[0]);
      console.log(`Default animation not available, playing first animation: ${animationNames[0]}`);
    }
    
    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [animations, actions, mixer, defaultAnimation]);
  
  // Function to play an animation
  const playAnimation = (name: string, isManualSelection = false) => {
    console.log(`Attempting to play animation: ${name}, Manual selection: ${isManualSelection}`);
    
    if (!actions || !actions[name]) {
      console.error(`No action found for animation: ${name}`);
      console.log('Available actions:', actions ? Object.keys(actions) : 'none');
      return;
    }
    
    // Track whether this animation was manually selected
    if (isManualSelection) {
      setIsManualAnimationActive(true);
      
      // For manually selected animations, set a timeout to allow movement animations again
      // after a reasonable preview period (5 seconds)
      setTimeout(() => {
        setIsManualAnimationActive(false);
      }, 5000);
    }
    
    // Stop current animation if any
    if (currentAnimation && actions[currentAnimation]) {
      console.log(`Stopping current animation: ${currentAnimation}`);
      actions[currentAnimation].fadeOut(0.2);
    }
    
    const action = actions[name];
    console.log(`Setting up animation: ${name}`);
    action.reset();
    action.setEffectiveWeight(1.0);
    
    // Determine if this animation should be looped
    // Add special case handling for any animations that shouldn't loop
    const nonLoopingAnimations = ['Rifle Fire', 'RifleJump'];
    
    if (nonLoopingAnimations.includes(name)) {
      // Special handling for jump animation to freeze at the end frame
      if (name === 'RifleJump') {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true; // This is key: KEEP the last pose until we explicitly transition
      } else {
        // For other non-looping animations
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = false;
      }
    } else {
      // For looping animations
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = false;
    }
    
    action.fadeIn(0.2);
    action.play();
    console.log(`Animation started: ${name}`);
    
    setCurrentAnimation(name);
  };
  
  // Set up keyboard controls
  useEffect(() => {
    if (!enableKeyboardControls) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.code) {
        // Side-scrolling controls: A/D or Left/Right for horizontal movement
        case 'KeyA': 
        case 'ArrowLeft': 
          setMoveDirection(prev => ({ ...prev, x: -1 })); 
          // No longer directly setting animation here, it's handled in useFrame
          break;
        case 'KeyD': 
        case 'ArrowRight': 
          setMoveDirection(prev => ({ ...prev, x: 1 })); 
          // No longer directly setting animation here, it's handled in useFrame
          break;
        // Jump with Space
        case 'Space':
          // Only set jump to true if we're on the ground and not already jumping
          if (physicsBodyRef.current && physicsBodyRef.current.isGrounded() && !moveDirection.jump) {
            setMoveDirection(prev => ({ ...prev, jump: true }));
            // Only play jump animation once when leaving the ground
            if (actions && actions['RifleJump']) {
              playAnimation('RifleJump');
            }
          }
          break;
        // Up/down are still available but may be disabled for pure side-scrolling
        case 'KeyW': 
        case 'ArrowUp': 
          if (!movementConstraints.lockZ) {
            setMoveDirection(prev => ({ ...prev, z: -1 })); 
          }
          break;
        case 'KeyS': 
        case 'ArrowDown': 
          if (!movementConstraints.lockZ) {
            setMoveDirection(prev => ({ ...prev, z: 1 })); 
          }
          break;
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyA':
        case 'ArrowLeft': 
          setMoveDirection(prev => ({ ...prev, x: 0 }));
          // Animation will be handled in useFrame
          break;
        case 'KeyD':
        case 'ArrowRight': 
          setMoveDirection(prev => ({ ...prev, x: 0 }));
          // Animation will be handled in useFrame
          break;
        case 'Space':
          setMoveDirection(prev => ({ ...prev, jump: false }));
          break;
        case 'KeyW':
        case 'ArrowUp':
          if (!movementConstraints.lockZ) {
            setMoveDirection(prev => ({ ...prev, z: 0 }));
          }
          break;
        case 'KeyS':
        case 'ArrowDown': 
          if (!movementConstraints.lockZ) {
            setMoveDirection(prev => ({ ...prev, z: 0 }));
          }
          break;
      }
    };
    
    // Handle rotation with Q and E keys
    const handleRotation = (e: KeyboardEvent) => {
      if (e.code === 'KeyQ') {
        setRotation(prev => prev + 0.1); // Rotate left
      } else if (e.code === 'KeyE') {
        setRotation(prev => prev - 0.1); // Rotate right
      }
    };
    
    // Add animation testing keys (1-9)
    const handleAnimationTest = (e: KeyboardEvent) => {
      // Number keys 1-9 for testing animations
      if (e.code.startsWith('Digit') && availableAnimations.length > 0) {
        const digit = parseInt(e.code.replace('Digit', ''), 10) - 1;
        if (digit >= 0 && digit < availableAnimations.length) {
          playAnimation(availableAnimations[digit], true); // Mark as manual selection
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('keydown', handleRotation);
    window.addEventListener('keydown', handleAnimationTest);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('keydown', handleRotation);
      window.removeEventListener('keydown', handleAnimationTest);
    };
  }, [enableKeyboardControls, currentAnimation, actions, availableAnimations, movementConstraints.lockZ, playAnimation]);
  
  // Find spine bones when scene is loaded
  useEffect(() => {
    if (!scene) return;
    
    console.log('Searching for bones in model...');
    
    // Find and store spine bones for aiming
    const spineBones: {
      spine: THREE.Object3D | null;
      spine1: THREE.Object3D | null;
      spine2: THREE.Object3D | null;
      neck: THREE.Object3D | null;
      leftHand: THREE.Object3D | null;
      rightHand: THREE.Object3D | null;
    } = {
      spine: null,
      spine1: null,
      spine2: null,
      neck: null,
      leftHand: null,
      rightHand: null
    };
    
    // Try direct bone search first
    let foundBone = false;
    scene.traverse((object) => {
      if (object.name === 'mixamorigRightHand') {
        console.log('Found the mixamorigRightHand bone directly:', object);
        handBoneRef.current = object;
        foundBone = true;
      }
    });
    
    // If not found directly, try finding it in skinned meshes
    if (!foundBone) {
      console.log('Hand bone not found directly, checking skinned meshes...');
      
      scene.traverse((object) => {
        if (object instanceof THREE.SkinnedMesh && object.skeleton) {
          console.log(`Found skinned mesh: ${object.name} with ${object.skeleton.bones.length} bones`);
          
          object.skeleton.bones.forEach((bone, index) => {
            if (bone.name === 'mixamorigRightHand') {
              console.log(`Found mixamorigRightHand in skeleton at index ${index}:`, bone);
              handBoneRef.current = bone;
              foundBone = true;
            }
          });
        }
      });
    }
    
    // Search for spine bones in the model
    scene.traverse((object) => {
      if (object.type === 'Bone' || (object as any).isBone) {
        const name = object.name.toLowerCase();
        
        if (name.includes('spine') && !name.includes('spine1') && !name.includes('spine2')) {
          spineBones.spine = object;
          console.log('Found spine bone:', object.name);
        } else if (name.includes('spine1')) {
          spineBones.spine1 = object;
          console.log('Found spine1 bone:', object.name);
        } else if (name.includes('spine2') || name.includes('chest')) {
          spineBones.spine2 = object;
          console.log('Found spine2/chest bone:', object.name);
        } else if (name.includes('neck')) {
          spineBones.neck = object;
          console.log('Found neck bone:', object.name);
        } else if (name.includes('hand') && name.includes('left')) {
          spineBones.leftHand = object;
          console.log('Found left hand bone:', object.name);
        }
      }
    });
    
    // Store the bones for aiming
    setUpperBodyBones(spineBones);
    
    // Create rifle instance from rifle model once bones are found
    if (rifleScene) {
      console.log('Creating rifle instance');
      const rifleCopy = rifleScene.clone();
      rifleCopy.scale.set(0.7, 0.7, 0.7);
      
      // Look for the gun_muzzle and ejector objects in the rifle model
      rifleCopy.traverse((object) => {
        if (object.name === 'gun_muzzle') {
          console.log('Found gun_muzzle in rifle model:', object);
          muzzleRef.current = object;
        }
        if (object.name === 'ejector') {
          console.log('Found ejector in rifle model:', object);
          ejectorRef.current = object;
        }
      });
      
      // If muzzle or ejector not found, log warning
      if (!muzzleRef.current) {
        console.warn('No gun_muzzle object found in rifle model, flash effects may not work correctly');
      }
      if (!ejectorRef.current) {
        console.warn('No ejector object found in rifle model, shell casings may not eject correctly');
      }
      
      rifleRef.current = rifleCopy;
      console.log('Rifle reference set');
    }
  }, [scene, rifleScene]);
  
  // Set up mouse tracking
  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      // Track mouse position in normalized device coordinates
      mousePosition.current.set(
        (event.clientX / window.innerWidth) * 2 - 1,
        -(event.clientY / window.innerHeight) * 2 + 1
      );
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);
  
  // Convert mouse position to world space
  useFrame(({ camera, raycaster }) => {
    if (!characterRef.current) return;
    
    // Get character position in world space
    const characterPosition = characterRef.current.position.clone();
    
    // Create a plane at the character's height
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -characterPosition.z);
    
    // Set up raycaster from camera using mouse position
    raycaster.setFromCamera(mousePosition.current, camera);
    
    // Find intersection with the plane
    const intersectionPoint = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, intersectionPoint);
    
    // Use the intersection point directly as the aim point
    // This will allow the aim point to follow the mouse without distance constraints
    setWorldMousePosition(intersectionPoint);
    
    // if (debug) {
    //   console.log('Mouse tracking:', {
    //     mousePos: { x: mousePosition.current.x, y: mousePosition.current.y },
    //     worldAimPoint: intersectionPoint,
    //     characterPosition: characterPosition
    //   });
    // }
  });
  
  // Add mouse wheel handler for camera zoom
  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      // Prevent default scrolling behavior
      event.preventDefault();
      
      // Adjust zoom based on wheel delta
      // Positive deltaY means scrolling down (zoom out)
      // Negative deltaY means scrolling up (zoom in)
      const zoomDelta = event.deltaY * 0.01;
      setCameraZoom(prev => {
        // Clamp zoom between 5 and 30
        const newZoom = Math.max(5, Math.min(30, prev + zoomDelta));
        return newZoom;
      });
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, []);

  // Update camera position with zoom
  useEffect(() => {
    if (!characterRef.current) return;
    
    const offset = [0, 5, cameraZoom];
    camera.position.set(offset[0], offset[1], offset[2]);
    
    // For true side-scrolling, we look straight ahead
    camera.lookAt(offset[0], offset[1] - 2, 0);
    
    // Reset rotation to ensure we're looking along Z axis
    camera.rotation.y = 0;
    camera.updateProjectionMatrix();
  }, [camera, cameraZoom]);
  
  // Update character position and rotation each frame
  useFrame((state, delta) => {
    if (!characterRef.current || !scene || !physicsBodyRef.current) return;
    
    // Debug log for jump state if triggered by right-click
    if (debug && moveDirection.jump) {
      console.log('Jump state:', { 
        jump: moveDirection.jump,
        grounded: physicsBodyRef.current.getState().grounded
      });
    }

    // Debug log for jet pack state
    if (debug && moveDirection.jet) {
      console.log('Jet pack state:', { 
        jet: moveDirection.jet,
        grounded: physicsBodyRef.current.getState().grounded,
        velocity: physicsBodyRef.current.getState().velocity.y.toFixed(2),
        position: physicsBodyRef.current.getState().position.y.toFixed(2)
      });
    }

    // Get physics state before update
    const wasGrounded = physicsBodyRef.current.getState().grounded;

    // Update physics with both jump and jet parameters
    physicsBodyRef.current.update(delta, { 
      jump: moveDirection.jump,
      jet: moveDirection.jet 
    });

    // Get updated physics state
    const isNowGrounded = physicsBodyRef.current.getState().grounded;
    
    // Detect landing - if we just hit the ground
    if (!wasGrounded && isNowGrounded) {
      // We just landed, play idle or run animation based on movement state
      const isMoving = moveDirection.x !== 0 || moveDirection.z !== 0;
      
      if (isMoving) {
        // Check if we should use normal run or backwards run
        const screenDirection = smoothedScreenDirectionRef.current.clone().normalize();
        const isMovingOppositeToAiming = 
          (moveDirection.x > 0 && screenDirection.x < -0.2) || 
          (moveDirection.x < 0 && screenDirection.x > 0.2);
        
        if (isMovingOppositeToAiming && actions && actions['Backwards Rifle Run']) {
          playAnimation('Backwards Rifle Run');
        } else if (actions && actions['RifleRun']) {
          playAnimation('RifleRun');
        }
      } else if (actions && actions['RifleIdle']) {
        playAnimation('RifleIdle');
      }
    }

    // Get updated position from physics
    const physicsPosition = physicsBodyRef.current.getPosition();
    
    // Update character position with physics position
    characterRef.current.position.y = physicsPosition.y;

    // Create direction vector for horizontal movement
    const directionVector = new THREE.Vector3(
      moveDirection.x,
      0, // Y movement now handled by physics
      movementConstraints.lockZ ? 0 : moveDirection.z
    );

    // Only normalize if there's actual movement
    const isMoving = directionVector.length() > 0;

    if (isMoving) {
      directionVector.normalize();
      
      // Apply movement to X and Z
      const finalDirection = directionVector.clone();
      finalDirection.multiplyScalar(speed * delta);
      
      // Update position for X and Z only
      characterRef.current.position.x += finalDirection.x;
      characterRef.current.position.z += finalDirection.z;

      // Update physics body position
      physicsBodyRef.current.setPosition(characterRef.current.position);
    }
    
    // Add debug logging to track movement state
    if (debug && Math.random() < 0.01) {
      console.log('Movement debug:', {
        moveDirection,
        directionVector,
        isMoving,
        currentAnimation,
        isShooting,
        physicsState: physicsBodyRef.current.getState()
      });
    }
    
    // Determine facing direction based on mouse position
    // Get screen-space direction from character to mouse
    const charPosition = characterRef.current.position.clone();
    const screenCharPos = charPosition.clone().project(state.camera);
    const rawScreenDirection = new THREE.Vector2(
      mousePosition.current.x - screenCharPos.x,
      mousePosition.current.y - screenCharPos.y
    );
    
    // Apply smoothing to the screen direction vector
    // Use a much smaller lerp factor for more stable movement
    const screenDirectionLerpFactor = delta * 3; // Reduced from implied 1.0 to 3.0 * delta
    
    // Smooth the input values before normalization
    smoothedScreenDirectionRef.current.x = THREE.MathUtils.lerp(
      smoothedScreenDirectionRef.current.x, 
      rawScreenDirection.x,
      screenDirectionLerpFactor
    );
    
    smoothedScreenDirectionRef.current.y = THREE.MathUtils.lerp(
      smoothedScreenDirectionRef.current.y,
      rawScreenDirection.y,
      screenDirectionLerpFactor
    );
    
    // Add a dead zone to filter out very small movements
    const deadZone = 0.05;
    const filteredDirection = new THREE.Vector2(
      Math.abs(smoothedScreenDirectionRef.current.x) < deadZone ? 0 : smoothedScreenDirectionRef.current.x,
      Math.abs(smoothedScreenDirectionRef.current.y) < deadZone ? 0 : smoothedScreenDirectionRef.current.y
    );
    
    // Normalize after smoothing and filtering
    const screenDirection = filteredDirection.clone().normalize();
    
    // Use mouse X position to determine facing, but only if moving or aiming
    let shouldFaceRight = screenDirection.x > 0;
    
    // Track if we're moving opposite to aim direction for backwards animation
    let isMovingOppositeToAiming = false;
    
    // If moving, check direction
    if (isMoving) {
      shouldFaceRight = moveDirection.x > 0;
      
      // Check if we're aiming in opposite direction of movement
      isMovingOppositeToAiming = (shouldFaceRight && screenDirection.x < -0.2) || 
                                (!shouldFaceRight && screenDirection.x > 0.2);
      
      // When moving backwards, face the aim direction, not the movement direction
      if (isMovingOppositeToAiming) {
        // For backwards running, we want to face where we're aiming, not where we're moving
        shouldFaceRight = screenDirection.x > 0;
      }
      
      // Set the character's facing direction based on determined direction
      setFacingDirection(shouldFaceRight ? 'right' : 'left');
      
      // Only change animations if no manual animation is active or if we're already in a movement animation
      if (!isManualAnimationActive) {
        const physicsState = physicsBodyRef.current.getState();
        const isInAir = !physicsState.grounded;
        const wasJustOnGround = physicsState.lastJumpTime < 0.1; // Check if we just left the ground

        // Handle jump/air state first
        if (isInAir) {
          // Only play the jump animation once when first leaving the ground
          if (wasJustOnGround && actions['RifleJump'] && currentAnimation !== 'RifleJump') {
            playAnimation('RifleJump');
          }
        }
        // Only handle run/idle animations when on the ground
        else if (!isInAir) {
          // We just landed - ensure we're not stuck in jump animation
          if (currentAnimation === 'RifleJump') {
            if (isMoving) {
              // Land into run
              if (isMovingOppositeToAiming && actions['Backwards Rifle Run']) {
                playAnimation('Backwards Rifle Run');
              } else if (actions['RifleRun']) {
                playAnimation('RifleRun');
              }
            } else {
              // Land into idle
              if (actions['RifleIdle'] && !isShooting) {
                playAnimation('RifleIdle');
              }
            }
          } 
          // Normal ground movement
          else if (isMoving) {
            // Play the appropriate running animation
            if (isMovingOppositeToAiming && actions['Backwards Rifle Run']) {
              if (currentAnimation !== 'Backwards Rifle Run') {
                playAnimation('Backwards Rifle Run');
              }
            } else if (actions['RifleRun']) {
              if (currentAnimation !== 'RifleRun') {
                playAnimation('RifleRun');
              }
            }
          } else if (actions['RifleIdle'] && !isShooting) {
            // Only switch to idle if we're not shooting and not in a special animation
            if (['RifleRun', 'Backwards Rifle Run', 'RifleJump'].includes(currentAnimation || '')) {
              playAnimation('RifleIdle');
            }
          }
        }
      }
    } else {
      // When not moving, maintain the previous facing direction unless aiming significantly left/right
      // Only change facing for significant mouse movement (to avoid flipping back and forth)
      if (Math.abs(screenDirection.x) > 0.2) {
        setFacingDirection(shouldFaceRight ? 'right' : 'left');
      }
      
      // Only revert to idle if:
      // 1. We're not in a manual animation
      // 2. Currently in a movement animation (RifleRun or Backwards Rifle Run)
      // 3. Not in the jump animation
      // 4. Not currently shooting
      if (!isManualAnimationActive && 
          actions && actions['RifleIdle'] && 
          ['RifleRun', 'Backwards Rifle Run'].includes(currentAnimation || '') && 
          currentAnimation !== 'RifleJump' &&
          !isShooting) {
        playAnimation('RifleIdle');
      }
    }
    
    // Set rotation based on facing direction
    const targetRotation = facingDirection === 'right' ? Math.PI / 2 : -Math.PI / 2;
    
    // Apply the rotation
    characterRef.current.rotation.y = targetRotation;
    
    if (isMoving) {
      directionVector.normalize();
      
      // Apply rotation to the movement direction only if rotation is not locked
      let finalDirection = directionVector.clone();
      
      if (!movementConstraints.lockRotation) {
        // Only rotate the XZ components, not the Y (jumping) component
        const rotatedDirection = new THREE.Vector3(directionVector.x, 0, directionVector.z)
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation);
        
        // Put back the Y component
        rotatedDirection.y = directionVector.y;
        finalDirection = rotatedDirection;
      }
      
      // Scale by speed and delta time for frame-rate independence
      finalDirection.multiplyScalar(speed * delta);
      
      // Update position
      characterRef.current.position.add(finalDirection);
    }
    
    // Apply bone rotations for aiming
    if (
      worldMousePosition && 
      (upperBodyBones.spine || upperBodyBones.spine1 || upperBodyBones.spine2)
    ) {
      // Get character position
      const charPosition = characterRef.current.position.clone();
      
      // Instead of using world mouse position directly, get screen mouse position
      const screenCharPos = charPosition.clone().project(state.camera);
      const rawScreenDirection = new THREE.Vector2(
        mousePosition.current.x - screenCharPos.x,
        mousePosition.current.y - screenCharPos.y
      );
      
      // Very simple smoothing - just enough to prevent jitter but direct enough for shooting
      // Use a higher value (0.2) for more direct control
      const screenDirectionLerpFactor = 0.2;
      
      // Simple smoothing with high responsiveness
      smoothedScreenDirectionRef.current.x = THREE.MathUtils.lerp(
        smoothedScreenDirectionRef.current.x, 
        rawScreenDirection.x,
        screenDirectionLerpFactor
      );
      
      smoothedScreenDirectionRef.current.y = THREE.MathUtils.lerp(
        smoothedScreenDirectionRef.current.y,
        rawScreenDirection.y,
        screenDirectionLerpFactor
      );
      
      // No dead zone for direct control
      
      // Normalize the smoothed direction
      const screenDirection = smoothedScreenDirectionRef.current.clone().normalize();
      
      // For 2.5D side-scroller, simplify the rotation:
      // 1. Horizontal rotation (left/right): based on character's facing direction
      // 2. Vertical rotation (up/down): directly based on mouse Y position
      
      // Get if character is facing left or right based on our state
      const isFacingRight = facingDirection === 'right';
      const isFacingLeft = facingDirection === 'left';
      
      // Determine horizontal aim direction based on character's facing direction
      let horizontalAimFactor = isFacingRight ? 
        (screenDirection.x > 0 ? 0 : -screenDirection.x * 0.5) : 
        (screenDirection.x < 0 ? 0 : screenDirection.x * 0.5);
        
      // Vertical aim is directly based on mouse Y position relative to character
      const verticalAimFactor = -screenDirection.y; 
      
      // Scale and clamp vertical angle to prevent unnatural bending
      const maxPitch = Math.PI * 2.0;
      
      // Apply a slight vertical offset to adjust the resting position of the aiming
      const verticalAimOffset = 0.45;
      
      const clampedVerticalAngle = THREE.MathUtils.clamp(
        (verticalAimFactor + verticalAimOffset) * maxPitch * 1.5,
        -maxPitch,
        maxPitch
      );
      
      // Get horizontal rotation based on character facing direction
      const maxTwist = Math.PI * 0.8;
      let horizontalAngle = 0;
      
      if (isFacingRight) {
        // When facing right, negative screenDirection.x means looking behind (left)
        horizontalAngle = screenDirection.x < 0 ? 
          THREE.MathUtils.clamp(screenDirection.x * maxTwist, -maxTwist, 0) : 0;
      } else if (isFacingLeft) {
        // When facing left, positive screenDirection.x means looking behind (right)
        horizontalAngle = screenDirection.x > 0 ? 
          THREE.MathUtils.clamp(-screenDirection.x * maxTwist, -maxTwist, 0) : 0;
      }
      
      // Direct bone rotations - no complex history or weighted averages
      
      // Distribute vertical rotation (pitch) with more emphasis on upper bones
      const spinePitch = clampedVerticalAngle * 0.3;
      const spine1Pitch = clampedVerticalAngle * 0.5;
      const spine2Pitch = clampedVerticalAngle * 0.7;
      const neckPitch = clampedVerticalAngle * 0.6;
      
      // Use a consistent, higher lerp speed for more responsive rotation
      // Higher values (closer to 1) will make the bones follow the mouse more directly
      const lerpSpeed = 0.3;
      
      // Apply rotations to bones with simple smoothing
      if (upperBodyBones.spine) {
        // For spine yaw (horizontal rotation)
        upperBodyBones.spine.rotation.y = THREE.MathUtils.lerp(
          upperBodyBones.spine.rotation.y,
          horizontalAngle * 0.2,
          lerpSpeed
        );
        
        // For spine pitch (vertical rotation)
        upperBodyBones.spine.rotation.x = THREE.MathUtils.lerp(
          upperBodyBones.spine.rotation.x,
          spinePitch,
          lerpSpeed
        );
      }
      
      if (upperBodyBones.spine1) {
        upperBodyBones.spine1.rotation.y = THREE.MathUtils.lerp(
          upperBodyBones.spine1.rotation.y,
          horizontalAngle * 0.3,
          lerpSpeed
        );
        
        upperBodyBones.spine1.rotation.x = THREE.MathUtils.lerp(
          upperBodyBones.spine1.rotation.x,
          spine1Pitch,
          lerpSpeed
        );
      }
      
      if (upperBodyBones.spine2) {
        upperBodyBones.spine2.rotation.y = THREE.MathUtils.lerp(
          upperBodyBones.spine2.rotation.y,
          horizontalAngle * 0.3,
          lerpSpeed
        );
        
        upperBodyBones.spine2.rotation.x = THREE.MathUtils.lerp(
          upperBodyBones.spine2.rotation.x,
          spine2Pitch,
          lerpSpeed
        );
      }
      
      // Add neck rotation if available for even more dramatic effect
      if (upperBodyBones.neck) {
        upperBodyBones.neck.rotation.x = THREE.MathUtils.lerp(
          upperBodyBones.neck.rotation.x,
          neckPitch,
          lerpSpeed
        );
        
        upperBodyBones.neck.rotation.y = THREE.MathUtils.lerp(
          upperBodyBones.neck.rotation.y,
          horizontalAngle * 0.4,
          lerpSpeed
        );
      }
      
      // Debug logging
      if (debug && Math.random() < 0.005) {
        console.log('Aim factors:', {
          rawScreenDirection,
          smoothedScreenDirection: smoothedScreenDirectionRef.current,
          facingDirection,
          isFacingRight,
          isFacingLeft,
          horizontalAngle: THREE.MathUtils.radToDeg(horizontalAngle),
          verticalAngle: THREE.MathUtils.radToDeg(clampedVerticalAngle),
          spine: upperBodyBones.spine ? 
            { y: upperBodyBones.spine.rotation.y, x: upperBodyBones.spine.rotation.x } : null,
          spine1: upperBodyBones.spine1 ? 
            { y: upperBodyBones.spine1.rotation.y, x: upperBodyBones.spine1.rotation.x } : null,
          spine2: upperBodyBones.spine2 ? 
            { y: upperBodyBones.spine2.rotation.y, x: upperBodyBones.spine2.rotation.x } : null
        });
      }
      
      // Update the rifle position update code to use the state-based offsets
      if (handBoneRef.current && rifleRef.current) {
        // Get the FINAL world position and rotation of the hand bone
        const handPosition = new THREE.Vector3();
        const handQuaternion = new THREE.Quaternion();
        handBoneRef.current.getWorldPosition(handPosition);
        handBoneRef.current.getWorldQuaternion(handQuaternion);

        // Update rifle position and rotation to match hand
        rifleRef.current.position.copy(handPosition);
        rifleRef.current.quaternion.copy(handQuaternion);

        // Get the current animation's offsets or use defaults
        const offsets = currentAnimation && rifleOffsets[currentAnimation as keyof typeof rifleOffsets] 
          ? rifleOffsets[currentAnimation as keyof typeof rifleOffsets] 
          : DEFAULT_OFFSETS;
          
        // Calculate dynamic aim adjustment based on vertical aim angle
        // This helps ensure the weapon actually points at the target
        const dynamicRotationAdjustment = {
          // More downward tilt when aiming up, less tilt when aiming down
          // Using verticalAimFactor without the offset to get true aiming direction
          x: offsets.rotation.x - (verticalAimFactor * 0.2), // Inverted and increased the adjustment factor
          y: offsets.rotation.y,
          z: offsets.rotation.z
        };

        // Apply rotations first with dynamic adjustments
        rifleRef.current.rotateZ(dynamicRotationAdjustment.z);  // Roll
        rifleRef.current.rotateX(dynamicRotationAdjustment.x);  // Forward/backward tilt
        rifleRef.current.rotateY(dynamicRotationAdjustment.y);  // Left/right angle

        // Then apply position offset
        rifleRef.current.translateX(offsets.position.x);  // Left/right
        rifleRef.current.translateY(offsets.position.y); // Up/down
        rifleRef.current.translateZ(offsets.position.z);  // Forward/backward

        if (debug && Math.random() < 0.001) {
          console.log('Rifle position:', rifleRef.current.position);
          console.log('Current animation:', currentAnimation);
          console.log('Using offsets:', offsets);
          console.log('Dynamic rotation adjustment:', dynamicRotationAdjustment);
        }
      }
    }
    
    // Update debug info
    setDebugInfo({
      position: [
        characterRef.current.position.x,
        characterRef.current.position.y,
        characterRef.current.position.z
      ] as [number, number, number],
      rotation: characterRef.current.rotation.y.toFixed(2),
      isMoving,
      currentAnimation,
      availableAnimations
    });
    
    // Update muzzle flash for visual variation when visible
    if (muzzleFlashVisible && muzzleFlashRef.current) {
      muzzleFlashRef.current.rotation.z = Math.random() * Math.PI * 2;
      muzzleFlashRef.current.scale.set(
        0.5 + Math.random() * 0.5,
        0.5 + Math.random() * 0.5,
        1
      );
    }
  });
  
  // Access the debug info for UI display
  useEffect(() => {
    // Make debug info available globally for the UI
    // @ts-ignore - Adding to window for debugging
    window.characterDebug = debugInfo;

    // Expose the physics body reference for other components like HUD
    // @ts-ignore - Adding to window for debugging
    window.physicsBodyRef = physicsBodyRef.current;
  }, [debugInfo]);
  
  // Make animation interface available globally
  useEffect(() => {
    // @ts-ignore - Adding to window for debugging
    window.characterAnimations = {
      play: playAnimation,
      list: availableAnimations,
      current: currentAnimation
    };
  }, [availableAnimations, currentAnimation]);
  
  // Add keyboard handler for GUI visibility
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.code === 'KeyH') {
        setGuiVisible(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);
  
  // Add dat.GUI controls for rifle offsets
  useEffect(() => {
    if (!debug) return;

    const gui = new dat.GUI({ 
      width: 300,
      title: 'Rifle Offsets',
      autoPlace: false
    });

    // Position it in the top right corner
    gui.domElement.style.position = 'absolute';
    gui.domElement.style.top = '20px';
    gui.domElement.style.right = '20px';
    gui.domElement.style.display = guiVisible ? 'block' : 'none';
    document.body.appendChild(gui.domElement);
    
    // Add weapon settings folder
    const weaponFolder = gui.addFolder('Weapon Settings');
    
    // Add automatic toggle
    weaponFolder.add(weaponConfig, 'isAutomatic').name('Auto Fire').onChange((value: boolean) => {
      setWeaponConfig(prev => ({ ...prev, isAutomatic: value }));
    });
    
    // Add fire rate control
    weaponFolder.add(weaponConfig, 'fireRate', 1, 20, 1).name('Fire Rate (shots/sec)').onChange((value: number) => {
      setWeaponConfig(prev => ({ ...prev, fireRate: value }));
    });
    
    // Add muzzle flash duration control
    weaponFolder.add(weaponConfig, 'muzzleFlashDuration', 10, 200, 10).name('Flash Duration (ms)').onChange((value: number) => {
      setWeaponConfig(prev => ({ ...prev, muzzleFlashDuration: value }));
    });
    
    // Add recoil controls
    weaponFolder.add(weaponConfig, 'recoil', 0, 0.1, 0.01).name('Recoil Amount').onChange((value: number) => {
      setWeaponConfig(prev => ({ ...prev, recoil: value }));
    });
    
    weaponFolder.add(weaponConfig, 'maxRecoil', 0, 0.3, 0.01).name('Max Recoil').onChange((value: number) => {
      setWeaponConfig(prev => ({ ...prev, maxRecoil: value }));
    });
    
    weaponFolder.add(weaponConfig, 'recoilRecovery', 0, 0.05, 0.001).name('Recoil Recovery').onChange((value: number) => {
      setWeaponConfig(prev => ({ ...prev, recoilRecovery: value }));
    });
    
    // Add animation speed control
    const animationSpeed = { speed: 1.0 };
    gui.add(animationSpeed, 'speed', 0.1, 2.0, 0.1).onChange((value: number) => {
      if (currentAnimation && actions && actions[currentAnimation]) {
        actions[currentAnimation].timeScale = value;
      }
    });
    
    // Add animation selection dropdown
    const animationControls = {
      animation: currentAnimation || 'RifleIdle',
      playSelected: () => {
        if (animationControls.animation && actions[animationControls.animation]) {
          playAnimation(animationControls.animation, true);
        }
      }
    };
    
    // Create animation selector
    if (availableAnimations.length > 0) {
      gui.add(animationControls, 'animation', availableAnimations).name('Select Animation');
      gui.add(animationControls, 'playSelected').name('Play Selected Animation');
    }
    
    // Create folders for each animation
    Object.entries(rifleOffsets).forEach(([animationName, offsets]) => {
      const folder = gui.addFolder(animationName);
      
      // Position controls
      const posFolder = folder.addFolder('Position');
      posFolder.add(offsets.position, 'x', -0.5, 0.5, 0.01).onChange((value: number) => {
        setRifleOffsets(prev => ({
          ...prev,
          [animationName]: {
            ...prev[animationName as keyof typeof prev],
            position: { ...prev[animationName as keyof typeof prev].position, x: value }
          }
        }));
      });
      posFolder.add(offsets.position, 'y', -0.5, 0.5, 0.01).onChange((value: number) => {
        setRifleOffsets(prev => ({
          ...prev,
          [animationName]: {
            ...prev[animationName as keyof typeof prev],
            position: { ...prev[animationName as keyof typeof prev].position, y: value }
          }
        }));
      });
      posFolder.add(offsets.position, 'z', -0.5, 0.5, 0.01).onChange((value: number) => {
        setRifleOffsets(prev => ({
          ...prev,
          [animationName]: {
            ...prev[animationName as keyof typeof prev],
            position: { ...prev[animationName as keyof typeof prev].position, z: value }
          }
        }));
      });
      
      // Rotation controls (in degrees for easier adjustment)
      const rotFolder = folder.addFolder('Rotation');
      rotFolder.add(offsets.rotation, 'x', -180, 180, 1).onChange((value: number) => {
        setRifleOffsets(prev => ({
          ...prev,
          [animationName]: {
            ...prev[animationName as keyof typeof prev],
            rotation: { ...prev[animationName as keyof typeof prev].rotation, x: THREE.MathUtils.degToRad(value) }
          }
        }));
      });
      rotFolder.add(offsets.rotation, 'y', -180, 180, 1).onChange((value: number) => {
        setRifleOffsets(prev => ({
          ...prev,
          [animationName]: {
            ...prev[animationName as keyof typeof prev],
            rotation: { ...prev[animationName as keyof typeof prev].rotation, y: THREE.MathUtils.degToRad(value) }
          }
        }));
      });
      rotFolder.add(offsets.rotation, 'z', -180, 180, 1).onChange((value: number) => {
        setRifleOffsets(prev => ({
          ...prev,
          [animationName]: {
            ...prev[animationName as keyof typeof prev],
            rotation: { ...prev[animationName as keyof typeof prev].rotation, z: THREE.MathUtils.degToRad(value) }
          }
        }));
      });
    });

    return () => {
      if (gui.domElement.parentElement) {
        gui.domElement.parentElement.removeChild(gui.domElement);
      }
      gui.destroy();
    };
  }, [debug, currentAnimation, actions, guiVisible, availableAnimations, playAnimation]);
  
  // Create muzzle flash effect when rifle is ready
  useEffect(() => {
    if (!rifleRef.current) return;
    
    // Clear previous flash if it exists
    if (muzzleFlashRef.current) {
      console.log('Removing previous muzzle flash');
      if (muzzleFlashRef.current.parent) {
        muzzleFlashRef.current.parent.remove(muzzleFlashRef.current);
      }
      muzzleFlashRef.current = null;
    }
    
    if (muzzleFlashLightRef.current) {
      console.log('Removing previous muzzle flash light');
      if (muzzleFlashLightRef.current.parent) {
        muzzleFlashLightRef.current.parent.remove(muzzleFlashLightRef.current);
      }
      muzzleFlashLightRef.current = null;
    }
    
    console.log('Creating new muzzle flash effect');
    
    // Create a simple muzzle flash disc
    const flashGeometry = new THREE.CircleGeometry(0.1, 8);
    const flashMaterial = new THREE.MeshBasicMaterial({
      color: 0xffff80,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    });
    
    const muzzleFlash = new THREE.Mesh(flashGeometry, flashMaterial);
    muzzleFlash.visible = false;
    muzzleFlashRef.current = muzzleFlash;
    
    // Add a point light for dynamic illumination
    const flashLight = new THREE.PointLight(0xffaa00, 5, 3, 2);
    flashLight.visible = false;
    muzzleFlashLightRef.current = flashLight;
    
    // Create a group to hold both flash elements
    const muzzleFlashGroup = new THREE.Group();
    muzzleFlashGroup.add(muzzleFlash);
    muzzleFlashGroup.add(flashLight);
    
    // Position the flash group
    if (muzzleRef.current) {
      // If we have a specific muzzle object, parent the flash to it
      console.log('Attaching muzzle flash to gun_muzzle object');
      muzzleRef.current.add(muzzleFlashGroup);
      muzzleFlashGroup.position.set(0, 0, 0.1); // Small forward offset from muzzle
    } else {
      // Otherwise add it to the rifle with a position estimate
      console.log('Attaching muzzle flash directly to rifle with position estimate');
      rifleRef.current.add(muzzleFlashGroup);
      // Position at the estimated end of the barrel
      muzzleFlashGroup.position.set(0, 0, 0.6);
    }
    
    // Random rotation for variation
    muzzleFlash.rotation.z = Math.random() * Math.PI;
    
    return () => {
      // No cleanup needed for muzzle flash as it's attached to the rifle
    };
  }, [rifleRef, muzzleRef]);
  
  // Create shell casings instanced mesh
  useEffect(() => {
    // Only create shell casings if we have a scene to add them to
    if (!scene) return;
    
    // Clean up any existing shell casings
    if (shellCasingsRef.current) {
      scene.remove(shellCasingsRef.current);
      shellCasingsRef.current = null;
    }
    
    console.log('Creating shell casings instanced mesh');
    const shellGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.1, 8);
    shellGeometry.rotateX(Math.PI / 2); // Orient shell properly
    const shellMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xD4AF37, // Brass color
      metalness: 0.8,
      roughness: 0.3
    });
    
    const shellInstancedMesh = new THREE.InstancedMesh(shellGeometry, shellMaterial, maxShells);
    shellInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    shellInstancedMesh.count = 0; // Start with no shells visible
    
    // Get the scene root to ensure it's at the top level
    // This is critical for independence from character movement
    const sceneRoot = scene.parent || scene;
    
    // IMPORTANT: We're ensuring the shell mesh is added to the scene root
    // Not as a child of the character or any movable object
    sceneRoot.add(shellInstancedMesh);
    shellCasingsRef.current = shellInstancedMesh;
    
    // Initialize matrices and speeds
    shellMatrixRef.current = Array(maxShells).fill(0).map(() => new THREE.Matrix4());
    shellSpeedRef.current = Array(maxShells).fill(null).map(() => ({ x: 0, y: 0, z: 0 }));
    shellLifeRef.current = Array(maxShells).fill(0);
    
    console.log('Shell mesh added directly to scene root for independent movement');
    
    return () => {
      // Clean up
      if (shellInstancedMesh && sceneRoot) {
        sceneRoot.remove(shellInstancedMesh);
      }
    };
  }, [scene]); // Only recreate when scene changes
  
  // Initialize sound effects
  useEffect(() => {
    // Set up rifle fire sound
    const rifleFireSound = new Audio('/sound/rifle_fire.mp3');
    rifleFireSound.volume = 0.6; // Adjust volume as needed
    rifleFireSoundRef.current = rifleFireSound;
    
    return () => {
      // Clean up audio resources
      if (rifleFireSoundRef.current) {
        rifleFireSoundRef.current.pause();
        rifleFireSoundRef.current = null;
      }
    };
  }, []);
  
  // Function to eject a shell casing - simplified for clarity
  const ejectShell = useCallback(() => {
    if (!shellCasingsRef.current || !rifleRef.current) {
      console.warn('Cannot eject shell - missing references');
      return;
    }
    
    // Get position for ejection - prioritize the ejector point if available
    const ejectPosition = new THREE.Vector3();
    
    if (ejectorRef.current) {
      // Use dedicated ejector position if available
      ejectorRef.current.getWorldPosition(ejectPosition);
      console.log('Ejecting shell from ejector point:', ejectPosition);
    } else if (muzzleRef.current) {
      // Fall back to muzzle position with offset if ejector not available
      muzzleRef.current.getWorldPosition(ejectPosition);
      
      // Get rifle's orientation
      const rifleQuaternion = new THREE.Quaternion();
      rifleRef.current.getWorldQuaternion(rifleQuaternion);
      
      // Create a direction vector pointing right and slightly back from the rifle
      const rightVector = new THREE.Vector3(0, 0.05, -0.1);
      rightVector.applyQuaternion(rifleQuaternion);
      
      // Add offset to ejection position
      ejectPosition.add(rightVector);
      console.log('Ejecting shell from computed position:', ejectPosition);
    } else {
      // Last resort: use rifle position with a fixed offset
      rifleRef.current.getWorldPosition(ejectPosition);
      ejectPosition.y += 0.1; // Slight upward offset
      console.log('Ejecting shell from rifle position with offset:', ejectPosition);
    }
    
    // Set up shell casing physical properties
    const shellIndex = nextShellIndexRef.current;
    
    // Move to next shell slot (rotating through available slots)
    nextShellIndexRef.current = (nextShellIndexRef.current + 1) % maxShells;
    
    // Get rifle's orientation for more accurate ejection direction
    const rifleQuaternion = new THREE.Quaternion();
    rifleRef.current.getWorldQuaternion(rifleQuaternion);
    
    // Create base ejection velocity direction - increased for more noticeable effect
    // Default: eject right and slightly up from rifle's perspective
    const baseVelocity = new THREE.Vector3(0.4, 0.5, -0.2);
    baseVelocity.applyQuaternion(rifleQuaternion);
    
    // Store the physics properties for this shell
    const initialVelocity = {
      x: baseVelocity.x + (Math.random() - 0.5) * 0.2,  // Increased randomness
      y: baseVelocity.y + Math.random() * 0.3,           // Increased upward randomness
      z: baseVelocity.z + (Math.random() - 0.5) * 0.2   // Increased randomness
    };
    
    // Create a matrix for this shell with randomized rotation
    const initialRotation = new THREE.Euler(
      Math.random() * Math.PI * 2, 
      Math.random() * Math.PI * 2, 
      Math.random() * Math.PI * 2
    );
    
    // Create initial matrix with position and rotation
    const matrix = new THREE.Matrix4();
    matrix.compose(
      ejectPosition,
      new THREE.Quaternion().setFromEuler(initialRotation),
      new THREE.Vector3(1, 1, 1)
    );
    
    // Store the matrix for future updates
    shellMatrixRef.current[shellIndex] = matrix.clone(); // Important: clone to avoid reference issues
    
    // Apply matrix to the instanced mesh
    shellCasingsRef.current.setMatrixAt(shellIndex, matrix);
    
    // Save velocity for physics updates
    shellSpeedRef.current[shellIndex] = { ...initialVelocity }; // Clone to avoid reference issues
    
    // Set lifetime - longer for better visibility
    shellLifeRef.current[shellIndex] = 6; // Seconds before disappearing
    
    // Ensure instance count is set correctly
    if (shellCasingsRef.current.count < maxShells) {
      shellCasingsRef.current.count = Math.max(shellCasingsRef.current.count, shellIndex + 1);
    }
    
    // Update the instance buffer
    shellCasingsRef.current.instanceMatrix.needsUpdate = true;
    
    // Debug
    if (debug) {
      console.log('Shell ejected:', {
        position: ejectPosition,
        velocity: initialVelocity,
        shellIndex,
        totalShells: shellCasingsRef.current.count
      });
    }
  }, [debug]);

  // Update shell casings physics - moved earlier in the code and refined
  useFrame((state, delta) => {
    if (!shellCasingsRef.current || shellCasingsRef.current.count === 0) return;
    
    let anyShellActive = false;
    
    // Update each active shell casing
    for (let i = 0; i < shellCasingsRef.current.count; i++) {
      // Skip if this shell has no lifetime left
      if (shellLifeRef.current[i] <= 0) continue;
      
      // Reduce lifetime
      shellLifeRef.current[i] -= delta;
      
      if (shellLifeRef.current[i] <= 0) {
        // Skip further processing if shell just expired
        continue;
      }
      
      anyShellActive = true;
      
      // Get current matrix
      const matrix = shellMatrixRef.current[i];
      
      // Extract position, rotation, and scale from matrix
      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      matrix.decompose(position, quaternion, scale);
      
      // Apply gravity to y speed (increased)
      shellSpeedRef.current[i].y -= 15.0 * delta;
      
      // Apply speed to position - this updates the object's world position
      position.x += shellSpeedRef.current[i].x * delta;
      position.y += shellSpeedRef.current[i].y * delta;
      position.z += shellSpeedRef.current[i].z * delta;
      
      // Simple ground collision
      if (position.y < 0.03) { // Slightly above ground to prevent z-fighting
        position.y = 0.03;
        shellSpeedRef.current[i].y = -shellSpeedRef.current[i].y * 0.3; // Dampen bounce
        
        // Apply stronger friction when on ground
        shellSpeedRef.current[i].x *= 0.5; // Increased friction
        shellSpeedRef.current[i].z *= 0.5; // Increased friction
        
        // If speed is very low after bounce, let it rest
        if (Math.abs(shellSpeedRef.current[i].y) < 0.5) {
          shellSpeedRef.current[i].y = 0;
          shellSpeedRef.current[i].x *= 0.2; // Stronger deceleration
          shellSpeedRef.current[i].z *= 0.2; // Stronger deceleration
        }
      }
      
      // Create more dynamic rotation
      const rotationSpeed = Math.max(
        Math.abs(shellSpeedRef.current[i].x),
        Math.abs(shellSpeedRef.current[i].y),
        Math.abs(shellSpeedRef.current[i].z)
      ) * 15; // Rotation speed based on movement speed
      
      // Convert quaternion to euler for rotation updates
      const euler = new THREE.Euler().setFromQuaternion(quaternion);
      
      // Apply rotation based on speed and random axis
      euler.x += delta * rotationSpeed * (0.5 + Math.random() * 0.5);
      euler.y += delta * rotationSpeed * (0.5 + Math.random() * 0.5);
      euler.z += delta * rotationSpeed * (0.5 + Math.random() * 0.5);
      
      // Create a new quaternion from the updated euler
      const newQuaternion = new THREE.Quaternion().setFromEuler(euler);
      
      // Create a new matrix with updated position and rotation
      const newMatrix = new THREE.Matrix4();
      newMatrix.compose(position, newQuaternion, scale);
      
      // Apply the new matrix
      shellMatrixRef.current[i] = newMatrix.clone(); // Clone to avoid reference issues
      shellCasingsRef.current.setMatrixAt(i, newMatrix);
    }
    
    // Update the instance buffer if any shells were active
    if (anyShellActive) {
      shellCasingsRef.current.instanceMatrix.needsUpdate = true;
    }
  });

  // Function to trigger shooting
  const shoot = useCallback(() => {
    // Check cooldown
    const currentTime = Date.now();
    const timeSinceLastShot = currentTime - lastShotTime;
    const cooldownTime = 1000 / weaponConfig.fireRate;
    
    if (timeSinceLastShot < cooldownTime) {
      return false; // Don't shoot if we haven't waited long enough
    }
    
    // Update shot time
    setLastShotTime(currentTime);
    setIsShooting(true);
    
    // Play rifle fire sound
    if (rifleFireSoundRef.current) {
      // Create a clone of the audio to allow overlapping sounds for rapid fire
      const soundClone = rifleFireSoundRef.current.cloneNode(true) as HTMLAudioElement;
      soundClone.volume = 0.6;
      soundClone.play().catch(error => {
        console.warn('Error playing rifle fire sound:', error);
      });
    }
    
    // Apply recoil
    currentRecoilRef.current = Math.min(
      weaponConfig.maxRecoil, 
      currentRecoilRef.current + weaponConfig.recoil
    );
    
    // Check if we're moving
    const isMoving = moveDirection.x !== 0 || moveDirection.y !== 0 || moveDirection.z !== 0;
    
    // Play the shooting animation - with different behavior based on movement state
    if (actions && actions['Rifle Fire']) {
      if (isMoving) {
        // When moving, we'll blend the shooting animation on top of the running animation
        // instead of replacing it
        
        // Keep the current running animation playing
        // Just add a subtle rifle fire animation at a low weight to add some effect without disrupting movement
        actions['Rifle Fire'].reset();
        actions['Rifle Fire'].setLoop(THREE.LoopOnce, 1);
        actions['Rifle Fire'].setEffectiveWeight(0.3); // Lower weight to blend with running
        actions['Rifle Fire'].setEffectiveTimeScale(1.0);
        actions['Rifle Fire'].play();
        
        // Don't change currentAnimation state - keep it as the running animation
      } else {
        // When stationary, play the full firing animation
        // Stop any playing animations (including idle) to ensure firing animation plays
        if (currentAnimation && currentAnimation !== 'Rifle Fire' && actions[currentAnimation]) {
          actions[currentAnimation].fadeOut(0.1);
        }
        
        // Always reset to start from the first frame - this is key for rapid fire
        actions['Rifle Fire'].reset();
        
        // Set to play once and not loop
        actions['Rifle Fire'].setLoop(THREE.LoopOnce, 1);
        
        // Set full weight - we want to see the full animation
        actions['Rifle Fire'].setEffectiveWeight(1.0);
        
        // Full speed
        actions['Rifle Fire'].setEffectiveTimeScale(1.0);
        
        // Start the animation immediately - no blending or crossfading
        actions['Rifle Fire'].play();
        
        // Update the current animation
        setCurrentAnimation('Rifle Fire');
      }
    }
    
    // Show muzzle flash
    setMuzzleFlashVisible(true);
    
    // Randomize flash light intensity
    if (muzzleFlashLightRef.current) {
      muzzleFlashLightRef.current.intensity = 5 + Math.random() * 3;
      const hue = 0.1 + Math.random() * 0.05;
      muzzleFlashLightRef.current.color.setHSL(hue, 0.9, 0.7);
    }
    
    // Eject a shell casing
    ejectShell();
    
    // SPAWN PROJECTILE
    // Get position and direction for the projectile
    if (muzzleRef.current) {
      // Use muzzle position for projectile spawn
      const muzzlePosition = new THREE.Vector3();
      muzzleRef.current.getWorldPosition(muzzlePosition);
      
      // Calculate direction based on world mouse position
      // This creates a vector pointing from muzzle to mouse position
      const direction = new THREE.Vector3();
      direction.subVectors(worldMousePosition, muzzlePosition).normalize();
      
      // Add some random spread based on recoil
      const spread = currentRecoilRef.current * 0.02; // Convert recoil to spread amount
      direction.x += (Math.random() - 0.5) * spread;
      direction.y += (Math.random() - 0.5) * spread;
      
      // Access the global projectile spawner
      // @ts-ignore - Using window for debugging
      if (window.spawnProjectile) {
        // @ts-ignore - Using window for debugging
        window.spawnProjectile({
          initialPosition: muzzlePosition,
          initialVelocity: direction,
          speed: 50, // Bullets are fast!
          lifetime: 5.0, // Longer lifetime for better visibility
          size: 0.2, // Larger size for visibility
          gravity: PHYSICS.GRAVITY * 0.02 // Very reduced gravity effect for bullets
        });
        
        if (debug) {
          console.log('Spawned projectile:', {
            position: muzzlePosition,
            direction: direction,
          });
        }
      } else if (debug) {
        console.warn('ProjectileManager not initialized yet');
      }
    }
    
    // Hide muzzle flash after a short delay
    setTimeout(() => {
      setMuzzleFlashVisible(false);
    }, weaponConfig.muzzleFlashDuration);
    
    return true; // Return success
  }, [
    actions,
    ejectShell, 
    lastShotTime,
    currentAnimation,
    moveDirection,
    weaponConfig.fireRate, 
    weaponConfig.maxRecoil, 
    weaponConfig.muzzleFlashDuration, 
    weaponConfig.recoil,
    worldMousePosition,
    debug
  ]);

  // Function to stop automatic fire
  const stopAutomaticFire = useCallback(() => {
    if (shootIntervalRef.current !== null) {
      clearInterval(shootIntervalRef.current);
      shootIntervalRef.current = null;
    }
  }, []);

  // Use useFrame for continuous firing rather than intervals
  // This is more resilient against component unmounting
  useFrame((state, delta) => {
    // Handle automatic firing in useFrame
    if (isMouseDownRef.current && weaponConfig.isAutomatic) {
      // Attempt to shoot - the shoot function will handle cooldowns
      shoot();
    }
  });
  
  // Set up mouse click handling for shooting
  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      // Left mouse button
      if (event.button === 0) {
        // Update both the state and the ref
        setIsMouseDown(true);
        isMouseDownRef.current = true;
        
        // Initial shot for both auto and semi
        shoot();
      }
    };
    
    const handleMouseUp = (event: MouseEvent) => {
      // Left mouse button
      if (event.button === 0) {
        // Update both the state and the ref
        setIsMouseDown(false);
        isMouseDownRef.current = false;
        setIsShooting(false);
        
        // Return to idle animation ONLY if not moving and current animation is Rifle Fire
        const isMoving = moveDirection.x !== 0 || moveDirection.y !== 0 || moveDirection.z !== 0;
        if (!isMoving && currentAnimation === 'Rifle Fire' && actions && actions['RifleIdle']) {
          // Start idle BEFORE stopping the fire animation to prevent gaps
          actions['RifleIdle'].reset();
          actions['RifleIdle'].setEffectiveWeight(1.0);
          actions['RifleIdle'].fadeIn(0.1);
          actions['RifleIdle'].play();
          
          // AFTER starting idle, fade out the fire animation
          if (actions && actions['Rifle Fire']) {
            actions['Rifle Fire'].fadeOut(0.2);
          }
          
          // Update the current animation state
          setCurrentAnimation('RifleIdle');
        } else {
          // When moving or in other states, just fade out the fire animation
          if (actions && actions['Rifle Fire']) {
            actions['Rifle Fire'].fadeOut(0.1);
          }
        }
      }
    };
    
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [shoot, moveDirection, currentAnimation, actions, playAnimation]);
  
  // Update muzzle flash visibility
  useEffect(() => {
    if (!muzzleFlashRef.current || !muzzleFlashLightRef.current) return;
    
    // Update flash visibility
    muzzleFlashRef.current.visible = muzzleFlashVisible;
    muzzleFlashLightRef.current.visible = muzzleFlashVisible;
    
    // Random variations for a more dynamic effect when flashing
    if (muzzleFlashVisible && muzzleFlashRef.current) {
      const randomScale = 0.8 + Math.random() * 0.4;
      muzzleFlashRef.current.scale.set(randomScale, randomScale, 1);
      muzzleFlashRef.current.rotation.z = Math.random() * Math.PI * 2;
    }
  }, [muzzleFlashVisible]);
  
  // Add recoil recovery
  useFrame((state, delta) => {
    // Gradually recover from recoil
    if (currentRecoilRef.current > 0) {
      currentRecoilRef.current = Math.max(0, currentRecoilRef.current - weaponConfig.recoilRecovery * delta * 60);
    }
  });
  
  // Add firing mode toggle with V key
  useEffect(() => {
    const toggleFiringMode = (e: KeyboardEvent) => {
      if (e.code === 'KeyV') {
        // Update firing mode
        const newIsAutomatic = !weaponConfig.isAutomatic;
        setWeaponConfig(prev => ({
          ...prev,
          isAutomatic: newIsAutomatic
        }));
        
        // If switching to semi-auto, make sure to stop any automatic fire
        if (!newIsAutomatic) {
          stopAutomaticFire();
        }
        
        // Alert the player about the mode change
        const newMode = newIsAutomatic ? 'automatic' : 'semi-automatic';
        console.log(`Firing mode switched to ${newMode}`);
        
        // Visual feedback when toggling
        if (debug) {
          console.log(`Firing mode switched to ${newMode}`);
        }
      }
    };
    
    window.addEventListener('keydown', toggleFiringMode);
    return () => window.removeEventListener('keydown', toggleFiringMode);
  }, [debug, stopAutomaticFire, weaponConfig.isAutomatic]);
  
  // Handle mouse for right-click jet pack
  useEffect(() => {
    const handleJetMouseDown = (event: MouseEvent) => {
      if (event.button === 2) { // Right mouse button
        console.log('Right-click detected - activating jet pack');
        setMoveDirection(prev => ({ ...prev, jet: true }));
      }
    };
    
    const handleJetMouseUp = (event: MouseEvent) => {
      if (event.button === 2) { // Right mouse button
        console.log('Right-click released - deactivating jet pack');
        setMoveDirection(prev => ({ ...prev, jet: false }));
      }
    };
    
    // Prevent context menu on right click
    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };
    
    window.addEventListener('mousedown', handleJetMouseDown);
    window.addEventListener('mouseup', handleJetMouseUp);
    window.addEventListener('contextmenu', handleContextMenu);
    
    return () => {
      window.removeEventListener('mousedown', handleJetMouseDown);
      window.removeEventListener('mouseup', handleJetMouseUp);
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);
  
  useImperativeHandle(ref, () => ({
    characterRef: characterRef.current,
    playAnimation: playAnimation,
    shoot: shoot
  }));
  
  return (
    <>
      <primitive
        ref={characterRef}
        object={scene}
        position={position}
        rotation={[0, rotation, 0]}
        scale={[scale, scale, scale]}
      />
      
      {/* Render the rifle as a separate primitive */}
      {rifleRef.current && (
        <primitive object={rifleRef.current} />
      )}
      
      {/* Add Jet Fuel HUD */}
      {physicsBodyRef.current && (
        <group position={[1.5, 1, 0]}>
          <mesh position={[0, 0, -5]} rotation={[0, 0, 0]}>
            <planeGeometry args={[0.6, 0.1]} />
            <meshBasicMaterial color="gray" transparent opacity={0.7} />
          </mesh>
          <mesh 
            position={[-(0.3 - (physicsBodyRef.current.getFuelPercentage() / 100 * 0.3)), 0, -4.9]} 
            scale={[physicsBodyRef.current.getFuelPercentage() / 100, 1, 1]}
          >
            <planeGeometry args={[0.6, 0.08]} />
            <meshBasicMaterial 
              color={physicsBodyRef.current.isJetActive() ? "#ff3030" : "#30c0ff"} 
              transparent 
              opacity={0.9} 
            />
          </mesh>
          {/* Show a small "JET" label above the fuel gauge */}
          {debug && (
            <group position={[0, 0.12, -4.9]}>
              <mesh>
                <planeGeometry args={[0.3, 0.08]} />
                <meshBasicMaterial color="black" transparent opacity={0.5} />
              </mesh>
              {/* Text geometry not needed, we'll just use a label that appears in debug mode */}
            </group>
          )}
        </group>
      )}
      
      {/* Debug visualization for aiming direction - Always show when debug is true */}
      {debug && (
        <group>
          {(() => {
            // Try to get the muzzle position for the starting point
            let startPosition = new THREE.Vector3();
            
            if (muzzleRef.current && rifleRef.current) {
              // Get world position of the gun muzzle
              muzzleRef.current.getWorldPosition(startPosition);
              // console.log('Using muzzle position for debug line:', startPosition);
            } else if (handBoneRef.current) {
              // Fallback to hand position
              handBoneRef.current.getWorldPosition(startPosition);
              console.log('Falling back to hand position for debug line');
            } else if (upperBodyBones.leftHand) {
              // Fallback to left hand
              upperBodyBones.leftHand.getWorldPosition(startPosition);
            } else {
              // Fallback: use character position with offset
              startPosition.set(
                characterRef.current?.position.x || 0, 
                (characterRef.current?.position.y || 0) + 1.6, // Roughly shoulder height
                characterRef.current?.position.z || 0
              );
            }
            
            // Add debug sphere at start position
            return (
              <>
                {/* Red dot at muzzle/hand/weapon position */}
                <mesh position={startPosition}>
                  <sphereGeometry args={[0.1, 8, 8]} />
                  <meshBasicMaterial color="red" />
                </mesh>
                
                {/* Line from muzzle to aim point */}
                <line>
                  <bufferGeometry>
                    <float32BufferAttribute
                      attach="attributes-position"
                      args={[
                        new Float32Array([
                          startPosition.x, 
                          startPosition.y, 
                          startPosition.z,
                          worldMousePosition.x,
                          worldMousePosition.y,
                          worldMousePosition.z
                        ]), 
                        3
                      ]}
                    />
                  </bufferGeometry>
                  <lineBasicMaterial color="red" linewidth={2} />
                </line>

                {/* Add a sphere at the aim point */}
                <mesh position={worldMousePosition}>
                  <sphereGeometry args={[0.1, 8, 8]} />
                  <meshBasicMaterial color="blue" />
                </mesh>
                
                {/* Add debug sphere for ejector point */}
                {ejectorRef.current && (
                  (() => {
                    // Get the world position of the ejector
                    const ejectorPosition = new THREE.Vector3();
                    ejectorRef.current.getWorldPosition(ejectorPosition);
                    
                    return (
                      <mesh position={ejectorPosition}>
                        <sphereGeometry args={[0.05, 16, 16]} />
                        <meshBasicMaterial color="green" />
                      </mesh>
                    );
                  })()
                )}
              </>
            );
          })()}
        </group>
      )}
    </>
  );
};

export default forwardRef(CharacterController); 