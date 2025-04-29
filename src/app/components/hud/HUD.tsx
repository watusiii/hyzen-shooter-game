'use client';

import React, { useState, useEffect } from 'react';

interface HUDProps {
  // We'll add properties here as needed in the future
}

export const HUD: React.FC<HUDProps> = () => {
  const [fuel, setFuel] = useState(100);
  const [health, setHealth] = useState(100);
  const [ammo, setAmmo] = useState(30);
  const [score, setScore] = useState(0);

  // Poll for fuel level from the game environment
  useEffect(() => {
    const updateFuelFromGame = () => {
      try {
        // @ts-ignore - Access the global window object to get physics body data
        if (window.physicsBodyRef && typeof window.physicsBodyRef.getFuelPercentage === 'function') {
          // @ts-ignore
          const fuelPercentage = window.physicsBodyRef.getFuelPercentage();
          setFuel(fuelPercentage);
        }
      } catch (error) {
        console.error('Error accessing fuel data:', error);
      }
    };

    // Check fuel level every 100ms
    const interval = setInterval(updateFuelFromGame, 100);
    return () => clearInterval(interval);
  }, []);

  // Create a simple fuel bar
  const renderFuelGauge = () => {
    return (
      <div style={{
        width: '180px',
        height: '30px',
        backgroundColor: '#222',
        borderRadius: '4px',
        border: '1px solid rgb(255, 165, 0)',
        overflow: 'hidden',
        position: 'relative'
      }}>
        <div style={{
          width: `${fuel}%`,
          height: '100%',
          backgroundColor: '#ff7c00',
          transition: 'width 0.3s ease'
        }} />
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <span style={{ color: 'white', fontWeight: 'bold', textShadow: '0 0 3px black' }}>
            FUEL: {Math.round(fuel)}%
          </span>
        </div>
      </div>
    );
  };

  // Create a health bar
  const renderHealthBar = () => {
    return (
      <div style={{
        width: '180px',
        height: '30px',
        backgroundColor: '#222',
        borderRadius: '4px',
        border: '1px solid rgb(255, 165, 0)',
        overflow: 'hidden',
        position: 'relative'
      }}>
        <div style={{
          width: `${health}%`,
          height: '100%',
          backgroundColor: health > 60 ? '#00cc44' : health > 30 ? '#ffcc00' : '#ff0000',
          transition: 'width 0.3s ease, background-color 0.3s ease'
        }} />
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <span style={{ color: 'white', fontWeight: 'bold', textShadow: '0 0 3px black' }}>
            HEALTH: {health}
          </span>
        </div>
      </div>
    );
  };

  // Create ammo display
  const renderAmmo = () => {
    return (
      <div style={{ 
        width: '70px', 
        height: '70px', 
        borderRadius: '50%', 
        backgroundColor: '#222', 
        border: '2px solid rgb(255, 165, 0)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: 'inset 0 0 15px rgba(255, 165, 0, 0.3)'
      }}>
        <span style={{ color: 'white', fontWeight: 'bold', fontSize: '20px' }}>{ammo}</span>
        <span style={{ color: 'white', fontSize: '12px' }}>AMMO</span>
      </div>
    );
  };

  return (
    <div 
      style={{ 
        position: 'absolute',
        bottom: 0,
        left: 0,
        width: '100%',
        height: '90px',
        backgroundColor: 'rgba(0, 0, 0, 0.7)', 
        borderTop: '2px solid rgb(255, 165, 0)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        zIndex: 9999,
        pointerEvents: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        {renderAmmo()}
        {renderHealthBar()}
        {renderFuelGauge()}
      </div>
      <div style={{ 
        backgroundColor: '#222', 
        padding: '8px 16px',
        borderRadius: '4px',
        border: '1px solid rgb(255, 165, 0)',
        boxShadow: '0 0 8px rgba(255, 165, 0, 0.2)'
      }}>
        <span style={{ color: 'white', fontWeight: 'bold', fontSize: '18px' }}>SCORE: {score}</span>
      </div>
    </div>
  );
};

export default HUD; 