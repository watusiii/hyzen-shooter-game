'use client';

import React, { useEffect, useState, useRef, useMemo, Suspense } from 'react';
import { Canvas, useFrame, useLoader, extend, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF, useAnimations, MeshReflectorMaterial, Plane, shaderMaterial } from '@react-three/drei';
import * as THREE from 'three';
import * as dat from 'lil-gui';

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

// Custom shader material for fading edges of background
const BackgroundFadeMaterial = shaderMaterial(
  {
    map: null,
    fadeStart: 0.3,
    fadeEnd: 0.7,
  },
  // Vertex Shader
  `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  // Fragment Shader
  `
    uniform sampler2D map;
    uniform float fadeStart;
    uniform float fadeEnd;
    varying vec2 vUv;
    
    void main() {
      vec4 texColor = texture2D(map, vUv);
      
      // Calculate distance from center (0.5, 0.5)
      vec2 centeredUv = vUv - 0.5;
      float dist = length(centeredUv) * 1.414; // Scale to ensure corners reach 1.0
      
      // Calculate fade factor (complete transparency at edges)
      float alpha = texColor.a;
      if (dist > fadeStart) {
        alpha = alpha * (1.0 - smoothstep(fadeStart, fadeEnd, dist));
      }
      
      gl_FragColor = vec4(texColor.rgb, alpha);
    }
  `
);

// Extend Three.js with our custom material
extend({ BackgroundFadeMaterial });

// No need for explicit type declarations - we'll use a different approach
// to apply the material to avoid TypeScript errors

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
  mixerRef
}: {
  modelPath: string;
  animationsPath?: string; // Optional path to a model with animations to use
  position?: [number, number, number];
  apiName: string;
  onAnimationsLoaded: (names: string[]) => void;
  onAnimationStarted: (name: string) => void;
  onAnimationStopped: () => void;
  mixerRef: React.MutableRefObject<THREE.AnimationMixer | null>;
}) => {
  const actionsRef = useRef<{ [key: string]: THREE.AnimationAction }>({});
  const clockRef = useRef<THREE.Clock | null>(null);
  
  // Load the model without animations first
  const result = useGLTF(modelPath, true);
  const { scene } = result;
  
  // Load the animations from another model (if provided) or use the model's own animations
  const animationsResult = animationsPath ? useGLTF(animationsPath, true) : null;
  const animations = animationsPath && animationsResult ? animationsResult.animations : result.animations;
  
  // Set up animations
  const { actions, mixer } = useAnimations(animations, scene);

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
    <primitive 
      object={scene} 
      position={position}
      scale={[2, 2, 2]}
    />
  );
};

// Pedestal component for characters to stand on
const Pedestal = ({ position = [0, 0, 0], radius = 1, height = 0.1, color = "#555555" }) => {
  return (
    <mesh position={[position[0], position[1] - height/2, position[2]]} receiveShadow castShadow>
      <cylinderGeometry args={[radius, radius, height, 32]} />
      <meshStandardMaterial color={color} metalness={0.4} roughness={0.2} />
    </mesh>
  );
};

// Room environment component
const RoomEnvironment = () => {
  return (
    <group position={[0, 0, 2]}>
      {/* Back wall */}
      <mesh position={[0, 2, -8]} receiveShadow castShadow>
        <boxGeometry args={[18, 6, 0.3]} />
        <meshStandardMaterial color="#0e1a22" roughness={0.7} metalness={0.3} />
      </mesh>

      {/* Left wall */}
      <mesh position={[-9, 2, -4]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <boxGeometry args={[8, 6, 0.3]} />
        <meshStandardMaterial color="#0a1520" roughness={0.8} />
      </mesh>
      
      {/* Right wall */}
      <mesh position={[9, 2, -4]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <boxGeometry args={[8, 6, 0.3]} />
        <meshStandardMaterial color="#0a1520" roughness={0.8} />
      </mesh>
      
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, -4]} receiveShadow>
        <planeGeometry args={[18, 10]} />
        <meshStandardMaterial color="#171f26" metalness={0.5} roughness={0.65} />
      </mesh>
      
      {/* Ceiling */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 5, -4]} receiveShadow>
        <planeGeometry args={[18, 10]} />
        <meshStandardMaterial color="#0a1018" />
      </mesh>

      {/* Floor grid lines for cyberpunk feel */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.08, -4]}>
        <planeGeometry args={[18, 10]} />
        <meshBasicMaterial 
          color="#00ff66" 
          wireframe={true} 
          transparent={true} 
          opacity={0.15} 
        />
      </mesh>
      
      {/* Horizontal neon light strip on back wall */}
      <mesh position={[0, 3.5, -7.8]} castShadow>
        <boxGeometry args={[12, 0.1, 0.05]} />
        <meshBasicMaterial color="#00ff88" />
      </mesh>
      
      {/* Glowing panel on back wall */}
      <mesh position={[-5, 2, -7.8]}>
        <planeGeometry args={[3, 2]} />
        <meshBasicMaterial color="#002211" />
      </mesh>
      
      {/* Glowing panel on back wall */}
      <mesh position={[5, 2, -7.8]}>
        <planeGeometry args={[3, 2]} />
        <meshBasicMaterial color="#110022" />
      </mesh>
      
      {/* Additional decorative neon elements */}
      <mesh position={[-8, 1.5, -6]} rotation={[0, Math.PI/4, 0]}>
        <boxGeometry args={[0.05, 3, 0.05]} />
        <meshBasicMaterial color="#00ffcc" />
      </mesh>
      
      <mesh position={[8, 1.5, -6]} rotation={[0, -Math.PI/4, 0]}>
        <boxGeometry args={[0.05, 3, 0.05]} />
        <meshBasicMaterial color="#ff00cc" />
      </mesh>
      
      {/* Pedestals with glow effect */}
      <group position={[-2, 0, 0]}>
        <Pedestal position={[0, 0, 0]} radius={1.7} height={0.2} color="#334455" />
        {/* Glow ring under pedestal */}
        <mesh position={[0, -0.095, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.7, 1.9, 32]} />
          <meshBasicMaterial color="#00ff88" transparent={true} opacity={0.7} />
        </mesh>
      </group>
      
      <group position={[2, 0, 0]}>
        <Pedestal position={[0, 0, 0]} radius={1.7} height={0.2} color="#553344" />
        {/* Glow ring under pedestal */}
        <mesh position={[0, -0.095, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.7, 1.9, 32]} />
          <meshBasicMaterial color="#ff0088" transparent={true} opacity={0.7} />
        </mesh>
      </group>
    </group>
  );
};

// Create a proper skybox using cubemap textures
const Skybox = () => {
  const [cubeTexture, setCubeTexture] = useState<THREE.CubeTexture | null>(null);
  
  useEffect(() => {
    const loader = new THREE.CubeTextureLoader();
    loader.setPath('/skybox/');
    
    // Load all six faces of the cube
    loader.load(
      [
        'posx.jpg', 'negx.jpg',
        'posy.jpg', 'negy.jpg',
        'posz.jpg', 'negz.jpg'
      ],
      (texture) => {
        setCubeTexture(texture);
      }
    );
  }, []);
  
  return cubeTexture ? (
    <primitive attach="background" object={cubeTexture} />
  ) : null;
};

// Particle effect for atmosphere
const Particles = () => {
  const particlesRef = useRef<THREE.Points>(null);
  const count = 100;
  const positions = new Float32Array(count * 3);
  
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 20;
    positions[i * 3 + 1] = Math.random() * 8;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 10;
  }
  
  useFrame(({ clock }) => {
    if (particlesRef.current) {
      particlesRef.current.rotation.y = clock.getElapsedTime() * 0.02;
    }
  });
  
  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          array={positions}
          count={count}
          itemSize={3}
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial 
        size={0.05} 
        color="#ffffff" 
        transparent={true} 
        opacity={0.3}
        sizeAttenuation={true}
      />
    </points>
  );
};

// Create a simple data particle effect component
const DataParticles = () => {
  const particlesRef = useRef<THREE.Points>(null);
  const count = 50;
  const positions = useMemo(() => {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Position particles in a cylinder shape around the character
      const angle = Math.random() * Math.PI * 2;
      const radius = 1.5 + Math.random() * 0.8;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = Math.random() * 3;
      positions[i * 3 + 2] = Math.sin(angle) * radius;
    }
    return positions;
  }, []);

  useFrame(({ clock }) => {
    if (particlesRef.current) {
      // Slow rotation of particles around the character
      particlesRef.current.rotation.y = clock.getElapsedTime() * 0.1;
      
      // Individual particle movement
      const positions = particlesRef.current.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        // Simple oscillation on y-axis
        positions[i3 + 1] += Math.sin(clock.getElapsedTime() * 0.5 + i * 0.1) * 0.003;
        
        // Keep particles within bounds
        if (positions[i3 + 1] > 3.5) positions[i3 + 1] = 0.1;
        if (positions[i3 + 1] < 0.1) positions[i3 + 1] = 3.5;
      }
      particlesRef.current.geometry.attributes.position.needsUpdate = true;
    }
  });
  
  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          array={positions}
          count={count}
          itemSize={3}
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial 
        size={0.03} 
        color="#80ffff" 
        transparent={true} 
        opacity={0.8}
        sizeAttenuation={true}
      />
    </points>
  );
};

// Create a transition effect for character changes
const CharacterTransitionEffect = ({ active }: { active: boolean }) => {
  const particlesRef = useRef<THREE.Points>(null);
  const count = 300; // Number of particles
  const lifetimesRef = useRef<Float32Array>(new Float32Array(count)); // Store particle lifetimes
  const maxLifetimeRef = useRef<Float32Array>(new Float32Array(count)); // Store max lifetime for each particle
  
  // Generate initial particle positions
  const positions = useMemo(() => {
    const positions = new Float32Array(count * 3);
    
    // Initialize lifetimes with random values
    for (let i = 0; i < count; i++) {
      // Position particles in a cylindrical cloud around the character
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.8 + Math.random() * 1.2;
      const height = -0.5 + Math.random() * 3.5; // From feet to above head
      
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = height;
      positions[i * 3 + 2] = Math.sin(angle) * radius;
      
      // Initialize lifetimes
      maxLifetimeRef.current[i] = 2.0 + Math.random() * 2.0; // 2-4 seconds max lifetime
      lifetimesRef.current[i] = Math.random() * maxLifetimeRef.current[i]; // Start at random points in lifecycle
    }
    return positions;
  }, []);
  
  // Generate particle colors
  const colors = useMemo(() => {
    const colors = new Float32Array(count * 3);
    const colorOptions = [
      [0.0, 0.8, 1.0], // Cyan
      [0.0, 0.5, 1.0], // Blue
      [0.3, 0.7, 1.0], // Light blue
      [0.0, 1.0, 0.8], // Teal
      [0.5, 0.8, 1.0]  // Sky blue
    ];
    
    for (let i = 0; i < count; i++) {
      const colorChoice = colorOptions[Math.floor(Math.random() * colorOptions.length)];
      colors[i * 3] = colorChoice[0] + (Math.random() * 0.2 - 0.1);
      colors[i * 3 + 1] = colorChoice[1] + (Math.random() * 0.2 - 0.1);
      colors[i * 3 + 2] = colorChoice[2] + (Math.random() * 0.2 - 0.1);
    }
    return colors;
  }, []);
  
  // Particle sizes
  const sizes = useMemo(() => {
    const sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      sizes[i] = 0.1 + Math.random() * 0.2;
    }
    return sizes;
  }, []);
  
  // Create opacity attribute for fading
  const opacities = useMemo(() => {
    const opacities = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      opacities[i] = 0.6 + Math.random() * 0.4; // Start with random opacity between 0.6-1.0
    }
    return opacities;
  }, []);

  // Update particle positions every frame
  useFrame(({ clock }) => {
    if (!particlesRef.current) return;
    
    const deltaTime = clock.getDelta(); // Time since last frame
    const positions = particlesRef.current.geometry.attributes.position.array as Float32Array;
    const opacityAttribute = particlesRef.current.geometry.attributes.opacity;
    const opacities = opacityAttribute.array as Float32Array;
    
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      
      // Update lifetime
      lifetimesRef.current[i] += deltaTime;
      
      // Normalized lifetime (0-1)
      const normalizedLife = lifetimesRef.current[i] / maxLifetimeRef.current[i];
      
      // Apply fade out during the last 30% of lifetime
      if (normalizedLife > 0.7) {
        opacities[i] = 1.0 - ((normalizedLife - 0.7) / 0.3);
      } else {
        opacities[i] = 1.0; // Full opacity during 70% of lifetime
      }
      
      // Speed up particle near end of life for a nice trailing effect
      const speedMultiplier = 1.0 + normalizedLife * 0.5;
      
      // Gentle upward floating movement
      positions[i3 + 1] += (0.01 + Math.random() * 0.01) * speedMultiplier;
      
      // Add slight horizontal drift
      positions[i3] += (Math.random() - 0.5) * 0.005 * speedMultiplier;
      positions[i3 + 2] += (Math.random() - 0.5) * 0.005 * speedMultiplier;
      
      // Reset particles that complete their lifetime
      if (normalizedLife >= 1.0) {
        // Reset position
        const angle = Math.random() * Math.PI * 2;
        const radius = 0.8 + Math.random() * 1.2;
        positions[i3] = Math.cos(angle) * radius;
        positions[i3 + 1] = -0.5 + Math.random() * 1.0; // Start near the bottom
        positions[i3 + 2] = Math.sin(angle) * radius;
        
        // Reset lifetime
        lifetimesRef.current[i] = 0;
        maxLifetimeRef.current[i] = 2.0 + Math.random() * 2.0;
        opacities[i] = 1.0;
      }
    }
    
    // Update the geometry
    particlesRef.current.geometry.attributes.position.needsUpdate = true;
    opacityAttribute.needsUpdate = true;
  });
  
  return (
    <group>
      {/* Particles */}
      <points ref={particlesRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            array={positions}
            count={count}
            itemSize={3}
            args={[positions, 3]}
          />
          <bufferAttribute
            attach="attributes-color"
            array={colors}
            count={count}
            itemSize={3}
            args={[colors, 3]}
          />
          <bufferAttribute
            attach="attributes-size"
            array={sizes}
            count={count}
            itemSize={1}
            args={[sizes, 1]}
          />
          <bufferAttribute
            attach="attributes-opacity"
            array={opacities}
            count={count}
            itemSize={1}
            args={[opacities, 1]}
          />
        </bufferGeometry>
        <pointsMaterial 
          size={0.2} 
          vertexColors
          transparent={true}
          opacity={1.0}
          sizeAttenuation={true}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>
      
      {/* Central glow */}
      <sprite position={[0, 1.5, 0]} scale={[3, 4, 1]}>
        <spriteMaterial 
          attach="material"
          color="#80f0ff"
          transparent={true}
          opacity={0.3}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </sprite>
    </group>
  );
};

// Background and environment components
const Environment = () => {
  // Use existing skybox images for the background wall
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [techWallTexture, setTechWallTexture] = useState<THREE.Texture | null>(null);
  const textureLoadedRef = useRef(false);
  const techWallLoadedRef = useRef(false);
  
  useEffect(() => {
    // Only load the textures once
    if (!textureLoadedRef.current) {
      textureLoadedRef.current = true;
      const loader = new THREE.TextureLoader();
      
      // Load the background image
      loader.load('/skybox/techbg.png', (loadedTexture) => {
        setTexture(loadedTexture);
      });
      
      // Load the tech wall texture with correct path
      loader.load('/texture/tech_wall.png', (loadedTexture) => {
        loadedTexture.wrapS = THREE.RepeatWrapping;
        loadedTexture.wrapT = THREE.RepeatWrapping;
        loadedTexture.repeat.set(3, 2);
        setTechWallTexture(loadedTexture);
      });
    }
  }, []);
  
  return (
    <group>
      {/* Distant background wall using existing skybox image */}
      {texture && (
        <mesh position={[0, 5, -22]}>
          <planeGeometry args={[60, 30]} />
          <meshBasicMaterial 
            map={texture} 
            transparent={true} 
            opacity={1.0}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
      
      {/* Tech wall to the left of the left character */}
      {techWallTexture && (
        <mesh position={[-6, 2, 0]} rotation={[0, Math.PI / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[10, 8, 0.5]} />
          <meshStandardMaterial 
            map={techWallTexture} 
            roughness={0.6} 
            metalness={0.5}
            emissiveMap={techWallTexture}
            emissive="#223344"
            emissiveIntensity={0.2}
          />
        </mesh>
      )}
      
      {/* 3D environment elements to create depth */}
      <group position={[0, 0, -10]}>
        {/* Large central structure */}
        <mesh position={[0, 3, 0]} castShadow receiveShadow>
          <boxGeometry args={[4, 6, 1]} />
          <meshStandardMaterial color="#151520" metalness={0.7} roughness={0.4} />
        </mesh>
        
        {/* Left side structures */}
        <mesh position={[-10, 2, -2]} rotation={[0, 0.3, 0]} castShadow receiveShadow>
          <boxGeometry args={[3, 4, 2]} />
          <meshStandardMaterial color="#101525" metalness={0.6} roughness={0.5} />
        </mesh>
        
        <mesh position={[-8, 0.5, -1]} rotation={[0, -0.2, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.5, 0.5, 1, 8]} />
          <meshStandardMaterial color="#152030" metalness={0.8} roughness={0.3} />
        </mesh>
        
        {/* Right side structures */}
        <mesh position={[10, 2, -2]} rotation={[0, -0.3, 0]} castShadow receiveShadow>
          <boxGeometry args={[3, 4, 2]} />
          <meshStandardMaterial color="#251015" metalness={0.6} roughness={0.5} />
        </mesh>
        
        <mesh position={[8, 0.5, -1]} rotation={[0, 0.2, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.5, 0.5, 1, 8]} />
          <meshStandardMaterial color="#301520" metalness={0.8} roughness={0.3} />
        </mesh>
        
        {/* Floor platform elements */}
        <mesh position={[0, -0.1, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[25, 15]} />
          <meshStandardMaterial color="#0a0a10" metalness={0.5} roughness={0.8} />
        </mesh>
        
        {/* Vertical light panels */}
        <mesh position={[-12, 2, -4]} rotation={[0, 0.3, 0]}>
          <planeGeometry args={[1, 4]} />
          <meshStandardMaterial color="#1a3060" emissive="#0a2050" emissiveIntensity={0.5} />
        </mesh>
        
        <mesh position={[12, 2, -4]} rotation={[0, -0.3, 0]}>
          <planeGeometry args={[1, 4]} />
          <meshStandardMaterial color="#601a30" emissive="#500a20" emissiveIntensity={0.5} />
        </mesh>
        
        {/* Ceiling panel with lights */}
        <mesh position={[0, 8, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[15, 10]} />
          <meshBasicMaterial color="#080810" />
        </mesh>
       
      </group>
      
      {/* Ambient particles floating in the scene */}
      <Particles />
    </group>
  );
};

// Create a simplified environment with reflective floor
const FightingGameEnvironment = () => {
  const [techWallTexture, setTechWallTexture] = useState<THREE.Texture | null>(null);
  const [techFloorTexture, setTechFloorTexture] = useState<THREE.Texture | null>(null);
  
  useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.load('/texture/tech_wall.png', (loadedTexture) => {
      loadedTexture.wrapS = THREE.RepeatWrapping;
      loadedTexture.wrapT = THREE.RepeatWrapping;
      loadedTexture.repeat.set(3, 2);
      setTechWallTexture(loadedTexture);
    });
    
    // Load tech floor texture with proper configuration
    loader.load('/texture/tech_floor.png', (loadedTexture) => {
      loadedTexture.wrapS = THREE.RepeatWrapping;
      loadedTexture.wrapT = THREE.RepeatWrapping;
      loadedTexture.repeat.set(6, 4); // Adjusted tiling for better visibility
      setTechFloorTexture(loadedTexture);
      console.log("Tech floor texture loaded!"); // Debug loading
    });
  }, []);

  // Animation for the character frame
  const frameRef = useRef<THREE.Group>(null);
  
  // References for the star layers
  const farStarsRef = useRef<THREE.Group>(null);
  const midStarsRef = useRef<THREE.Group>(null);
  const closeStarsRef = useRef<THREE.Group>(null);
  
  // Memoize star positions to avoid regenerating on every render
  const farStars = useMemo(() => 
    Array.from({length: 40}).map((_, i) => {
      const x = (Math.random() - 0.5) * 8;
      const y = (Math.random() - 0.5) * 4;
      const z = -3 - Math.random() * 5; // More depth variation
      const size = 0.01 + Math.random() * 0.04;
      const color = Math.random() > 0.8 ? "#6688ff" : "#ffffff";
      return { key: `far-star-${i}`, position: [x, y, z] as [number, number, number], size, color };
    }), 
  []);
  
  const midStars = useMemo(() => 
    Array.from({length: 30}).map((_, i) => {
      const x = (Math.random() - 0.5) * 7;
      const y = (Math.random() - 0.5) * 3.5;
      const z = -1.5 - Math.random() * 2; // More depth variation
      const size = 0.02 + Math.random() * 0.05;
      const color = Math.random() > 0.7 ? "#88ccff" : "#ffffff";
      return { key: `mid-star-${i}`, position: [x, y, z] as [number, number, number], size, color };
    }), 
  []);
  
  const closeStars = useMemo(() => 
    Array.from({length: 20}).map((_, i) => {
      const x = (Math.random() - 0.5) * 6;
      const y = (Math.random() - 0.5) * 3;
      const z = -0.8 - Math.random() * 1; // More depth variation
      const size = 0.03 + Math.random() * 0.06;
      const color = Math.random() > 0.6 ? "#aaddff" : "#ffffff";
      return { key: `close-star-${i}`, position: [x, y, z] as [number, number, number], size, color };
    }), 
  []);
  
  useFrame(({ clock }) => {
    // Animate pillars glow
    if (frameRef.current) {
      // Pulse glow effect on the pillars
      frameRef.current.children.forEach((child, index) => {
        if (index < 5 && child instanceof THREE.Group) {
          // Find the glowing element (the blue light) which is the second child in each pillar group
          const glowingLight = child.children[1];
          if (glowingLight instanceof THREE.Mesh && glowingLight.material instanceof THREE.MeshStandardMaterial) {
            const glow = 1.5 + Math.sin(clock.getElapsedTime() * 1.5 + index * 0.5) * 0.5;
            glowingLight.material.emissiveIntensity = glow;
          }
        }
      });
    }
    
    // Animate star layers for parallax effect
    const time = clock.getElapsedTime();
    
    // Far stars - slowest movement
    if (farStarsRef.current) {
      farStarsRef.current.position.x = Math.sin(time * 0.05) * 0.2;
      farStarsRef.current.position.y = Math.cos(time * 0.03) * 0.1;
    }
    
    // Mid stars - medium movement
    if (midStarsRef.current) {
      midStarsRef.current.position.x = Math.sin(time * 0.1) * 0.3;
      midStarsRef.current.position.y = Math.cos(time * 0.07) * 0.15;
    }
    
    // Close stars - fastest movement
    if (closeStarsRef.current) {
      closeStarsRef.current.position.x = Math.sin(time * 0.15) * 0.4;
      closeStarsRef.current.position.y = Math.cos(time * 0.1) * 0.2;
    }
  });

  return (
    <group>
      {/* Primary textured floor - with minimal reflection */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <planeGeometry args={[30, 20]} />
        <meshStandardMaterial 
          map={techFloorTexture}
          metalness={0.7}
          roughness={0.3}
          color="#aabbff" // Bright blue tint to enhance tech pattern
        />
      </mesh>
      
      {/* Reflective overlay - transparent to show texture below */}
      <Plane 
        rotation={[-Math.PI / 2, 0, 0]} 
        position={[0, -0.04, 0]} 
        args={[30, 20]}
      >
        <MeshReflectorMaterial
          blur={[300, 100]}
          resolution={1024}
          mixBlur={0.5}
          mixStrength={0.3}
          roughness={0.5}
          depthScale={1}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.4}
          color="white"
          metalness={0.7}
          mirror={0.5}
          transparent={true}
          opacity={0.6}
        />
      </Plane>
      
      {/* Grid overlay on floor - cyberpunk aesthetic */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]}>
        <planeGeometry args={[30, 20]} />
        <meshBasicMaterial 
          color="#00ffff" 
          wireframe={true} 
          transparent={true} 
          opacity={0.15} 
        />
      </mesh>
      
      {/* Double layer of floor texture to ensure visibility */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.053, 0]}>
        <planeGeometry args={[30, 20]} />
        <meshStandardMaterial 
          map={techFloorTexture}
          transparent={true}
          color="#88aaff" // Adding a blue tint to enhance tech look
          emissive="#003366" // Adding slight glow to the texture
          emissiveIntensity={0.2}
          opacity={0.9}
        />
      </mesh>
      
      {/* Grid overlay on floor - more visible but subtle */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]}>
        <planeGeometry args={[30, 20]} />
        <meshBasicMaterial 
          color="#888888" 
          wireframe={true} 
          transparent={true} 
          opacity={0.2} 
        />
      </mesh>
      
      {/* Console model closer to the back wall */}
      <group position={[-6, 0, -4]} rotation={[0, Math.PI / 4, 0]} scale={[2, 2, 2]}>
        <Suspense fallback={null}>
          <primitive 
            object={useGLTF('/models/environment/console.glb').scene} 
            castShadow
            receiveShadow
          />
        </Suspense>
      </group>
      
      {/* Wall guns on the left wall */}
      <group position={[-7.7, 0.5, 3]} rotation={[0, Math.PI / 2, 0]} scale={[2, 2, 2]}>
        <Suspense fallback={null}>
          <primitive 
            object={useGLTF('/models/environment/wallguns.glb').scene} 
            castShadow
            receiveShadow
          />
        </Suspense>
      </group>
      
      {/* Single podium for character */}
      <group position={[0, 0, 0]}>
        {/* Main podium */}
        <mesh position={[0, -0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[2, 32]} />
          <meshStandardMaterial color="#334455" metalness={0.7} roughness={0.3} />
        </mesh>
        
        {/* Glow ring under podium */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.09, 0]}>
          <ringGeometry args={[2, 2.2, 32]} />
          <meshBasicMaterial color="#00ff88" transparent={true} opacity={0.7} />
        </mesh>
        
        {/* Tech circle graphics on floor */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.08, 0]}>
          <ringGeometry args={[2.5, 2.52, 64]} />
          <meshBasicMaterial color="#00ffff" transparent={true} opacity={0.6} />
        </mesh>
        
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.07, 0]}>
          <ringGeometry args={[2.7, 2.72, 64]} />
          <meshBasicMaterial color="#0088ff" transparent={true} opacity={0.4} />
        </mesh>
        
        {/* Tech pattern on floor */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.06, 0]}>
          <planeGeometry args={[5, 5]} />
          <meshBasicMaterial 
            color="#ffffff" 
            transparent={true} 
            opacity={0.15}
            wireframe={true}
          />
        </mesh>
      </group>
      
      {/* Character selection tech frame */}
      <group ref={frameRef} position={[0, 0, 0]}>
        {/* Vertical pillars - 5 pillars distributed in a semi-circle behind the character */}
        {[...Array(5)].map((_, i) => {
          // Same angle calculation but rotated 180 degrees by adding Math.PI
          const angle = (i / 4) * Math.PI - Math.PI/2 + Math.PI;
          const x = Math.sin(angle) * 2.5;
          const z = Math.cos(angle) * 2.5;
          return (
            <group key={`pillar-${i}`} position={[x, 0, z]}>
              {/* Main pillar body - silvery material */}
              <mesh position={[0, 1.8, 0]}>
                <cylinderGeometry args={[0.06, 0.08, 3.6, 8]} />
                <meshStandardMaterial 
                  color="#c0c5d0" 
                  metalness={0.9} 
                  roughness={0.2}
                />
              </mesh>
              
              {/* Blue light on top - flat disc instead of sphere */}
              <mesh position={[0, 3.7, 0]} rotation={[Math.PI/2, 0, 0]}>
                <cylinderGeometry args={[0.1, 0.1, 0.05, 16]} />
                <meshStandardMaterial 
                  color="#0088ff" 
                  emissive="#00aaff" 
                  emissiveIntensity={2.0} 
                  metalness={0.5} 
                  roughness={0.2}
                />
              </mesh>
              
              {/* Silver cap on top */}
              <mesh position={[0, 3.5, 0]}>
                <cylinderGeometry args={[0.09, 0.06, 0.12, 8]} />
                <meshStandardMaterial 
                  color="#e0e5f0" 
                  metalness={0.9} 
                  roughness={0.1}
                />
              </mesh>
              
              {/* Silver base */}
              <mesh position={[0, 0, 0]}>
                <cylinderGeometry args={[0.12, 0.08, 0.14, 8]} />
                <meshStandardMaterial 
                  color="#e0e5f0" 
                  metalness={0.9} 
                  roughness={0.1}
                />
              </mesh>
            </group>
          );
        })}
        
        {/* Energy beams connecting pillars */}
        {[...Array(5)].map((_, i) => {
          // Same angle calculation but rotated 180 degrees by adding Math.PI
          const startAngle = (i / 4) * Math.PI - Math.PI/2 + Math.PI;
          const endAngle = ((i + 1) / 4) * Math.PI - Math.PI/2 + Math.PI;
          
          // Skip the last connection if we're at the end of the array
          if (i === 4) return null;
          
          const startX = Math.sin(startAngle) * 2.5;
          const startZ = Math.cos(startAngle) * 2.5;
          
          const endX = Math.sin(endAngle) * 2.5;
          const endZ = Math.cos(endAngle) * 2.5;
          
          // Calculate center point and rotation for the beam
          const centerX = (startX + endX) / 2;
          const centerZ = (startZ + endZ) / 2;
          const rotation = Math.atan2(endZ - startZ, endX - startX) + Math.PI/2;
          
          // Calculate length of the beam
          const length = Math.sqrt(
            Math.pow(endX - startX, 2) + 
            Math.pow(endZ - startZ, 2)
          );
          
          // Create beams at bottom height only
          return (
            <mesh 
              key={`beam-${i}`} 
              position={[centerX, 0.5, centerZ]}
              rotation={[0, rotation, 0]}
            >
              <boxGeometry args={[0.02, 0.02, length]} />
              <meshBasicMaterial 
                color="#00eeff" 
                transparent={true}
                opacity={0.7}
              />
            </mesh>
          );
        })}
        
        {/* Holographic vertical walls - very subtle */}
        <mesh position={[0, 1.8, 0]}>
          <cylinderGeometry args={[2.5, 2.5, 3.0, 32, 1, true]} />
          <meshBasicMaterial 
            color="#00aaff" 
            transparent={true} 
            opacity={0.05} 
            side={THREE.DoubleSide} 
            depthWrite={false}
          />
        </mesh>
        
        {/* Data particles floating around character */}
        <DataParticles />
      </group>

      {/* Tech walls */}
      {techWallTexture && (
        <>
          {/* Left wall */}
          <mesh position={[-8, 4, 0]} rotation={[0, Math.PI / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[16, 8, 0.5]} />
            <meshStandardMaterial 
              map={techWallTexture} 
              roughness={0.6} 
              metalness={0.5}
              emissiveMap={techWallTexture}
              emissive="#223344"
              emissiveIntensity={0.2}
            />
          </mesh>

          {/* Right wall */}
          <mesh position={[8, 4, 0]} rotation={[0, -Math.PI / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[16, 8, 0.5]} />
            <meshStandardMaterial 
              map={techWallTexture} 
              roughness={0.6} 
              metalness={0.5}
              emissiveMap={techWallTexture}
              emissive="#223344"
              emissiveIntensity={0.2}
            />
          </mesh>

          {/* Back wall made of 4 cubes arranged to create a window */}
          <group position={[0, 4, -8]}>
            {/* Top section */}
            <mesh position={[0, 2.75, 0]} castShadow receiveShadow>
              <boxGeometry args={[16, 2.5, 0.5]} />
              <meshStandardMaterial 
                map={techWallTexture} 
                roughness={0.6} 
                metalness={0.5}
                emissiveMap={techWallTexture}
                emissive="#223344"
                emissiveIntensity={0.2}
              />
            </mesh>
            
            {/* Bottom section */}
            <mesh position={[0, -2.75, 0]} castShadow receiveShadow>
              <boxGeometry args={[16, 2.5, 0.5]} />
              <meshStandardMaterial 
                map={techWallTexture} 
                roughness={0.6} 
                metalness={0.5}
                emissiveMap={techWallTexture}
                emissive="#223344"
                emissiveIntensity={0.2}
              />
            </mesh>
            
            {/* Left section */}
            <mesh position={[-6, 0, 0]} castShadow receiveShadow>
              <boxGeometry args={[4, 3, 0.5]} />
              <meshStandardMaterial 
                map={techWallTexture} 
                roughness={0.6} 
                metalness={0.5}
                emissiveMap={techWallTexture}
                emissive="#223344"
                emissiveIntensity={0.2}
              />
            </mesh>
            
            {/* Right section */}
            <mesh position={[6, 0, 0]} castShadow receiveShadow>
              <boxGeometry args={[4, 3, 0.5]} />
              <meshStandardMaterial 
                map={techWallTexture} 
                roughness={0.6} 
                metalness={0.5}
                emissiveMap={techWallTexture}
                emissive="#223344"
                emissiveIntensity={0.2}
              />
            </mesh>
            
            {/* Space visible through window */}
            <mesh position={[0, 0, -0.5]}>
              <planeGeometry args={[5.5, 2.9]} />
              <meshBasicMaterial color="#000711" side={THREE.DoubleSide} transparent={true} opacity={0.3} />
            </mesh>
            
            {/* Stars at different depths for parallax effect */}
            <group>
              {/* Far stars layer - slowest movement */}
              <group position={[0, 0, 0]} ref={farStarsRef}>
                {farStars.map(star => (
                  <mesh key={star.key} position={star.position}>
                    <planeGeometry args={[star.size, star.size]} />
                    <meshBasicMaterial color={star.color} />
                  </mesh>
                ))}
              </group>
              
              {/* Mid stars layer - medium movement */}
              <group position={[0, 0, 0]} ref={midStarsRef}>
                {midStars.map(star => (
                  <mesh key={star.key} position={star.position}>
                    <planeGeometry args={[star.size, star.size]} />
                    <meshBasicMaterial color={star.color} />
                  </mesh>
                ))}
              </group>
              
              {/* Close stars layer - fastest movement */}
              <group position={[0, 0, 0]} ref={closeStarsRef}>
                {closeStars.map(star => (
                  <mesh key={star.key} position={star.position}>
                    <planeGeometry args={[star.size, star.size]} />
                    <meshBasicMaterial color={star.color} />
                  </mesh>
                ))}
              </group>
            </group>
          </group>
        </>
      )}
    </group>
  );
};

// Add character data type definition
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

// Character information UI component
const CharacterInfoPanel = ({
  character,
  onPrevious,
  onNext,
  onSelect
}: {
  character: CharacterData;
  onPrevious: () => void;
  onNext: () => void;
  onSelect: () => void;
}) => {
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
          style={{
            background: 'rgba(0, 20, 10, 0.7)',
            border: 'none',
            color: 'white',
            cursor: 'pointer',
            width: '70px',
            height: '70px',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '28px',
            clipPath: 'polygon(30% 0%, 100% 0%, 100% 70%, 70% 100%, 0% 100%, 0% 30%)'
          }}
        >
          {/* Border overlay */}
          <div style={{
            position: 'absolute',
            top: '2px',
            left: '2px',
            right: '2px',
            bottom: '2px',
            border: '1px solid #00aa66',
            clipPath: 'polygon(30% 0%, 100% 0%, 100% 70%, 70% 100%, 0% 100%, 0% 30%)',
            zIndex: 1
          }} />
          
          {/* Glow effect */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            boxShadow: 'inset 0 0 10px rgba(0, 170, 85, 0.5)',
            zIndex: 2
          }} />
          
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
            backgroundImage: 'url(/texture/circuit.png)',
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
          style={{
            background: 'rgba(0, 20, 10, 0.7)',
            border: 'none',
            color: 'white',
            cursor: 'pointer',
            width: '70px',
            height: '70px',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '28px',
            clipPath: 'polygon(0% 0%, 70% 0%, 100% 30%, 100% 100%, 30% 100%, 0% 70%)'
          }}
        >
          {/* Border overlay */}
          <div style={{
            position: 'absolute',
            top: '2px',
            left: '2px',
            right: '2px',
            bottom: '2px',
            border: '1px solid #00aa66',
            clipPath: 'polygon(0% 0%, 70% 0%, 100% 30%, 100% 100%, 30% 100%, 0% 70%)',
            zIndex: 1
          }} />
          
          {/* Glow effect */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            boxShadow: 'inset 0 0 10px rgba(0, 170, 85, 0.5)',
            zIndex: 2
          }} />
          
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
  }
];

// Main Character Selection component
const CharacterSelect = () => {
  const [warriorAnimationNames, setWarriorAnimationNames] = useState<string[]>([]);
  const [currentWarriorAnimation, setCurrentWarriorAnimation] = useState<string | null>(null);
  const warriorMixerRef = useRef<THREE.AnimationMixer | null>(null);
  
  // Character selection state
  const [selectedCharacterIndex, setSelectedCharacterIndex] = useState(0);
  const currentCharacter = sampleCharacters[selectedCharacterIndex];
  
  // Flag to enable using monster animations on warrior model
  const [useSharedAnimations, setUseSharedAnimations] = useState(true);
  
  // Add state to track if character is changing to handle model transitions
  const [isChangingCharacter, setIsChangingCharacter] = useState(false);

  // Navigation handlers
  const handlePrevious = () => {
    setIsChangingCharacter(true);
    
    // Change character immediately
    setSelectedCharacterIndex((prev) => 
      prev === 0 ? sampleCharacters.length - 1 : prev - 1
    );
    
    // Reset animation state after brief delay
    setTimeout(() => {
      setIsChangingCharacter(false);
    }, 100);
  };
  
  const handleNext = () => {
    setIsChangingCharacter(true);
    
    // Change character immediately
    setSelectedCharacterIndex((prev) => 
      (prev + 1) % sampleCharacters.length
    );
    
    // Reset animation state after brief delay
    setTimeout(() => {
      setIsChangingCharacter(false);
    }, 100);
  };
  
  const handleSelect = () => {
    // Would typically navigate to the next screen or start the game
    alert(`Selected character: ${currentCharacter.name}`);
  };

  // Add the custom CSS styles to the document
  useEffect(() => {
    // Add the CSS styles to the document
    const styleElement = document.createElement('style');
    styleElement.textContent = additionalStyles + `
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
        /* Remove the border from here since it gets clipped */
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
      title: 'Animation Controls'
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
    showButton.innerHTML = '▶';
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
    showButton.style.display = 'none';
    document.body.appendChild(showButton);

    showButton.addEventListener('click', toggleGui);
    
    const controls = {
      warriorSpeed: 1.0,
      hideControls: toggleGui
    };

    // Add hide button to the controls
    gui.add(controls, 'hideControls').name('Hide Controls');

    // Add speed control
    gui.add(controls, 'warriorSpeed', 0, 2)
      .name('Animation Speed')
      .onChange((value: number) => {
        if (warriorMixerRef.current) {
          warriorMixerRef.current.timeScale = value;
        }
      });
    
    // Create Animation folder
    const animationsFolder = gui.addFolder('Animations');

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
  }, [warriorAnimationNames]);

  // Fix the particle system to not use vertexOpacity
  useEffect(() => {
    // Wait for the component to mount
    setTimeout(() => {
      // Find the particle system points material - using querySelector instead of direct access
      const points = document.querySelector('points');
      if (points) {
        // Access the material directly instead of using __r3f
        const material = points.querySelector('pointsMaterial');
        if (material) {
          // Set attributes directly on the material element
          material.removeAttribute('vertexOpacity');
        }
      }
    }, 100);
  }, []);

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
          border: 'none' // Remove border from the clipped container
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
            camera={{ position: [0, 2.2, 8], fov: 40 }}
          >
            {/* Dark background with slight color */}
            <color attach="background" args={['#050505']} />
            
            {/* Scene fog for depth - increased density for moodier atmosphere */}
            <fog attach="fog" args={['#090a0f', 15, 35]} />
            
            {/* Reduced ambient light for darker mood */}
            <ambientLight intensity={0.4} color="#132013" />
            
            {/* Main spotlight - green tint */}
            <spotLight 
              position={[0, 8, 0]} 
              angle={0.5} 
              penumbra={0.8} 
              intensity={6} 
              color="#00ff88" 
              castShadow 
              shadow-bias={-0.0001}
            />
            
            {/* Left green accent spotlight */}
            <spotLight 
              position={[-4, 4, 0]} 
              angle={0.4} 
              penumbra={0.7} 
              intensity={7} 
              color="#00ff88" 
              castShadow 
              shadow-bias={-0.0001}
            />
            
            {/* Right green accent spotlight */}
            <spotLight 
              position={[4, 4, 0]} 
              angle={0.4} 
              penumbra={0.7} 
              intensity={7} 
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
            
            {/* Reflective floor and environment */}
            <FightingGameEnvironment />

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
              />
            )}

            <OrbitControls 
              makeDefault 
              target={[0, 1, 0]}
              maxPolarAngle={Math.PI / 2}
              minDistance={4}
              maxDistance={12}
              enableDamping
              dampingFactor={0.05}
            />
          </Canvas>

          {/* Character Info Panel */}
          <CharacterInfoPanel 
            character={currentCharacter}
            onPrevious={handlePrevious}
            onNext={handleNext}
            onSelect={handleSelect}
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
useGLTF.preload('/models/player/2_1.glb');
useGLTF.preload('/models/environment/console.glb');
useGLTF.preload('/models/environment/wallguns.glb');

export default CharacterSelect; 