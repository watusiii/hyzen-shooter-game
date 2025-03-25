'use client';

import React, { useEffect, useState, useRef, useMemo, Suspense } from 'react';
import { Canvas, useFrame, useLoader, extend, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF, useAnimations, PerspectiveCamera } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import * as dat from 'lil-gui';
import { EffectComposer, N8AO, Bloom } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';

// Sound Manager Class
class SoundManager {
  private static instance: SoundManager;
  private sounds: Map<string, HTMLAudioElement> = new Map();
  private music: HTMLAudioElement | null = null;
  private _volume: number = 0.5;
  private _muted: boolean = false;

  private constructor() {
    // Private constructor to enforce singleton
  }

  static getInstance(): SoundManager {
    if (!SoundManager.instance) {
      SoundManager.instance = new SoundManager();
    }
    return SoundManager.instance;
  }

  preloadSound(id: string, src: string): void {
    if (!this.sounds.has(id)) {
      const audio = new Audio(src);
      audio.preload = 'auto';
      this.sounds.set(id, audio);
      console.log(`Sound ${id} preloaded`);
    }
  }

  playSound(id: string, volume?: number): void {
    const sound = this.sounds.get(id);
    if (sound) {
      // Clone the audio to allow multiple instances to play simultaneously
      const soundInstance = sound.cloneNode() as HTMLAudioElement;
      soundInstance.volume = this._muted ? 0 : (volume !== undefined ? volume : this._volume);
      soundInstance.play().catch(err => console.log(`Sound play prevented for ${id}:`, err));
    } else {
      console.warn(`Sound ${id} not found`);
    }
  }

  playMusic(src: string, loop: boolean = true): void {
    // Stop current music if playing
    if (this.music) {
      this.music.pause();
      this.music.currentTime = 0;
    }

    this.music = new Audio(src);
    this.music.loop = loop;
    this.music.volume = this._muted ? 0 : this._volume;
    
    // Handle autoplay restrictions
    this.music.play().catch(err => {
      console.log("Music autoplay prevented:", err);
      // Create UI for user interaction to start music
      this.createMusicButton();
    });
  }

  createMusicButton(): void {
    // Only create button if music exists and we're in browser environment
    if (!this.music || typeof document === 'undefined') return;
    
    const existingButton = document.getElementById('sound-manager-music-button');
    if (existingButton) return; // Don't create duplicates
    
    const button = document.createElement('button');
    button.id = 'sound-manager-music-button';
    button.innerHTML = '▶ Play Music';
    button.style.position = 'fixed';
    button.style.bottom = '20px';
    button.style.left = '20px';
    button.style.zIndex = '1000';
    button.style.padding = '10px 15px';
    button.style.backgroundColor = 'rgba(0, 170, 85, 0.7)';
    button.style.color = 'white';
    button.style.border = 'none';
    button.style.borderRadius = '4px';
    button.style.cursor = 'pointer';
    button.style.boxShadow = '0 0 10px rgba(0, 170, 85, 0.5)';
    
    button.addEventListener('click', () => {
      this.music?.play();
      if (button.parentNode) {
        button.parentNode.removeChild(button);
      }
    });
    
    document.body.appendChild(button);
  }

  stopMusic(): void {
    if (this.music) {
      this.music.pause();
      this.music.currentTime = 0;
    }
  }

  pauseMusic(): void {
    if (this.music) {
      this.music.pause();
    }
  }

  resumeMusic(): void {
    if (this.music) {
      this.music.play().catch(err => {
        console.log("Music resume prevented:", err);
        this.createMusicButton();
      });
    }
  }

  setVolume(volume: number): void {
    this._volume = Math.max(0, Math.min(1, volume));
    
    // Update music volume
    if (this.music && !this._muted) {
      this.music.volume = this._volume;
    }
  }

  getVolume(): number {
    return this._volume;
  }

  setMuted(muted: boolean): void {
    this._muted = muted;
    
    // Update music volume
    if (this.music) {
      this.music.volume = muted ? 0 : this._volume;
    }
  }

  isMuted(): boolean {
    return this._muted;
  }

  // Clean up resources
  dispose(): void {
    this.stopMusic();
    this.sounds.clear();
    this.music = null;
  }
}

// Add CharacterData type definition at the top of the file
interface CharacterData {
  id: string;
  name: string;
  description: string;
  stats: {
    health: number;
    attack: number;
    defense: number;
    speed: number;
  };
  abilities: string[];
  modelPath: string;
  animationsPath: string;
}

// Add CSS to handle lil-gui styling
const additionalStyles = `
  .lil-gui.root {
    max-height: 80vh !important;
    overflow-y: auto !important;
  }
  
  .lil-gui .title {
    background-color: #006633 !important;
    color: white !important;
    font-weight: bold !important;
    position: sticky !important;
    top: 0 !important;
    z-index: 100 !important;
  }
  
  .lil-gui .close-button {
    background-color: #006633 !important;
    color: white !important;
    opacity: 1 !important;
    font-size: 20px !important;
    font-weight: bold !important;
    -webkit-text-stroke: 1px white !important;
    width: 20px !important;
    height: 20px !important;
    line-height: 18px !important;
    text-align: center !important;
    border-radius: 50% !important;
    display: block !important;
    visibility: visible !important;
  }
`;

// Animation control UI component
const AnimationControls = ({
  names,
  currentAnimation,
  onPlay,
  onStop
}: {
  names: string[];
  currentAnimation: string | null;
  onPlay: (name: string) => void;
  onStop: () => void;
}) => {
  return (
    <div style={{
      position: 'absolute',
      top: '20px',
      right: '16px',
      backgroundColor: '#ff0000', // Bright red background
      color: 'white',
      padding: '16px',
      borderRadius: '6px',
      maxHeight: '80vh',
      overflowY: 'auto',
      zIndex: 1000,
      border: '4px solid yellow' // Added bright border
    }}>
      <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', marginBottom: '12px' }}>TEST - ANIMATIONS PANEL</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {names.map(name => (
          <div key={name} style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => onPlay(name)}
              style={{
                padding: '4px 12px',
                marginRight: '8px',
                backgroundColor: currentAnimation === name ? '#22c55e' : '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              {currentAnimation === name ? '■' : '▶'} {name}
            </button>
            {currentAnimation === name && (
              <button
                onClick={onStop}
                style={{
                  padding: '4px 12px',
                  backgroundColor: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Stop
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// Character model component
const Character = ({
  modelPath,
  animationsPath,
  position = [0, 0, 0],
  apiName,
  onAnimationsLoaded,
  onAnimationStarted,
  onAnimationStopped,
  mixerRef,
  glowIntensity = 0  // Add glowIntensity parameter with default 0
}: {
  modelPath: string;
  animationsPath?: string; // Optional path to a model with animations to use
  position?: [number, number, number];
  apiName: string;
  onAnimationsLoaded: (names: string[]) => void;
  onAnimationStarted: (name: string) => void;
  onAnimationStopped: () => void;
  mixerRef: React.MutableRefObject<THREE.AnimationMixer | null>;
  glowIntensity?: number; // Add optional glowIntensity parameter
}) => {
  // Rifle adjustment parameters - these can be tweaked to get the right positioning
  const RIFLE_ROTATION = {
    x: Math.PI / 6,   // Forward/backward tilt
    y: Math.PI / 1 +1.8,   // Left/right angle
    z: -Math.PI / 2,  // Roll (horizontal/vertical orientation),
  };
  
  const RIFLE_POSITION = {
    x: 0.08,  // Left/right
    y: -0.02, // Up/down
    z: 0.15,  // Forward/backward
  };
  
  const actionsRef = useRef<{ [key: string]: THREE.AnimationAction }>({});
  const clockRef = useRef<THREE.Clock | null>(null);
  const [glow, setGlow] = useState(glowIntensity);
  const materialRefs = useRef<THREE.Material[]>([]);
  const handBoneRef = useRef<THREE.Object3D | null>(null);
  const rifleRef = useRef<THREE.Group | null>(null);
  
  // Track if animation is already running
  const [isAnimating, setIsAnimating] = useState(false);
  
  // Load the rifle model
  const { scene: rifleScene } = useGLTF('/models/weapon/rifle.glb', true);
  
  // Load the model without animations first
  const result = useGLTF(modelPath, true);
  const { scene } = result;
  
  // Load the animations from another model (if provided) or use the model's own animations
  const animationsResult = animationsPath ? useGLTF(animationsPath, true) : null;
  const animations = animationsPath && animationsResult ? animationsResult.animations : result.animations;
  
  // Set up animations
  const { actions, mixer } = useAnimations(animations, scene);

  // Create rifle instance as soon as the rifle model is loaded
  useEffect(() => {
    if (rifleScene) {
      console.log('Rifle model loaded, creating instance immediately');
      const rifleCopy = rifleScene.clone();
      // Scale the rifle to look appropriate relative to character
      rifleCopy.scale.set(0.7, 0.7, 0.7); 
      rifleRef.current = rifleCopy;
      console.log('Rifle reference set immediately', rifleRef.current);
    }
  }, [rifleScene]);

  // Find the hand bone reference immediately when the scene is loaded
  useEffect(() => {
    if (!scene) {
      console.warn('Character scene not loaded yet');
      return;
    }
    
    console.log('Searching for hand bone in scene...');
    let foundBone = false;
    
    // Try direct bone search first
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
    
    // Last resort - look for any hand bones
    if (!foundBone) {
      console.log('mixamorigRightHand not found, looking for any hand bones...');
      
      scene.traverse((object) => {
        if (object instanceof THREE.Bone) {
          const name = object.name.toLowerCase();
          if (name.includes('right') && name.includes('hand')) {
            console.log(`Found alternative right hand bone: ${object.name}`, object);
            handBoneRef.current = object;
            foundBone = true;
          }
        }
      });
    }
    
    if (!handBoneRef.current) {
      console.warn('Could not find any right hand bone');
    } else {
      console.log('Final hand bone reference:', handBoneRef.current);
    }
  }, [scene]);
  
  // Track the hand bone and update the rifle position every frame
  useFrame(({ clock }) => {
    // Only log occasionally to avoid console spam
    if (Math.floor(clock.getElapsedTime()) % 5 === 0 && !isAnimating) {
      console.log('References check:', {
        handBone: handBoneRef.current ? 'Found' : 'Missing', 
        rifle: rifleRef.current ? 'Found' : 'Missing'
      });
    }
    
    // Update rifle position if both references exist
    if (handBoneRef.current && rifleRef.current) {
      if (!isAnimating) {
        console.log('Starting rifle animation');
        setIsAnimating(true);
      }
      
      // Get the world position of the hand bone
      const handPosition = new THREE.Vector3();
      const handQuaternion = new THREE.Quaternion();
      handBoneRef.current.getWorldPosition(handPosition);
      handBoneRef.current.getWorldQuaternion(handQuaternion);
      
      // Update the rifle position
      rifleRef.current.position.copy(handPosition);
      
      // Update rotation to match hand
      rifleRef.current.quaternion.copy(handQuaternion);
      
      // Apply offset for better positioning
      rifleRef.current.rotateZ(RIFLE_ROTATION.z);
      rifleRef.current.rotateX(RIFLE_ROTATION.x);
      rifleRef.current.rotateY(RIFLE_ROTATION.y);
      
      // Adjust position offsets
      rifleRef.current.translateX(RIFLE_POSITION.x);
      rifleRef.current.translateY(RIFLE_POSITION.y);
      rifleRef.current.translateZ(RIFLE_POSITION.z);
    }
  });

  // Store all materials for glow effect
  useEffect(() => {
    const materials: THREE.Material[] = [];
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(material => materials.push(material));
        } else {
          materials.push(child.material);
        }
      }
    });
    materialRefs.current = materials;
  }, [scene]);

  // Apply glow effect when glowIntensity changes
  useEffect(() => {
    setGlow(glowIntensity);
  }, [glowIntensity]);

  // Update material glow effect
  useFrame(() => {
    if (glow > 0) {
      materialRefs.current.forEach(material => {
        if (material instanceof THREE.MeshStandardMaterial) {
          // Use a more intense cyan-blue glow color for better bloom effect
          material.emissive.setRGB(0.0, 0.8, 1.5);
          material.emissiveIntensity = glow * 2.5; // Increase intensity for better bloom
        }
      });
      // Faster fade out to reduce the glow time after character switching
      setGlow(prev => Math.max(0, prev - 0.16));
    } else if (glow === 0) {
      materialRefs.current.forEach(material => {
        if (material instanceof THREE.MeshStandardMaterial) {
          material.emissiveIntensity = 0;
        }
      });
    }
  });

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
    
    console.log(`[${apiName}] Available animations:`, animations.map(clip => clip.name));
    
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

    onAnimationsLoaded(animations.map(clip => clip.name));

    // Don't start any animation here, it will be started in the next useEffect

    // Start the animation loop
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

    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [scene, animations, mixer]);

  // Animation controls
  useEffect(() => {
    const api = {
      play: (name: string) => {
        console.log(`[${apiName}] Attempting to play animation: ${name}`);
        
        if (!actions || !actions[name]) {
          console.error(`[${apiName}] No action found for animation: ${name}`);
          return;
        }

        const action = actions[name];
        console.log(`[${apiName}] Configuring action for: ${name}`);
        action.reset();
        action.setEffectiveWeight(1.0);
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.play();

        onAnimationStarted(name);
      },
      stop: (name: string) => {
        console.log(`[${apiName}] Attempting to stop animation: ${name}`);
        
        if (!actions || !actions[name]) {
          console.error(`[${apiName}] No action found for animation: ${name}`);
          return;
        }

        const action = actions[name];
        console.log(`[${apiName}] Stopping animation: ${name}`);
        action.fadeOut(0.5);
        setTimeout(() => {
          action.stop();
        }, 500);
        
        onAnimationStopped();
      }
    };

    // @ts-ignore - Adding to window for debugging
    window[apiName] = api;

    // Start rifle run animation by default
    if (actions && actions['RifleRun']) {
      console.log('Starting RifleRun animation by default');
      api.play('RifleRun');
    } else {
      console.log('Could not find RifleRun animation. Available animations:', Object.keys(actions));
    }

    return () => {
      // @ts-ignore - Cleanup
      delete window[apiName];
    };
  }, [actions, onAnimationStarted, onAnimationStopped, apiName]);

  return (
    <>
      {/* Character model */}
      <primitive 
        object={scene} 
        position={position}
        scale={[2, 2, 2]}
      />
      
      {/* Always render the rifle model, but it will only be visible and positioned
          correctly when rifleRef.current exists */}
      {rifleRef.current && (
        <primitive object={rifleRef.current} />
      )}
    </>
  );
};

// Character information UI component
const CharacterInfoPanel = ({
  character,
  onPrevious,
  onNext,
  onSelect,
  soundManagerRef,
  audioVolume,
  audioMuted
}: {
  character: CharacterData;
  onPrevious: () => void;
  onNext: () => void;
  onSelect: () => void;
  soundManagerRef: React.MutableRefObject<SoundManager | null>;
  audioVolume: number;
  audioMuted: boolean;
}) => {
  // Function to play hover sound
  const playHoverSound = () => {
    if (!audioMuted) {
      soundManagerRef.current?.playSound('hover', audioVolume * 0.5);
    }
  };
  
  return (
    <>
      {/* Top Character Info Panel with techie angled corners */}
      <div style={{
        position: 'absolute',
        left: '50%',
        top: '32px',
        transform: 'translateX(-50%)',
        color: 'white',
        width: '500px',
        maxWidth: '90%',
        zIndex: 1000,
        textAlign: 'center',
        // Remove default styles that would interfere
        backgroundColor: 'transparent',
        border: 'none',
        // Add the clip-path for techie corners - one sharp, one angled per side
        clipPath: 'polygon(0% 0%, 80% 0%, 100% 20%, 100% 100%, 20% 100%, 0% 80%)'
      }}>
        {/* Background with glow */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 20, 10, 0.85)',
          border: '1px solid rgba(0, 170, 85, 0.5)',
          boxShadow: '0 0 20px rgba(0, 170, 85, 0.3), inset 0 0 10px rgba(0, 170, 85, 0.2)',
          zIndex: -1,
        }} />
        
        {/* Green glow on edges */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          border: '1px solid transparent',
          boxShadow: '0 0 15px rgba(0, 170, 85, 0.5), inset 0 0 8px rgba(0, 170, 85, 0.3)',
          zIndex: -1,
          pointerEvents: 'none',
          clipPath: 'polygon(0% 0%, 80% 0%, 100% 20%, 100% 100%, 20% 100%, 0% 80%)'
        }} />
        
        {/* Corner accents - adjust to match new corners */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '30px',
          height: '30px',
          borderLeft: '2px solid #00aa66',
          borderTop: '2px solid #00aa66',
          // animation: 'cornerBlink 3s infinite'
        }} />
        <div style={{
          position: 'absolute',
          top: 0,
          right: '20px',
          width: '30px',
          height: '30px',
          borderRight: '2px solid #00aa66',
          borderTop: '2px solid #00aa66',
          // animation: 'cornerBlink 3s infinite 0.75s'
        }} />
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: '20px',
          width: '30px',
          height: '30px',
          borderLeft: '2px solid #00aa66',
          borderBottom: '2px solid #00aa66',
          // animation: 'cornerBlink 3s infinite 1.5s'
        }} />
        <div style={{
          position: 'absolute',
          bottom: 0,
          right: 0,
          width: '30px',
          height: '30px',
          borderRight: '2px solid #00aa66',
          borderBottom: '2px solid #00aa66',
          // animation: 'cornerBlink 3s infinite 2.25s'
        }} />
        
        {/* Digital dots in corners - adjusted for new corners */}
        <div style={{
          position: 'absolute',
          top: '5px',
          left: '5px',
          width: '6px',
          height: '6px',
          background: '#ff66aa',
          boxShadow: '0 0 5px #ff66aa, 0 0 10px #ff66aa',
          borderRadius: '50%',
          animation: 'pulse 2s infinite'
        }} />
        <div style={{
          position: 'absolute',
          top: '5px',
          right: '25px',
          width: '6px',
          height: '6px',
          background: '#ff66aa',
          boxShadow: '0 0 5px #ff66aa, 0 0 10px #ff66aa',
          borderRadius: '50%',
          animation: 'pulse 2s infinite 0.5s'
        }} />
        <div style={{
          position: 'absolute',
          bottom: '5px',
          left: '25px',
          width: '6px',
          height: '6px',
          background: '#ff66aa',
          boxShadow: '0 0 5px #ff66aa, 0 0 10px #ff66aa',
          borderRadius: '50%',
          animation: 'pulse 2s infinite 1s'
        }} />
        <div style={{
          position: 'absolute',
          bottom: '5px',
          right: '5px',
          width: '6px',
          height: '6px',
          background: '#ff66aa',
          boxShadow: '0 0 5px #ff66aa, 0 0 10px #ff66aa',
          borderRadius: '50%',
          animation: 'pulse 2s infinite 1.5s'
        }} />
        
        {/* Tech decorative lines */}
        <div style={{
          position: 'absolute',
          top: '30px',
          left: '30px',
          width: '40px',
          height: '2px',
          background: 'linear-gradient(to right, rgba(0, 170, 85, 0), rgba(0, 170, 85, 0.8))'
        }} />
        <div style={{
          position: 'absolute',
          top: '30px',
          right: '30px',
          width: '40px',
          height: '2px',
          background: 'linear-gradient(to left, rgba(0, 170, 85, 0), rgba(0, 170, 85, 0.8))'
        }} />
        
        {/* Content Container - no descriptions, just name */}
        <div style={{ padding: '25px 25px' }}>
          <h2 style={{ 
            margin: '0', 
            fontSize: '2.5rem', 
            fontWeight: 'bold',
            color: '#00cc66',
            textShadow: '0 0 10px rgba(0, 170, 85, 0.7)',
            fontFamily: 'Arial, Helvetica, sans-serif'
          }}>
            {character.name}
          </h2>
        </div>
      </div>
      
      {/* Control Container - Centered horizontally with buttons on either side of select */}
      <div style={{
        position: 'absolute',
        left: '50%',
        bottom: '80px',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: '30px',
        zIndex: 1000
      }}>
        {/* Previous Button - Techie style */}
        <button 
          onClick={onPrevious}
          onMouseEnter={playHoverSound}
          className="nav-button nav-button-prev"
        >
          {/* Border overlay */}
          <div className="nav-button-border nav-button-prev" />
          
          {/* Glow effect */}
          <div className="nav-button-glow" />
          
          {/* Shine effect */}
          <div className="nav-button-shine" />
          
          {/* Tech corner indicator lights */}
          <div style={{
            position: 'absolute',
            top: '5px',
            right: '5px',
            width: '4px',
            height: '4px',
            background: '#ff66aa',
            borderRadius: '50%',
            boxShadow: '0 0 5px #ff66aa',
            animation: 'blink 1s infinite'
          }} />
          
          <div style={{
            position: 'absolute',
            bottom: '5px',
            left: '5px',
            width: '4px',
            height: '4px',
            background: '#ff66aa',
            borderRadius: '50%',
            boxShadow: '0 0 5px #ff66aa',
            animation: 'blink 1s infinite 0.5s'
          }} />
          
          {/* Arrow Text */}
          <span style={{ position: 'relative', zIndex: 3 }}>←</span>
        </button>
        
        {/* Select Button - Techie style */}
        <button 
          onClick={onSelect}
          onMouseEnter={playHoverSound}
          style={{
            background: 'linear-gradient(135deg, #003322, #006633)',
            border: 'none',
            color: 'white',
            padding: '15px 40px',
            cursor: 'pointer',
            fontSize: '1.25rem',
            fontWeight: 'bold',
            textTransform: 'uppercase',
            letterSpacing: '2px',
            position: 'relative',
            overflow: 'hidden',
            clipPath: 'polygon(10% 0%, 90% 0%, 100% 30%, 100% 70%, 90% 100%, 10% 100%, 0% 70%, 0% 30%)'
          }}
        >
          {/* Border overlay */}
          <div style={{
            position: 'absolute',
            top: '2px',
            left: '2px',
            right: '2px',
            bottom: '2px',
            border: '1px solid #00cc66',
            clipPath: 'polygon(10% 0%, 90% 0%, 100% 30%, 100% 70%, 90% 100%, 10% 100%, 0% 70%, 0% 30%)',
            zIndex: 1
          }} />
          
          {/* Light bar top */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: '20%',
            right: '20%',
            height: '2px',
            background: '#00ee66',
            boxShadow: '0 0 10px 2px rgba(0, 238, 102, 0.8)',
            zIndex: 2
          }} />
          
          {/* Light bar bottom */}
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: '20%',
            right: '20%',
            height: '2px',
            background: '#00ee66',
            boxShadow: '0 0 10px 2px rgba(0, 238, 102, 0.8)',
            zIndex: 2
          }} />
          
          {/* Digital circuit pattern overlay */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundSize: 'cover',
            opacity: 0.1,
            zIndex: 1
          }} />
          
          {/* Shine animation */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent)',
            transform: 'translateX(-100%)',
            animation: 'shine 2s infinite',
            zIndex: 3
          }} />
          
          {/* Text */}
          <span style={{ position: 'relative', zIndex: 4, textShadow: '0 0 5px rgba(0, 238, 102, 0.8)' }}>
            Select {character.name}
          </span>
        </button>
        
        {/* Next Button - Techie style */}
        <button 
          onClick={onNext}
          onMouseEnter={playHoverSound}
          className="nav-button nav-button-next"
        >
          {/* Border overlay */}
          <div className="nav-button-border nav-button-next" />
          
          {/* Glow effect */}
          <div className="nav-button-glow" />
          
          {/* Shine effect */}
          <div className="nav-button-shine" />
          
          {/* Tech corner indicator lights */}
          <div style={{
            position: 'absolute',
            top: '5px',
            left: '5px',
            width: '4px',
            height: '4px',
            background: '#ff66aa',
            borderRadius: '50%',
            boxShadow: '0 0 5px #ff66aa',
            animation: 'blink 1s infinite'
          }} />
          
          <div style={{
            position: 'absolute',
            bottom: '5px',
            right: '5px',
            width: '4px',
            height: '4px',
            background: '#ff66aa',
            borderRadius: '50%',
            boxShadow: '0 0 5px #ff66aa',
            animation: 'blink 1s infinite 0.5s'
          }} />
          
          {/* Arrow Text */}
          <span style={{ position: 'relative', zIndex: 3 }}>→</span>
        </button>
      </div>
      
      {/* Add animations */}
      <style>
        {`
          @keyframes shine {
            0% {
              transform: translateX(-100%);
            }
            50%, 100% {
              transform: translateX(100%);
            }
          }
          
          @keyframes pulse {
            0%, 100% {
              opacity: 1;
              transform: scale(1);
            }
            50% {
              opacity: 0.6;
              transform: scale(0.8);
            }
          }
          
          @keyframes blink {
            0%, 100% {
              opacity: 0.2;
            }
            50% {
              opacity: 1;
            }
          }
          
          @keyframes cornerBlink {
            0%, 100% {
              border-color: #00aa66;
              box-shadow: 0 0 0px rgba(0, 170, 85, 0);
            }
            50% {
              border-color: #ff66aa;
              box-shadow: 0 0 10px rgba(255, 102, 170, 0.8);
            }
          }

          @keyframes buttonHover {
            0% {
              background: rgba(0, 20, 10, 0.7);
            }
            100% {
              background: linear-gradient(135deg, rgba(0, 170, 85, 0.4), rgba(0, 255, 136, 0.6));
            }
          }

          .nav-button {
            background: rgba(0, 20, 10, 0.7);
            border: none;
            color: white;
            cursor: pointer;
            width: 70px;
            height: 70px;
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 28px;
            transition: all 0.2s ease-out;
            overflow: hidden;
          }

          .nav-button:hover {
            animation: buttonHover 0.2s forwards;
            transform: scale(1.05);
          }

          .nav-button:hover .nav-button-border {
            border-color: #00ff88;
            box-shadow: 0 0 15px rgba(0, 255, 136, 0.5);
          }

          .nav-button:hover .nav-button-glow {
            box-shadow: inset 0 0 20px rgba(0, 255, 136, 0.8);
          }

          .nav-button:hover .nav-button-shine {
            animation: navShine 0.5s forwards;
          }

          @keyframes navShine {
            0% {
              transform: skew(-45deg) translateX(-150%);
            }
            100% {
              transform: skew(-45deg) translateX(150%);
            }
          }

          .nav-button-shine {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(
              90deg, 
              transparent, 
              rgba(0, 255, 136, 0.4), 
              transparent
            );
            transform: skew(-45deg) translateX(-150%);
            z-index: 4;
            pointer-events: none;
          }

          .nav-button-prev {
            clip-path: polygon(30% 0%, 100% 0%, 100% 70%, 70% 100%, 0% 100%, 0% 30%);
          }

          .nav-button-next {
            clip-path: polygon(0% 0%, 70% 0%, 100% 30%, 100% 100%, 30% 100%, 0% 70%);
          }

          .nav-button-border {
            position: absolute;
            top: 2px;
            left: 2px;
            right: 2px;
            bottom: 2px;
            border: 1px solid #00aa66;
            z-index: 1;
            transition: all 0.2s ease-out;
          }

          .nav-button-glow {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            box-shadow: inset 0 0 10px rgba(0, 170, 85, 0.5);
            z-index: 2;
            transition: all 0.2s ease-out;
          }
        `}
      </style>
    </>
  );
};

// Sample character data - would eventually come from an API or database
const sampleCharacters: CharacterData[] = [
  {
    id: 'char1',
    name: 'Nova-7',
    description: 'A next-generation combat android designed for both frontline combat and tactical operations. Equipped with advanced targeting systems and reinforced armor plating.',
    stats: {
      health: 8,
      attack: 7,
      defense: 9,
      speed: 6
    },
    abilities: ['Tactical Scan', 'Shield Deploy', 'Precision Strike', 'System Override'],
    modelPath: '/models/player/1_1.glb',
    animationsPath: '/models/player/2_1.glb'
  },
  {
    id: 'char2',
    name: 'Phantom',
    description: 'An experimental stealth unit utilizing cutting-edge optical camouflage technology. Specializes in reconnaissance and surgical strike operations.',
    stats: {
      health: 6,
      attack: 9,
      defense: 5,
      speed: 10
    },
    abilities: ['Ghost Protocol', 'Void Strike', 'Neural Disrupt', 'Shadow Step'],
    modelPath: '/models/player/1_2.glb',
    animationsPath: '/models/player/2_1.glb'
  },
  {
    id: 'char3',
    name: 'Titan',
    description: 'A heavy assault platform designed for maximum firepower and battlefield control. Equipped with reinforced armor and area denial weaponry.',
    stats: {
      health: 10,
      attack: 10,
      defense: 7,
      speed: 4
    },
    abilities: ['Barrage', 'Kinetic Shield', 'Ground Slam', 'Missile Volley'],
    modelPath: '/models/player/2_1.glb',
    animationsPath: '/models/player/2_1.glb'
  },
  {
    id: 'char4',
    name: 'Vanguard',
    description: 'A versatile frontline fighter combining tactical prowess with cutting-edge weaponry. Equipped with adaptable combat systems for any situation.',
    stats: {
      health: 8,
      attack: 8,
      defense: 8,
      speed: 7
    },
    abilities: ['Tactical Scan', 'Adaptive Shield', 'Combat Overdrive', 'Precision Strike'],
    modelPath: '/models/player/2_2.glb',
    animationsPath: '/models/player/2_1.glb'
  }
];

// Create a separate component for camera animation
const CameraAnimation = () => {
  const { camera } = useThree();
  const startPosition = useMemo(() => new THREE.Vector3(5, 6, 9), []);
  const endPosition = useMemo(() => new THREE.Vector3(5, 3.2, 9), []);
  const startTarget = useMemo(() => new THREE.Vector3(0, 3, 0), []);
  const endTarget = useMemo(() => new THREE.Vector3(0, 1.8, 0), []);
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const startTimeRef = useRef(0);
  const isFirstFrame = useRef(true);
  
  // Add mouse tracking state
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  
  // Track mouse movement
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Normalize mouse position to range -1 to 1
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = (e.clientY / window.innerHeight) * 2 - 1;
      setMousePosition({ x, y });
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);
  
  // Set initial camera position
  useEffect(() => {
    camera.position.copy(startPosition);
    if (controlsRef.current) {
      controlsRef.current.target.copy(startTarget);
    }
  }, [camera, startPosition, startTarget]);

  useFrame((state) => {
    if (isFirstFrame.current) {
      startTimeRef.current = state.clock.elapsedTime;
      isFirstFrame.current = false;
    }

    const elapsed = state.clock.elapsedTime - startTimeRef.current;
    const duration = 2.5; // Animation duration in seconds
    const progress = Math.min(elapsed / duration, 1);

    // Smooth easing function
    const eased = 1 - Math.pow(1 - progress, 3);

    // Base camera position from intro animation
    const basePosition = new THREE.Vector3();
    basePosition.lerpVectors(startPosition, endPosition, eased);
    
    // Apply subtle mouse influence (after intro animation is complete)
    if (progress >= 1) {
      // Apply mouse movement with dampened effect
      const mouseInfluenceX = mousePosition.x * 0.5; // Horizontal movement
      const mouseInfluenceY = mousePosition.y * 0.3; // Vertical movement
      
      // Apply to camera position - subtle movement
      camera.position.x = basePosition.x + mouseInfluenceX;
      camera.position.y = basePosition.y - mouseInfluenceY; // Invert Y for natural feel
      
      // Also adjust camera target slightly
      if (controlsRef.current) {
        const baseTarget = new THREE.Vector3();
        baseTarget.lerpVectors(startTarget, endTarget, eased);
        
        controlsRef.current.target.x = baseTarget.x + mouseInfluenceX * 0.5;
        controlsRef.current.target.y = baseTarget.y - mouseInfluenceY * 0.5;
        controlsRef.current.update();
      }
    } else {
      // During intro animation, just use the base position
      camera.position.copy(basePosition);
      
      // Interpolate target position
      if (controlsRef.current) {
        controlsRef.current.target.lerpVectors(startTarget, endTarget, eased);
        controlsRef.current.update();
      }
    }
  });

  return (
    <OrbitControls 
      ref={controlsRef}
      makeDefault 
      target={[0, 3, 0]} // Start with initial target
      maxPolarAngle={Math.PI / 2}
      minDistance={4}
      maxDistance={12}
      enableDamping
      dampingFactor={0.05}
      enableZoom={false} // Disable zoom to maintain camera distance
      enablePan={false}  // Disable panning to prevent camera drift
    />
  );
};

// Main Character Selection component
const CharacterSelect = () => {
  const [warriorAnimationNames, setWarriorAnimationNames] = useState<string[]>([]);
  const [currentWarriorAnimation, setCurrentWarriorAnimation] = useState<string | null>(null);
  const warriorMixerRef = useRef<THREE.AnimationMixer | null>(null);
  
  // Audio manager reference
  const soundManagerRef = useRef<SoundManager | null>(null);
  
  // Character selection state
  const [selectedCharacterIndex, setSelectedCharacterIndex] = useState(0);
  const currentCharacter = sampleCharacters[selectedCharacterIndex];
  
  // Flag to enable using monster animations on warrior model
  const [useSharedAnimations, setUseSharedAnimations] = useState(true);
  
  // Add state to track if character is changing to handle model transitions
  const [isChangingCharacter, setIsChangingCharacter] = useState(false);
  
  // Add state for glow effect
  const [glowIntensity, setGlowIntensity] = useState(0);
  
  // Add state for audio control
  const [audioVolume, setAudioVolume] = useState(0.3);
  const [audioMuted, setAudioMuted] = useState(false);

  // Initialize sound manager and preload sounds
  useEffect(() => {
    // Initialize sound manager
    soundManagerRef.current = SoundManager.getInstance();
    const soundManager = soundManagerRef.current;
    
    // Set initial volume and mute state
    soundManager.setVolume(audioVolume);
    soundManager.setMuted(audioMuted);
    
    // Preload sound effects using the actual files that exist in the project
    soundManager.preloadSound('hover', '/sound/hover.mp3');
    soundManager.preloadSound('buttonDown', '/sound/buttonDown.mp3');
    soundManager.preloadSound('charSelect', '/sound/charSelect.mp3');
    soundManager.preloadSound('echoes', '/music/echoes.mp3');
    
    // Play background music
    soundManager.playMusic('/music/echoes.mp3', true);
    
    // Cleanup on unmount
    return () => {
      soundManager.dispose();
    };
  }, []);
  
  // Update sound manager when volume/mute changes
  useEffect(() => {
    if (soundManagerRef.current) {
      soundManagerRef.current.setVolume(audioVolume);
      soundManagerRef.current.setMuted(audioMuted);
    }
  }, [audioVolume, audioMuted]);

  // Navigation handlers
  const handlePrevious = () => {
    // Play navigation sound effect
    soundManagerRef.current?.playSound('buttonDown', audioVolume * 0.7);
    
    // Start glowing the current character before changing
    setGlowIntensity(2.0);
    
    // Change character index immediately but with transition effect
    setIsChangingCharacter(true);
    setTimeout(() => {
      setSelectedCharacterIndex((prev) => 
        prev === 0 ? sampleCharacters.length - 1 : prev - 1
      );
      setIsChangingCharacter(false);
      setGlowIntensity(2.0); // Start with glow
      
      // Play character change sound
      soundManagerRef.current?.playSound('charSelect', audioVolume * 0.8);
    }, 100); // Shortened transition time
  };
  
  const handleNext = () => {
    // Play navigation sound effect
    soundManagerRef.current?.playSound('buttonDown', audioVolume * 0.7);
    
    // Start glowing the current character before changing
    setGlowIntensity(2.0);
    
    // Change character index immediately but with transition effect
    setIsChangingCharacter(true);
    setTimeout(() => {
      setSelectedCharacterIndex((prev) => 
        (prev + 1) % sampleCharacters.length
      );
      setIsChangingCharacter(false);
      setGlowIntensity(2.0); // Start with glow
      
      // Play character change sound
      soundManagerRef.current?.playSound('charSelect', audioVolume * 0.8);
    }, 100); // Shortened transition time
  };
  
  const handleSelect = () => {
    // Play select sound effect
    soundManagerRef.current?.playSound('buttonDown', audioVolume);
    
    // Would typically navigate to the next screen or start the game
    alert(`Selected character: ${currentCharacter.name}`);
  };

  // Add the custom CSS styles to the document
  useEffect(() => {
    // Add the CSS styles to the document
    const styleElement = document.createElement('style');
    styleElement.textContent = additionalStyles + `
      .lil-gui .controller.sound-controller {
        display: flex;
        align-items: center;
      }
      
      .lil-gui .controller.sound-controller input[type="range"] {
        flex-grow: 1;
        margin-left: 8px;
      }
      
      .techie-background {
        background-color: #0a140a;
        background-image: 
          linear-gradient(rgba(0, 170, 85, 0.1) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0, 170, 85, 0.1) 1px, transparent 1px);
        background-size: 20px 20px;
        position: relative;
        z-index: 1;
      }
      
      .techie-background::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-image: 
          radial-gradient(circle at 0px 0px, rgba(0, 255, 102, 0.2) 1px, transparent 1px);
        background-size: 20px 20px;
        z-index: -1;
        pointer-events: none;
      }

      @keyframes backgroundPulse {
        0%, 100% { background-color: #0a140a; }
        50% { background-color: #071807; }
      }

      .techie-container {
        clip-path: polygon(
          0% 0%,        /* top-left - sharp */
          20px 0%,      /* top-left inner point */
          40px 20px,    /* top-left angled corner */
          calc(100% - 40px) 20px, /* top-right inner point */
          calc(100% - 20px) 0%,   /* top-right inner point */
          100% 0%,      /* top-right - sharp */
          100% calc(100% - 20px), /* bottom-right inner point */
          calc(100% - 40px) 100%, /* bottom-right angled corner */
          40px 100%,    /* bottom-left inner point */
          20px calc(100% - 20px), /* bottom-left angled corner */
          0% calc(100% - 20px),   /* bottom-left inner point */
          0% 0%         /* back to start */
        );
        position: relative;
        overflow: hidden;
      }

      .techie-container::before {
        content: '';
        position: absolute;
        top: 4px;
        left: 4px;
        right: 4px;
        bottom: 4px;
        clip-path: polygon(
          0% 0%,        /* top-left - sharp */
          20px 0%,      /* top-left inner point */
          40px 20px,    /* top-left angled corner */
          calc(100% - 40px) 20px, /* top-right inner point */
          calc(100% - 20px) 0%,   /* top-right inner point */
          100% 0%,      /* top-right - sharp */
          100% calc(100% - 20px), /* bottom-right inner point */
          calc(100% - 40px) 100%, /* bottom-right angled corner */
          40px 100%,    /* bottom-left inner point */
          20px calc(100% - 20px), /* bottom-left angled corner */
          0% calc(100% - 20px),   /* bottom-left inner point */
          0% 0%         /* back to start */
        );
        border: 1px solid rgba(0, 200, 102, 0.6);
        z-index: 0;
        pointer-events: none;
      }

      .techie-corner {
        position: absolute;
        width: 30px;
        height: 30px;
        z-index: 10;
      }

      .techie-corner-tl {
        top: 0;
        left: 0;
        border-top: 2px solid #00aa66;
        border-left: 2px solid #00aa66;
      }

      .techie-corner-tr {
        top: 0;
        right: 0;
        border-top: 2px solid #00aa66;
        border-right: 2px solid #00aa66;
      }

      .techie-corner-bl {
        bottom: 0;
        left: 0;
        border-bottom: 2px solid #00aa66;
        border-left: 2px solid #00aa66;
      }

      .techie-corner-br {
        bottom: 0;
        right: 0;
        border-bottom: 2px solid #00aa66;
        border-right: 2px solid #00aa66;
      }

      .techie-dots {
        position: absolute;
        width: 6px;
        height: 6px;
        background: #ff66aa;
        border-radius: 50%;
        box-shadow: 0 0 5px #ff66aa, 0 0 10px #ff66aa;
        animation: pulse 2s infinite;
      }

      .techie-dots-tl {
        top: 5px;
        left: 5px;
        animation-delay: 0s;
      }

      .techie-dots-tr {
        top: 5px;
        right: 5px;
        animation-delay: 0.5s;
      }

      .techie-dots-bl {
        bottom: 5px;
        left: 5px;
        animation-delay: 1s;
      }

      .techie-dots-br {
        bottom: 5px;
        right: 5px;
        animation-delay: 1.5s;
      }

      .techie-grid-line {
        position: absolute;
        background: linear-gradient(to right, rgba(0, 170, 85, 0), rgba(0, 170, 85, 0.7), rgba(0, 170, 85, 0));
        height: 1px;
        width: 100%;
        opacity: 0.3;
      }

      .techie-grid-line-h1 {
        top: 20%;
      }

      .techie-grid-line-h2 {
        top: 50%;
      }

      .techie-grid-line-h3 {
        top: 80%;
      }

      .techie-grid-line-v {
        position: absolute;
        background: linear-gradient(to bottom, rgba(0, 170, 85, 0), rgba(0, 170, 85, 0.7), rgba(0, 170, 85, 0));
        width: 1px;
        height: 100%;
        opacity: 0.3;
      }

      .techie-grid-line-v1 {
        left: 25%;
      }

      .techie-grid-line-v2 {
        left: 50%;
      }

      .techie-grid-line-v3 {
        left: 75%;
      }
      
      .techie-accent-line {
        position: absolute;
        height: 3px;
        background: linear-gradient(to right, #008844, #00ff66);
      }
      
      .techie-accent-line-top {
        top: 10px;
        left: 100px;
        width: 120px;
      }
      
      .techie-accent-line-right {
        top: 30px;
        right: 10px;
        width: 80px;
        transform: rotate(90deg);
        transform-origin: right;
      }
      
      .techie-accent-line-bottom {
        bottom: 15px;
        right: 80px;
        width: 160px;
      }
    `;
    document.head.appendChild(styleElement);
    
    return () => {
      document.head.removeChild(styleElement);
    };
  }, []);

  // Initialize dat.gui
  useEffect(() => {
    // Create GUI with proper settings
    const gui = new dat.GUI({ 
      width: 300,
      title: 'Game Controls'
    });
    
    // Hide GUI by default
    gui.domElement.style.display = 'none';
    
    // Add keyboard shortcut to toggle GUI visibility (press 'h' to hide/show)
    const toggleGui = () => {
      if (gui.domElement.style.display === 'none') {
        gui.domElement.style.display = '';
        showButton.style.display = 'none';
      } else {
        gui.domElement.style.display = 'none';
        showButton.style.display = 'block';
      }
    };

    window.addEventListener('keydown', (event) => {
      if (event.key === 'h' || event.key === 'H') {
        toggleGui();
      }
    });

    // Add a small button to show the GUI when it's hidden
    const showButton = document.createElement('button');
    showButton.innerHTML = '⚙️';
    showButton.style.position = 'fixed';
    showButton.style.top = '10px';
    showButton.style.right = '10px';
    showButton.style.zIndex = '1000';
    showButton.style.padding = '8px';
    showButton.style.background = 'rgba(0, 0, 0, 0.7)';
    showButton.style.color = 'white';
    showButton.style.border = 'none';
    showButton.style.borderRadius = '4px';
    showButton.style.cursor = 'pointer';
    showButton.style.display = 'block';
    document.body.appendChild(showButton);

    showButton.addEventListener('click', toggleGui);
    
    const controls = {
      warriorSpeed: 1.0,
      soundVolume: audioVolume,
      soundMuted: audioMuted,
      hideControls: toggleGui
    };

    // Add hide button to the controls
    gui.add(controls, 'hideControls').name('Hide Controls');

    // Create Audio folder
    const audioFolder = gui.addFolder('Audio Controls');
    
    // Add volume control
    audioFolder.add(controls, 'soundVolume', 0, 1, 0.01)
      .name('Volume')
      .onChange((value: number) => {
        setAudioVolume(value);
      });
    
    // Add mute toggle
    audioFolder.add(controls, 'soundMuted')
      .name('Mute Sound')
      .onChange((value: boolean) => {
        setAudioMuted(value);
      });
    
    // Create Animation folder
    const animationsFolder = gui.addFolder('Animations');

    // Add speed control
    animationsFolder.add(controls, 'warriorSpeed', 0, 2)
      .name('Animation Speed')
      .onChange((value: number) => {
        if (warriorMixerRef.current) {
          warriorMixerRef.current.timeScale = value;
        }
      });

    // Add animation toggles
    const animationToggles: { [key: string]: boolean } = {};
    warriorAnimationNames.forEach(name => {
      animationToggles[name] = name === 'RifleRun'; // Set RifleRun to true by default
      animationsFolder.add(animationToggles, name)
        .onChange((value: boolean) => {
          if (value) {
            // @ts-ignore - Using window for debugging
            window.warriorAnimations?.play(name);
          } else {
            // @ts-ignore - Using window for debugging
            window.warriorAnimations?.stop(name);
          }
        });
    });

    return () => {
      gui.destroy();
      if (showButton && showButton.parentNode) {
        showButton.parentNode.removeChild(showButton);
      }
      window.removeEventListener('keydown', (event) => {
        if (event.key === 'h' || event.key === 'H') {
          toggleGui();
        }
      });
    };
  }, [warriorAnimationNames, audioVolume, audioMuted]);

  return (
    <div className="techie-background" style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      width: '100%',
      minHeight: '100vh'
    }}>
      {/* Parent container with border that won't be clipped */}
      <div style={{
        width: '90%',
        height: '90vh',
        margin: '20px',
        position: 'relative',
        background: 'linear-gradient(135deg, #003322 0%, #008844 50%, #00aa66 100%)',
        boxShadow: '0 0 30px rgba(0, 170, 85, 0.5)',
        padding: '2px', // This creates space for the border
        clipPath: 'polygon(0% 0%, 20px 0%, 40px 20px, calc(100% - 40px) 20px, calc(100% - 20px) 0%, 100% 0%, 100% calc(100% - 20px), calc(100% - 40px) 100%, 40px 100%, 20px calc(100% - 20px), 0% calc(100% - 20px), 0% 0%)'
      }}>
        <div className="techie-container" style={{ 
          width: '100%',
          height: '100%', 
          position: 'relative',
          backgroundColor: '#051005',
          boxShadow: 'inset 0 0 15px rgba(0, 170, 85, 0.3)',
          border: 'none', // Remove border from the clipped container
          clipPath: 'polygon(0% 0%, 20px 0%, 40px 20px, calc(100% - 40px) 20px, calc(100% - 20px) 0%, 100% 0%, 100% calc(100% - 20px), calc(100% - 40px) 100%, 40px 100%, 20px calc(100% - 20px), 0% calc(100% - 20px), 0% 0%)'
        }}>
          {/* Techie corner accents */}
          <div className="techie-corner techie-corner-tl"></div>
          <div className="techie-corner techie-corner-tr"></div>
          <div className="techie-corner techie-corner-bl"></div>
          <div className="techie-corner techie-corner-br"></div>
          
          {/* Corner indicator lights */}
          <div className="techie-dots techie-dots-tl"></div>
          <div className="techie-dots techie-dots-tr"></div>
          <div className="techie-dots techie-dots-bl"></div>
          <div className="techie-dots techie-dots-br"></div>
          
          {/* Techie grid lines */}
          <div className="techie-grid-line techie-grid-line-h1"></div>
          <div className="techie-grid-line techie-grid-line-h2"></div>
          <div className="techie-grid-line techie-grid-line-h3"></div>
          <div className="techie-grid-line-v techie-grid-line-v1"></div>
          <div className="techie-grid-line-v techie-grid-line-v2"></div>
          <div className="techie-grid-line-v techie-grid-line-v3"></div>
          
          {/* Asymmetrical accent lines */}
          <div className="techie-accent-line techie-accent-line-top"></div>
          <div className="techie-accent-line techie-accent-line-right"></div>
          <div className="techie-accent-line techie-accent-line-bottom"></div>

          <Canvas 
            shadows 
            camera={{ position: [5, 3.2, 9], fov: 40 }}
          >
            <EffectComposer>
              <N8AO 
                intensity={2}
                aoRadius={2}
                distanceFalloff={1}
              />
               
              <Bloom 
                intensity={0.5}
                luminanceThreshold={0.4}
                luminanceSmoothing={0.7}
                mipmapBlur={false}
                width={256}
                height={256}
              />
            </EffectComposer>
           
            
            {/* Dark background with slight color */}
            <color attach="background" args={['#050505']} />
            
            {/* Remove fog to improve performance and stability */}
            {/* <fog attach="fog" args={['#090a0f', 15, 35]} /> */}
            
            {/* Reduced ambient light for darker mood */}
            <ambientLight intensity={0.4} color="#132013" />
            
            {/* Main spotlight - green tint */}
            <spotLight 
              position={[0, 8, 0]} 
              angle={0.5} 
              penumbra={0.8} 
              intensity={8} 
              color="#00ff88" 
              castShadow 
              shadow-bias={-0.0001}
            />
            
            {/* Left green accent spotlight */}
            <spotLight 
              position={[-4, 4, 0]} 
              angle={0.4} 
              penumbra={0.7} 
              intensity={9} 
              color="#00ff88" 
              castShadow 
              shadow-bias={-0.0001}
            />
            
            {/* Right green accent spotlight */}
            <spotLight 
              position={[4, 4, 0]} 
              angle={0.4} 
              penumbra={0.7} 
              intensity={9} 
              color="#00ff88" 
              castShadow 
              shadow-bias={-0.0001}
            />
            
            {/* Reduced front fill light for dramatic shadows */}
            <directionalLight
              position={[0, 2, 8]}
              intensity={1.5}
              color="#ccffdd"
            />
            
            {/* Cyan rim light from behind for character silhouette */}
            <spotLight 
              position={[0, 1, -5]} 
              angle={0.6} 
              penumbra={0.5} 
              intensity={5} 
              color="#00cccc" 
              castShadow={false}
            />
            
            {/* Pink accent ring light from behind */}
            <spotLight 
              position={[0, 3, -7]} 
              angle={0.9} 
              penumbra={0.6} 
              intensity={6} 
              color="#ff1a75" 
              castShadow={false}
            />
            
            {/* Side accent lights */}
            <pointLight
              position={[-6, 3, 0]}
              intensity={5}
              color="#33ff99"
              distance={10}
            />
            
            <pointLight
              position={[6, 3, 0]}
              intensity={5}
              color="#33ff99"
              distance={10}
            />
            
            {/* Remove old environment and keep only the new room model */}
            <CameraAnimation />
            
            {/* Add the select room model */}
            <Suspense fallback={null}>
              <primitive 
                object={useGLTF('/models/environment/selectroom.glb', true).scene} 
                position={[0, 0, 0]}
                scale={[2, 2, 2]}
              />
            </Suspense>
            
            {/* Only render the character when not in transition */}
            {!isChangingCharacter && (
              <Character 
                key={`character-${selectedCharacterIndex}`}
                modelPath={currentCharacter.modelPath}
                animationsPath={currentCharacter.animationsPath}
                position={[0, 0, 0]}
                apiName="warriorAnimations"
                onAnimationsLoaded={setWarriorAnimationNames}
                onAnimationStarted={setCurrentWarriorAnimation}
                onAnimationStopped={() => setCurrentWarriorAnimation(null)}
                mixerRef={warriorMixerRef}
                glowIntensity={glowIntensity}
              />
            )}
          </Canvas>

          {/* Character Info Panel */}
          <CharacterInfoPanel 
            character={currentCharacter}
            onPrevious={handlePrevious}
            onNext={handleNext}
            onSelect={handleSelect}
            soundManagerRef={soundManagerRef}
            audioVolume={audioVolume}
            audioMuted={audioMuted}
          />

          {/* Animation Controls UI - we can keep this for development purposes */}
          <div style={{ position: 'absolute', top: '20px', right: '16px', maxHeight: '70vh', overflowY: 'auto' }}>
            <AnimationControls 
              names={warriorAnimationNames}
              currentAnimation={currentWarriorAnimation}
              onPlay={(name) => {
                // @ts-ignore - Using window for debugging
                window.warriorAnimations?.play(name);
              }}
              onStop={() => {
                if (currentWarriorAnimation) {
                  // @ts-ignore - Using window for debugging
                  window.warriorAnimations?.stop(currentWarriorAnimation);
                }
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

// Preload the models
useGLTF.preload('/models/player/1_1.glb');
useGLTF.preload('/models/player/1_2.glb');
useGLTF.preload('/models/player/2_1.glb');
useGLTF.preload('/models/player/2_2.glb');
useGLTF.preload('/models/environment/console.glb');
useGLTF.preload('/models/environment/wallguns.glb');

export default CharacterSelect; 