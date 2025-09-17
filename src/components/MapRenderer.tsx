'use client'

import Image from 'next/image';
import { GameMap, TILE_MAPPING, TileSymbol, PlayerDirection, getGhosts } from '@/data/maps';

interface MapRendererProps {
  map: GameMap;
}

const DEFAULT_TILE_SIZE = 64;



const getPlayerRotation = (direction: PlayerDirection): number => {
  switch (direction) {
    case 'right':
      return 0; // Default direction, no rotation
    case 'up':
      return -90; // Left turn 90 degrees
    case 'left':
      return 0; // No rotation for left, we'll use scaleX instead
    case 'down':
      return 90; // Right turn 90 degrees
    default:
      return 0;
  }
};

const getPlayerTransform = (direction: PlayerDirection): string => {
  switch (direction) {
    case 'right':
      return 'rotate(0deg)'; // Default direction, no rotation
    case 'up':
      return 'rotate(-90deg)'; // Left turn 90 degrees
    case 'left':
      return 'rotate(0deg) scaleX(-1)'; // Horizontal flip instead of 180° rotation
    case 'down':
      return 'rotate(90deg)'; // Right turn 90 degrees
    default:
      return 'rotate(0deg)';
  }
};

export default function MapRenderer({ map }: MapRendererProps) {
  const tileSize = map.tileSize || DEFAULT_TILE_SIZE;
  
  // Get player and ghost positions from map data
  const playerPosition = map.playerPosition;
  const ghostPositions = getGhosts(map);
  
  
  return (
    <div className="inline-block relative">
      <div 
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${map.width}, ${tileSize}px)`,
          gridTemplateRows: `repeat(${map.height}, ${tileSize}px)`,
          gap: 0
        }}
      >
        {map.tiles.flat().map((tileSymbol: TileSymbol, index: number) => {
          const tileType = TILE_MAPPING[tileSymbol];
          const row = Math.floor(index / map.width);
          const col = index % map.width;
          const dotAnimation = map.dotAnimations?.find(a => a.row === row && a.col === col);
          
          return (
            <div
              key={index}
              className="relative"
              style={{
                width: tileSize,
                height: tileSize
              }}
            >
              {/* Background tile (grass for everything except air) */}
              {tileType !== 'air' && (
                <Image
                  src="/res/grass.png"
                  alt="grass tile"
                  width={tileSize}
                  height={tileSize}
                  className="object-cover pointer-events-none select-none"
                  style={{
                    filter: 'var(--tile-filter)'
                  }}
                  priority
                />
              )}
              
              {/* Entity overlays */}
              {tileType === 'dot' && (
                <div className={`absolute top-0 left-0 ${
                  dotAnimation?.teleportAnimation === 'fade-out'
                    ? 'animate-teleport-fade-out'
                    : dotAnimation?.teleportAnimation === 'fade-in'
                    ? 'animate-teleport-fade-in'
                    : ''
                }`}
                >
                  <Image
                    src="/res/dot.gif"
                    alt="Dot"
                    width={tileSize}
                    height={tileSize}
                    className="object-cover pointer-events-none select-none"
                    draggable={false}
                    priority
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {/* Ghost overlays with animation support */}
      {ghostPositions.map((ghost, index) => {
        const ghostAnimation = map.ghostAnimations?.[index];
        return (
          <div
            key={`ghost-${index}`}
            className={`absolute top-0 left-0 pointer-events-none z-5 ${
              ghostAnimation?.shouldAnimate ? 'transition-transform duration-100 linear' : ''
            }`}
            style={{
              transform: ghostAnimation?.animationPosition 
                ? `translate(${ghostAnimation.animationPosition.x}px, ${ghostAnimation.animationPosition.y}px)`
                : `translate(${ghost.col * tileSize}px, ${ghost.row * tileSize}px)`,
              width: tileSize,
              height: tileSize
            }}
          >
            <div
              className={
                ghostAnimation?.teleportAnimation === 'fade-out' 
                  ? 'animate-teleport-fade-out' 
                  : ghostAnimation?.teleportAnimation === 'fade-in'
                  ? 'animate-teleport-fade-in'
                  : ''
              }
              style={{
                width: tileSize,
                height: tileSize
              }}
            >
              <Image
                src="/res/ghost.gif"
                alt="Ghost"
                width={tileSize}
                height={tileSize}
                className="object-cover"
                priority
              />
            </div>
          </div>
        );
      })}
      
      {/* Player overlay with animation support */}
      {(() => {
        // Always render player if position exists - let fade-out animation handle disappearing
        const shouldRender = !!playerPosition;
        return shouldRender;
      })() && (
        <div
          className={`absolute top-0 left-0 pointer-events-none z-10 ${
            map.playerAnimation?.shouldAnimate ? 'transition-transform duration-100 linear' : ''
          }`}
          style={{
            transform: map.playerAnimation?.animationPosition 
              ? `translate(${map.playerAnimation.animationPosition.x}px, ${map.playerAnimation.animationPosition.y}px)`
              : `translate(${playerPosition.col * tileSize}px, ${playerPosition.row * tileSize}px)`,
            width: tileSize,
            height: tileSize
          }}
        >
          <div
            className={
              map.playerAnimation?.teleportAnimation === 'fade-out' 
                ? 'animate-teleport-fade-out' 
                : map.playerAnimation?.teleportAnimation === 'fade-in'
                ? 'animate-teleport-fade-in'
                : ''
            }
            style={{
              transform: !map.playerAnimation?.teleportAnimation 
                ? getPlayerTransform(map.playerAnimation?.direction || playerPosition.direction)
                : undefined,
              '--rotation': `${getPlayerRotation(map.playerAnimation?.direction || playerPosition.direction)}deg`,
              '--scale-x': (map.playerAnimation?.direction || playerPosition.direction) === 'left' ? '-1' : '1',
              width: tileSize,
              height: tileSize,
              transformOrigin: 'center'
            } as React.CSSProperties}
          >
            <Image
              src="/res/player.gif"
              alt="Player"
              width={tileSize}
              height={tileSize}
              className="object-cover"
              priority
            />
          </div>
        </div>
      )}
    </div>
  );
}
