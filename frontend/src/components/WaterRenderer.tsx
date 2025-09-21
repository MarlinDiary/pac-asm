'use client'

import Image from 'next/image';

interface WaterRendererProps {
  tilesX: number;
  tilesY: number;
  tileSize?: number;
  className?: string;
}

const DEFAULT_TILE_SIZE = 64;

export default function WaterRenderer({ 
  tilesX, 
  tilesY, 
  tileSize = DEFAULT_TILE_SIZE,
  className = ""
}: WaterRendererProps) {
  const tiles = [];
  
  for (let row = 0; row < tilesY; row++) {
    for (let col = 0; col < tilesX; col++) {
      tiles.push(
        <div
          key={`water-${row}-${col}`}
          className="absolute"
          style={{
            left: col * tileSize,
            top: row * tileSize,
            width: tileSize,
            height: tileSize
          }}
        >
          <Image
            src="/res/water.png"
            alt="Water tile"
            width={tileSize}
            height={tileSize}
            className="object-cover opacity-[0.13] dark:opacity-[0.008]"
            priority
          />
        </div>
      );
    }
  }

  return (
    <div 
      className={`relative ${className}`}
      style={{
        width: tilesX * tileSize,
        height: tilesY * tileSize
      }}
    >
      {tiles}
    </div>
  );
}