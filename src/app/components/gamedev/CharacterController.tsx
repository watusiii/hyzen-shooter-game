'use client';

import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle, ForwardRefRenderFunction } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';
import * as THREE from 'three';
import * as dat from 'lil-gui';

// Export interface for the ref
export interface CharacterControllerRef {
  characterRef: THREE.Group | THREE.Mesh | null;
  playAnimation: (name: string) => void;
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
  modelPath = '/models/player/2_1.glb',
  animationsPath = '/models/player/animation_host.glb', // Using the animation host GLB file instead of FBX
  position = [0, 0, 0],
  scale = 2,
  speed = 5,
  enableKeyboardControls = true,
  defaultAnimation = 'RifleRun',
  debug = false,
  weaponPath = '/models/weapon/rifle.glb'
}, ref) => {
  // Reference to the character model or group
  const characterRef = useRef<THREE.Group | THREE.Mesh>(null);
  
  // Reference for weapon
  const rifleRef = useRef<THREE.Group | null>(null);
  const handBoneRef = useRef<THREE.Object3D | null>(null);
  
  // State for movement direction
  const [moveDirection, setMoveDirection] = useState({ 
    x: 0,  // Left/right movement (this will be our main side-scrolling axis)
    y: 0,  // Up/down movement (jumping, gravity)
    z: 0   // Forward/backward movement (limited for side-scrolling)
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
      position: { x: 0.06, y: 0, z: 0.35 },
      rotation: { x: Math.PI / 6, y: Math.PI / 1 + 1.8, z: -Math.PI / 2 }
    },
    RifleIdle: {
      position: { x: 0.08, y: -0.02, z: 0.15 },
      rotation: { 
        x: -18 * (Math.PI / 180),  // -18 degrees
        y: -90 * (Math.PI / 180),  // -90 degrees
        z: -100 * (Math.PI / 180)  // -100 degrees
      }
    }
  });
  
  // Default offsets for any animation not in the mapping
  const DEFAULT_OFFSETS = {
    position: { x: 0.06, y: 0, z: 0.35 },
    rotation: { x: Math.PI / 6, y: Math.PI / 1 + 1.8, z: -Math.PI / 2 }
  };
  
  // Get camera from useThree
  const { camera } = useThree();
  
  // Add state for camera zoom
  const [cameraZoom, setCameraZoom] = useState(15); // Initial zoom distance
  
  // Add state for GUI visibility
  const [guiVisible, setGuiVisible] = useState(true);
  
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
        // Reset and configure the action
        action.reset();
        action.clampWhenFinished = false;
        action.loop = THREE.LoopRepeat;
        action.repetitions = Infinity;
        action.timeScale = 1.0;
        action.weight = 1.0;
        
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
    } else if (animationNames.length > 0) {
      // Play the first animation if default not available
      playAnimation(animationNames[0]);
    }
    
    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [animations, actions, mixer, defaultAnimation]);
  
  // Function to play an animation
  const playAnimation = (name: string) => {
    console.log(`Attempting to play animation: ${name}`);
    
    if (!actions || !actions[name]) {
      console.error(`No action found for animation: ${name}`);
      console.log('Available actions:', actions ? Object.keys(actions) : 'none');
      return;
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
    action.setLoop(THREE.LoopRepeat, Infinity);
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
          // Change animation to run if not already running
          if (currentAnimation !== 'RifleRun' && actions && actions['RifleRun']) {
            playAnimation('RifleRun');
          }
          break;
        case 'KeyD': 
        case 'ArrowRight': 
          setMoveDirection(prev => ({ ...prev, x: 1 })); 
          // Change animation to run if not already running
          if (currentAnimation !== 'RifleRun' && actions && actions['RifleRun']) {
            playAnimation('RifleRun');
          }
          break;
        // Jump with Space
        case 'Space':
          setMoveDirection(prev => ({ ...prev, y: 1 }));
          // Change animation to jump if available
          if (currentAnimation !== 'RifleJump' && actions && actions['RifleJump']) {
            playAnimation('RifleJump');
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
          setMoveDirection(prev => {
            const newState = { ...prev, x: 0 };
            // If no longer moving, switch to idle
            if (newState.x === 0 && newState.z === 0 && newState.y === 0) {
              if (actions && actions['RifleIdle']) {
                playAnimation('RifleIdle');
              }
            }
            return newState;
          }); 
          break;
        case 'KeyD':
        case 'ArrowRight': 
          setMoveDirection(prev => {
            const newState = { ...prev, x: 0 };
            // If no longer moving, switch to idle
            if (newState.x === 0 && newState.z === 0 && newState.y === 0) {
              if (actions && actions['RifleIdle']) {
                playAnimation('RifleIdle');
              }
            }
            return newState;
          }); 
          break;
        case 'Space':
          setMoveDirection(prev => ({ ...prev, y: 0 }));
          break;
        case 'KeyW':
        case 'ArrowUp':
          if (!movementConstraints.lockZ) {
            setMoveDirection(prev => {
              const newState = { ...prev, z: 0 };
              // If no longer moving, switch to idle
              if (newState.x === 0 && newState.z === 0 && newState.y === 0) {
                if (actions && actions['RifleIdle']) {
                  playAnimation('RifleIdle');
                }
              }
              return newState;
            });
          }
          break;
        case 'KeyS':
        case 'ArrowDown': 
          if (!movementConstraints.lockZ) {
            setMoveDirection(prev => {
              const newState = { ...prev, z: 0 };
              // If no longer moving, switch to idle
              if (newState.x === 0 && newState.z === 0 && newState.y === 0) {
                if (actions && actions['RifleIdle']) {
                  playAnimation('RifleIdle');
                }
              }
              return newState;
            });
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
          playAnimation(availableAnimations[digit]);
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
  }, [enableKeyboardControls, currentAnimation, actions, availableAnimations]);
  
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
    
    if (debug) {
      console.log('Mouse tracking:', {
        mousePos: { x: mousePosition.current.x, y: mousePosition.current.y },
        worldAimPoint: intersectionPoint,
        characterPosition: characterPosition
      });
    }
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
    if (!characterRef.current || !scene) return;
    
    // Create a direction vector from input
    const directionVector = new THREE.Vector3(
      moveDirection.x, 
      moveDirection.y, 
      movementConstraints.lockZ ? 0 : moveDirection.z // Force Z to 0 if locked
    );
    
    // Only normalize if there's actual movement
    const isMoving = directionVector.length() > 0;
    
    // Determine facing direction based on mouse position
    // Get screen-space direction from character to mouse
    const charPosition = characterRef.current.position.clone();
    const screenCharPos = charPosition.clone().project(state.camera);
    const screenDirection = new THREE.Vector2(
      mousePosition.current.x - screenCharPos.x,
      mousePosition.current.y - screenCharPos.y
    );
    
    // Use mouse X position to determine facing, but only if moving or aiming
    let shouldFaceRight = screenDirection.x > 0;
    
    // If moving, always face in the movement direction
    if (isMoving) {
      shouldFaceRight = moveDirection.x > 0;
      // Set the character's facing direction based on movement
      setFacingDirection(shouldFaceRight ? 'right' : 'left');
    } else {
      // When not moving, maintain the previous facing direction unless aiming significantly left/right
      // Only change facing for significant mouse movement (to avoid flipping back and forth)
      if (Math.abs(screenDirection.x) > 0.2) {
        setFacingDirection(shouldFaceRight ? 'right' : 'left');
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
      const screenDirection = new THREE.Vector2(
        mousePosition.current.x - screenCharPos.x,
        mousePosition.current.y - screenCharPos.y
      ).normalize();
      
      // For 2.5D side-scroller, simplify the rotation:
      // 1. Horizontal rotation (left/right): based on character's facing direction
      // 2. Vertical rotation (up/down): directly based on mouse Y position
      
      // Get if character is facing left or right based on our state
      const isFacingRight = facingDirection === 'right';
      const isFacingLeft = facingDirection === 'left';
      
      // Determine horizontal aim direction based on character's facing direction
      // If facing right, positive mouseX aims right, negative aims left (from character's perspective)
      // If facing left, it's reversed
      let horizontalAimFactor = isFacingRight ? 
        (screenDirection.x > 0 ? 0 : -screenDirection.x * 0.5) : 
        (screenDirection.x < 0 ? 0 : screenDirection.x * 0.5);
        
      // Vertical aim is directly based on mouse Y position relative to character
      // Positive Y means aim down, negative means aim up
      const verticalAimFactor = -screenDirection.y; // Invert so positive is up
      
      // Scale and clamp vertical angle to prevent unnatural bending
      // Increase max pitch angle for more dramatic effect
      const maxPitch = Math.PI * 1.2; // Increased from 0.7 to 1.2 (about 216 degrees)
      const clampedVerticalAngle = THREE.MathUtils.clamp(
        verticalAimFactor * maxPitch * 1.5, // Multiply by 1.5 for stronger effect
        -maxPitch,
        maxPitch
      );
      
      // Get horizontal rotation based on character facing direction
      // We want to limit how far the character can twist in each direction
      const maxTwist = Math.PI * 0.8; // Increased from 0.3 to 0.8 (about 144 degrees)
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
      
      // Distribute vertical rotation (pitch) with more emphasis on upper bones
      // Increase these values for more dramatic rotation
      const spinePitch = clampedVerticalAngle * 0.4;  // Increased from 0.3
      const spine1Pitch = clampedVerticalAngle * 0.6; // Increased from 0.45
      const spine2Pitch = clampedVerticalAngle * 0.8;  // Increased from 0.6
      
      // Apply rotations to bones with smooth transitions - faster lerp for more responsive rotation
      if (upperBodyBones.spine) {
        // For spine yaw (horizontal rotation)
        upperBodyBones.spine.rotation.y = THREE.MathUtils.lerp(
          upperBodyBones.spine.rotation.y,
          horizontalAngle * 0.2, // Less twist for lower spine
          delta * 8 // Faster lerp (was 5)
        );
        
        // For spine pitch (vertical rotation)
        upperBodyBones.spine.rotation.x = THREE.MathUtils.lerp(
          upperBodyBones.spine.rotation.x,
          spinePitch,
          delta * 8 // Faster lerp (was 5)
        );
      }
      
      if (upperBodyBones.spine1) {
        upperBodyBones.spine1.rotation.y = THREE.MathUtils.lerp(
          upperBodyBones.spine1.rotation.y,
          horizontalAngle * 0.3,
          delta * 8 // Faster lerp (was 5)
        );
        
        upperBodyBones.spine1.rotation.x = THREE.MathUtils.lerp(
          upperBodyBones.spine1.rotation.x,
          spine1Pitch,
          delta * 8 // Faster lerp (was 5)
        );
      }
      
      if (upperBodyBones.spine2) {
        upperBodyBones.spine2.rotation.y = THREE.MathUtils.lerp(
          upperBodyBones.spine2.rotation.y,
          horizontalAngle * 0.3,
          delta * 8 // Faster lerp (was 5)
        );
        
        upperBodyBones.spine2.rotation.x = THREE.MathUtils.lerp(
          upperBodyBones.spine2.rotation.x,
          spine2Pitch,
          delta * 8 // Faster lerp (was 5)
        );
      }
      
      // Add neck rotation if available for even more dramatic effect
      if (upperBodyBones.neck) {
        upperBodyBones.neck.rotation.x = THREE.MathUtils.lerp(
          upperBodyBones.neck.rotation.x,
          clampedVerticalAngle * 0.7, // Neck can rotate more dramatically
          delta * 8
        );
        
        upperBodyBones.neck.rotation.y = THREE.MathUtils.lerp(
          upperBodyBones.neck.rotation.y,
          horizontalAngle * 0.4, // More twist for neck
          delta * 8
        );
      }
      
      // Debug logging
      if (debug && Math.random() < 0.005) {
        console.log('Aim factors:', {
          screenDirection,
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

        // Apply rotations first
        rifleRef.current.rotateZ(offsets.rotation.z);  // Roll
        rifleRef.current.rotateX(offsets.rotation.x);   // Forward/backward tilt
        rifleRef.current.rotateY(offsets.rotation.y);   // Left/right angle

        // Then apply position offset
        rifleRef.current.translateX(offsets.position.x);  // Left/right
        rifleRef.current.translateY(offsets.position.y); // Up/down
        rifleRef.current.translateZ(offsets.position.z);  // Forward/backward

        if (debug && Math.random() < 0.001) {
          console.log('Rifle position:', rifleRef.current.position);
          console.log('Current animation:', currentAnimation);
          console.log('Using offsets:', offsets);
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
  });
  
  // Access the debug info for UI display
  useEffect(() => {
    // Make debug info available globally for the UI
    // @ts-ignore - Adding to window for debugging
    window.characterDebug = debugInfo;
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
    
    // Add animation speed control
    const animationSpeed = { speed: 1.0 };
    gui.add(animationSpeed, 'speed', 0.1, 2.0, 0.1).onChange((value: number) => {
      if (currentAnimation && actions && actions[currentAnimation]) {
        actions[currentAnimation].timeScale = value;
      }
    });
    
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
  }, [debug, currentAnimation, actions, guiVisible]);
  
  useImperativeHandle(ref, () => ({
    characterRef: characterRef.current,
    playAnimation: playAnimation
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
      
      {/* Debug visualization for aiming direction - Always show when debug is true */}
      {debug && (
        <group>
          {(() => {
            // Try to get the hand position for the starting point
            let startPosition = new THREE.Vector3();
            if (handBoneRef.current) {
              // Get world position of the right hand
              handBoneRef.current.getWorldPosition(startPosition);
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
                {/* Red dot at hand/weapon position */}
                <mesh position={startPosition}>
                  <sphereGeometry args={[0.1, 8, 8]} />
                  <meshBasicMaterial color="red" />
                </mesh>
                
                {/* Line from hand to aim point */}
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
              </>
            );
          })()}
        </group>
      )}
    </>
  );
};

export default forwardRef(CharacterController); 