'use client';

import React from 'react';

const ControlsInfo = () => {
  return (
    <div className="absolute bottom-4 left-4 bg-black/70 text-white p-3 rounded-md text-xs max-w-[200px] z-10">
      <h3 className="text-sm font-bold mb-2">Controls</h3>
      <div className="space-y-1">
        <h4 className="text-xs font-semibold text-yellow-300">Movement</h4>
        <ul className="space-y-0.5 ml-2">
          <li><span className="font-mono bg-gray-700 px-1 rounded text-xs">W</span>: Move forward</li>
          <li><span className="font-mono bg-gray-700 px-1 rounded text-xs">S</span>: Move backward</li>
          <li><span className="font-mono bg-gray-700 px-1 rounded text-xs">A</span>: Move left</li>
          <li><span className="font-mono bg-gray-700 px-1 rounded text-xs">D</span>: Move right</li>
        </ul>
        
        <h4 className="text-xs font-semibold text-yellow-300 mt-2">Combat</h4>
        <ul className="space-y-0.5 ml-2">
          <li><span className="font-mono bg-gray-700 px-1 rounded text-xs">Mouse</span>: Aim</li>
          <li><span className="font-mono bg-gray-700 px-1 rounded text-xs">Click</span> or <span className="font-mono bg-gray-700 px-1 rounded text-xs">Space</span>: Shoot</li>
        </ul>
      </div>
      <p className="mt-2 text-xs text-gray-300">Click game to lock mouse controls</p>
    </div>
  );
};

export default ControlsInfo; 