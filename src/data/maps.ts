export interface TileMapping {
  '%': 'air';
  ' ': 'grass';
  '.': 'dot';
}

export type TileType = 'air' | 'grass' | 'dot';
export type TileSymbol = keyof TileMapping;

export const TILE_MAPPING: Record<TileSymbol, TileType> = {
  '%': 'air',
  ' ': 'grass',
  '.': 'dot'
};

export type PlayerDirection = 'right' | 'up' | 'left' | 'down';

export interface PlayerPosition {
  row: number;
  col: number;
  direction: PlayerDirection;
  animationPosition?: {
    x: number;
    y: number;
  };
  shouldAnimate?: boolean;
  teleportAnimation?: 'fade-out' | 'fade-in';
}

export interface WaterBackground {
  tilesX: number;
  tilesY: number;
}

export interface GhostAnimationState {
  direction?: PlayerDirection;
  animationPosition?: {
    x: number;
    y: number;
  };
  shouldAnimate?: boolean;
  teleportAnimation?: 'fade-out' | 'fade-in';
}

export interface GameMap {
  id: string;
  name: string;
  width: number;
  height: number;
  tileSize?: number;
  tiles: TileSymbol[][];
  waterBackground?: WaterBackground;
  initialCode?: string;
  playerPosition: { row: number; col: number; direction: PlayerDirection };
  ghostPositions: { row: number; col: number }[];
  ghostPreviousPositions?: { row: number; col: number }[];
  playerAnimation?: {
    direction: PlayerDirection;
    animationPosition?: {
      x: number;
      y: number;
    };
    shouldAnimate?: boolean;
    teleportAnimation?: 'fade-out' | 'fade-in';
  };
  ghostAnimations?: GhostAnimationState[];
  gameOver?: boolean;
}

const CHALLENGE_RAW_MAP = `
%%%%%%%%%%%%%%%%%%%%
%....%........%....%
%.%%.%.%%%%%%.%.%%.%
%.%..............%.%
%.%.%%.%%  %%.%%.%.%
%......%    %......%
%.%.%%.%%%%%%.%%.%.%
%.%..............%.%
%.%%.%.%%%%%%.%.%%.%
%....%... ....%....%
%%%%%%%%%%%%%%%%%%%%`;

// Temporary Level 1 data - will be replaced with new map design
const LEVEL1_RAW_MAP = `
%%%%%%%%%%%%%%%%%%%%
%....%........%....%
%.%%.%.%%%%%%.%.%%.%
%.%..............%.%
%.%.%%.%%  %%.%%.%.%
%......%    %......%
%.%.%%.%%%%%%.%%.%.%
%.%..............%.%
%.%%.%.%%%%%%.%.%%.%
%....%... ....%....%
%%%%%%%%%%%%%%%%%%%%`;

function parseMapFromString(mapString: string): TileSymbol[][] {
  const lines = mapString.trim().split('\n');
  return lines.map(line => line.split('') as TileSymbol[]);
}

export const MAPS: GameMap[] = [
  {
    id: 'level1',
    name: 'Level 1',
    width: 20,
    height: 11,
    tileSize: 20,
    tiles: parseMapFromString(LEVEL1_RAW_MAP),
    playerPosition: { row: 9, col: 9, direction: 'right' },
    ghostPositions: [{ row: 5, col: 8 }, { row: 5, col: 11 }],
    waterBackground: { tilesX: 72, tilesY: 71 },
    initialCode: `MOV R0, #4
LDR R1, =0x30000
STRB R0, [R1]`,
  },
  {
    id: 'challenge',
    name: 'Challenge Mode',
    width: 20,
    height: 11,
    tileSize: 20,
    tiles: parseMapFromString(CHALLENGE_RAW_MAP),
    playerPosition: { row: 9, col: 9, direction: 'right' },
    ghostPositions: [{ row: 5, col: 8 }, { row: 5, col: 11 }],
    waterBackground: { tilesX: 72, tilesY: 71 },
    initialCode: `MOV R0, #4
LDR R1, =0x30000
STRB R0, [R1]`,
  }
];

export function getMap(id: string): GameMap | undefined {
  return MAPS.find(map => map.id === id);
}

export function getMapByLevel(levelId: string): GameMap | undefined {
  return MAPS.find(map => map.id === `level${levelId}`);
}

export function getPlayerPosition(map: GameMap): { row: number; col: number; direction: PlayerDirection } | null {
  return map.playerPosition;
}

export function getDots(map: GameMap): { row: number; col: number }[] {
  const dots: { row: number; col: number }[] = [];
  for (let row = 0; row < map.height; row++) {
    for (let col = 0; col < map.width; col++) {
      if (map.tiles[row][col] === '.') {
        dots.push({ row, col });
      }
    }
  }
  return dots;
}


export function getGhosts(map: GameMap): { row: number; col: number }[] {
  return map.ghostPositions;
}
