'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF, useAnimations } from '@react-three/drei';
import * as THREE from 'three';
import * as dat from 'lil-gui';

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
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      color: 'white',
      padding: '16px',
      borderRadius: '6px',
      maxHeight: '80vh',
      overflowY: 'auto',
      zIndex: 1000
    }}>
      <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', marginBottom: '12px' }}>Animations</h3>
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
        action.play().stop(); // Initialize the action
        
        // Store the configured action
        actionsRef.current[clip.name] = action;
      }
    });

    onAnimationsLoaded(animations.map(clip => clip.name));

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
  }, [scene, animations, mixer]); // Remove actions from dependencies

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

// Main component
const AnimationTest = () => {
  const [warriorAnimationNames, setWarriorAnimationNames] = useState<string[]>([]);
  const [monsterAnimationNames, setMonsterAnimationNames] = useState<string[]>([]);
  const [currentWarriorAnimation, setCurrentWarriorAnimation] = useState<string | null>(null);
  const [currentMonsterAnimation, setCurrentMonsterAnimation] = useState<string | null>(null);
  const warriorMixerRef = useRef<THREE.AnimationMixer | null>(null);
  const monsterMixerRef = useRef<THREE.AnimationMixer | null>(null);
  
  // Flag to enable using monster animations on warrior model
  const [useSharedAnimations, setUseSharedAnimations] = useState(false);

  // Initialize dat.gui
  useEffect(() => {
    const gui = new dat.GUI();
    const controls = {
      warriorSpeed: 1.0,
      monsterSpeed: 1.0,
      useSharedAnimations: useSharedAnimations
    };

    // Add speed controls
    gui.add(controls, 'warriorSpeed', 0, 2)
      .name('Warrior Speed')
      .onChange((value: number) => {
        if (warriorMixerRef.current) {
          warriorMixerRef.current.timeScale = value;
        }
      });

    gui.add(controls, 'monsterSpeed', 0, 2)
      .name('Monster Speed')
      .onChange((value: number) => {
        if (monsterMixerRef.current) {
          monsterMixerRef.current.timeScale = value;
        }
      });

    // Add toggle for shared animations
    gui.add(controls, 'useSharedAnimations')
      .name('Use Monster Animations on Warrior')
      .onChange((value: boolean) => {
        setUseSharedAnimations(value);
        // We need to stop all animations when switching mode
        if (currentWarriorAnimation) {
          // @ts-ignore
          window.warriorAnimations?.stop(currentWarriorAnimation);
          setCurrentWarriorAnimation(null);
        }
      });

    // Create Animation folders
    const warriorFolder = gui.addFolder('Warrior Animations');
    warriorFolder.open();

    const monsterFolder = gui.addFolder('Monster Animations');
    monsterFolder.open();

    // Add warrior animation toggles
    const warriorToggles: { [key: string]: boolean } = {};
    warriorAnimationNames.forEach(name => {
      warriorToggles[name] = false;
      warriorFolder.add(warriorToggles, name)
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

    // Add monster animation toggles
    const monsterToggles: { [key: string]: boolean } = {};
    monsterAnimationNames.forEach(name => {
      monsterToggles[name] = false;
      monsterFolder.add(monsterToggles, name)
        .onChange((value: boolean) => {
          if (value) {
            // @ts-ignore - Using window for debugging
            window.monsterAnimations?.play(name);
          } else {
            // @ts-ignore - Using window for debugging
            window.monsterAnimations?.stop(name);
          }
        });
    });

    return () => {
      gui.destroy();
    };
  }, [warriorAnimationNames, monsterAnimationNames]);

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      <Canvas shadows camera={{ position: [5, 5, 5], fov: 50 }}>
        <ambientLight intensity={0.5} />
        <directionalLight
          position={[10, 10, 10]}
          intensity={1}
          castShadow
        />

        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[50, 50]} />
          <meshStandardMaterial color="#303030" />
        </mesh>

        <gridHelper args={[50, 50]} />

        {/* Warrior Character - conditionally use monster animations */}
        <Character 
          modelPath="/models/player/1_1.glb"
          animationsPath={useSharedAnimations ? "/models/player/2_1.glb" : undefined}
          position={[-2, 0, 0]}
          apiName="warriorAnimations"
          onAnimationsLoaded={setWarriorAnimationNames}
          onAnimationStarted={setCurrentWarriorAnimation}
          onAnimationStopped={() => setCurrentWarriorAnimation(null)}
          mixerRef={warriorMixerRef}
        />

        {/* Monster Character */}
        <Character 
          modelPath="/models/player/2_1.glb"
          position={[2, 0, 0]}
          apiName="monsterAnimations"
          onAnimationsLoaded={setMonsterAnimationNames}
          onAnimationStarted={setCurrentMonsterAnimation}
          onAnimationStopped={() => setCurrentMonsterAnimation(null)}
          mixerRef={monsterMixerRef}
        />

        <OrbitControls 
          makeDefault 
          target={[0, 1, 0]}
          maxPolarAngle={Math.PI / 2}
          minDistance={2}
          maxDistance={20}
        />
      </Canvas>

      {/* Animation Controls UI for Warrior */}
      <div style={{ position: 'absolute', top: 0, left: '16px' }}>
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

      {/* Animation Controls UI for Monster */}
      <div style={{ position: 'absolute', top: 0, right: '16px' }}>
        <AnimationControls 
          names={monsterAnimationNames}
          currentAnimation={currentMonsterAnimation}
          onPlay={(name) => {
            // @ts-ignore - Using window for debugging
            window.monsterAnimations?.play(name);
          }}
          onStop={() => {
            if (currentMonsterAnimation) {
              // @ts-ignore - Using window for debugging
              window.monsterAnimations?.stop(currentMonsterAnimation);
            }
          }}
        />
      </div>
    </div>
  );
};

// Preload the models
useGLTF.preload('/models/player/1_1.glb');
useGLTF.preload('/models/player/2_1.glb');

export default AnimationTest; 