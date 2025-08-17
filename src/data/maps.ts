export interface TileMapping {
  '%': 'air';
  ' ': 'grass';
  '.': 'dot';
  'o': 'energizer';
}

export type TileType = 'air' | 'grass' | 'dot' | 'energizer';
export type TileSymbol = keyof TileMapping;

export const TILE_MAPPING: Record<TileSymbol, TileType> = {
  '%': 'air',
  ' ': 'grass',
  '.': 'dot',
  'o': 'energizer'
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
  // Entity positions (separate from tile data)
  playerPosition: { row: number; col: number; direction: PlayerDirection };
  ghostPositions: { row: number; col: number }[];
  ghostPreviousPositions?: { row: number; col: number }[]; // Track previous positions for smart movement
  // Animation states (separate from tile data)
  playerAnimation?: {
    direction: PlayerDirection;
    animationPosition?: {
      x: number;
      y: number;
    };
    shouldAnimate?: boolean;
    teleportAnimation?: 'fade-out' | 'fade-in';
  };
  ghostAnimations?: GhostAnimationState[]; // Animation state for each ghost
  // Game state
  gameOver?: boolean; // Game over due to collision
}

// Raw map data for Level 1 (without P and G)
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
    initialCode: `LDR R0, =0x30004
LDR R1, [R0]
LDR R0, =0x30008  
LDR R2, [R0]

LDR R0, =0x30010
MOV R5, #0
MOV R6, #0

find_player_loop:
    MUL R7, R5, R1
    ADD R7, R7, R6
    ADD R7, R0, R7
    LDRB R8, [R7]
    CMP R8, #4
    BEQ found_player
    
    ADD R6, R6, #1
    CMP R6, R1
    BLT find_player_loop
    MOV R6, #0
    ADD R5, R5, #1
    CMP R5, R2
    BLT find_player_loop
    
    MOV R11, #1
    B store_direction

found_player:
    MOV R7, #100
    MOV R8, #100
    MOV R9, #100
    MOV R10, #100

eval_up:
    CMP R5, #0
    SUBEQ R7, R7, #300
    BEQ eval_down
    
    SUB R11, R5, #1
    MUL R12, R11, R1
    ADD R12, R12, R6
    ADD R12, R0, R12
    LDRB R11, [R12]
    
    CMP R11, #0
    SUBEQ R7, R7, #400
    CMP R11, #5
    SUBEQ R7, R7, #800
    CMP R11, #2
    ADDEQ R7, R7, #50
    CMP R11, #1
    ADDEQ R7, R7, #10
    
    SUB R3, R5, #1
    MOV R4, R6
    
    CMP R3, #0
    BLE check_target_down
    SUB R11, R3, #1
    MUL R12, R11, R1
    ADD R12, R12, R4
    ADD R12, R0, R12
    LDRB R11, [R12]
    CMP R11, #5
    SUBEQ R7, R7, #600
    
check_target_down:
    ADD R11, R3, #1
    CMP R11, R2
    BGE check_target_left
    MUL R12, R11, R1
    ADD R12, R12, R4
    ADD R12, R0, R12
    LDRB R11, [R12]
    CMP R11, #5
    SUBEQ R7, R7, #600
    
check_target_left:
    CMP R4, #0
    BLE check_target_right
    SUB R11, R4, #1
    MUL R12, R3, R1
    ADD R12, R12, R11
    ADD R12, R0, R12
    LDRB R11, [R12]
    CMP R11, #5
    SUBEQ R7, R7, #600
    
check_target_right:
    ADD R11, R4, #1
    CMP R11, R1
    BGE eval_down
    MUL R12, R3, R1
    ADD R12, R12, R11
    ADD R12, R0, R12
    LDRB R11, [R12]
    CMP R11, #5
    SUBEQ R7, R7, #600
    
    CMP R5, #5
    ADDLT R7, R7, #15
    
    SUB R11, R5, #2
    CMP R11, #0
    BLT eval_down
    MUL R12, R11, R1
    ADD R12, R12, R6
    ADD R12, R0, R12
    LDRB R11, [R12]
    CMP R11, #0
    ADDNE R7, R7, #8

eval_down:
    ADD R11, R5, #1
    CMP R11, R2
    SUBGE R8, R8, #300
    BGE eval_left
    
    MUL R12, R11, R1
    ADD R12, R12, R6
    ADD R12, R0, R12
    LDRB R11, [R12]
    
    CMP R11, #0
    SUBEQ R8, R8, #400
    CMP R11, #5
    SUBEQ R8, R8, #800
    CMP R11, #2
    ADDEQ R8, R8, #50
    CMP R11, #1
    ADDEQ R8, R8, #10
    
    ADD R3, R5, #1
    MOV R4, R6
    
    CMP R3, #0
    BLE check_down_target_down
    SUB R11, R3, #1
    MUL R12, R11, R1
    ADD R12, R12, R4
    ADD R12, R0, R12
    LDRB R11, [R12]
    CMP R11, #5
    SUBEQ R8, R8, #600
    
check_down_target_down:
    ADD R11, R3, #1
    CMP R11, R2
    BGE check_down_target_left
    MUL R12, R11, R1
    ADD R12, R12, R4
    ADD R12, R0, R12
    LDRB R11, [R12]
    CMP R11, #5
    SUBEQ R8, R8, #600
    
check_down_target_left:
    CMP R4, #0
    BLE check_down_target_right
    SUB R11, R4, #1
    MUL R12, R3, R1
    ADD R12, R12, R11
    ADD R12, R0, R12
    LDRB R11, [R12]
    CMP R11, #5
    SUBEQ R8, R8, #600
    
check_down_target_right:
    ADD R11, R4, #1
    CMP R11, R1
    BGE eval_left
    MUL R12, R3, R1
    ADD R12, R12, R11
    ADD R12, R0, R12
    LDRB R11, [R12]
    CMP R11, #5
    SUBEQ R8, R8, #600
    
    MOV R11, R2
    LSR R11, R11, #1
    CMP R5, R11
    ADDGT R8, R8, #15
    
    ADD R11, R5, #2
    CMP R11, R2
    BGE eval_left
    MUL R12, R11, R1
    ADD R12, R12, R6
    ADD R12, R0, R12
    LDRB R11, [R12]
    CMP R11, #0
    ADDNE R8, R8, #8

eval_left:
    CMP R6, #0
    SUBEQ R9, R9, #300
    BEQ eval_right
    
    SUB R11, R6, #1
    MUL R12, R5, R1
    ADD R12, R12, R11
    ADD R12, R0, R12
    LDRB R11, [R12]
    
    CMP R11, #0
    SUBEQ R9, R9, #400
    CMP R11, #5
    SUBEQ R9, R9, #800
    CMP R11, #2
    ADDEQ R9, R9, #50
    CMP R11, #1
    ADDEQ R9, R9, #10
    
    MOV R3, R5
    SUB R4, R6, #1
    
    CMP R3, #0
    BLE check_left_target_down
    SUB R11, R3, #1
    MUL R12, R11, R1
    ADD R12, R12, R4
    ADD R12, R0, R12
    LDRB R11, [R12]
    CMP R11, #5
    SUBEQ R9, R9, #600
    
check_left_target_down:
    ADD R11, R3, #1
    CMP R11, R2
    BGE check_left_target_left
    MUL R12, R11, R1
    ADD R12, R12, R4
    ADD R12, R0, R12
    LDRB R11, [R12]
    CMP R11, #5
    SUBEQ R9, R9, #600
    
check_left_target_left:
    CMP R4, #0
    BLE check_left_target_right
    SUB R11, R4, #1
    MUL R12, R3, R1
    ADD R12, R12, R11
    ADD R12, R0, R12
    LDRB R11, [R12]
    CMP R11, #5
    SUBEQ R9, R9, #600
    
check_left_target_right:
    ADD R11, R4, #1
    CMP R11, R1
    BGE eval_right
    MUL R12, R3, R1
    ADD R12, R12, R11
    ADD R12, R0, R12
    LDRB R11, [R12]
    CMP R11, #5
    SUBEQ R9, R9, #600
    
    CMP R6, #5
    ADDLT R9, R9, #15
    
    CMP R6, #1
    BLE eval_right
    SUB R11, R6, #2
    MUL R12, R5, R1
    ADD R12, R12, R11
    ADD R12, R0, R12
    LDRB R11, [R12]
    CMP R11, #0
    ADDNE R9, R9, #8

eval_right:
    ADD R11, R6, #1
    CMP R11, R1
    SUBGE R10, R10, #300
    BGE choose_best
    
    MUL R12, R5, R1
    ADD R12, R12, R11
    ADD R12, R0, R12
    LDRB R11, [R12]
    
    CMP R11, #0
    SUBEQ R10, R10, #400
    CMP R11, #5
    SUBEQ R10, R10, #800
    CMP R11, #2
    ADDEQ R10, R10, #50
    CMP R11, #1
    ADDEQ R10, R10, #10
    
    MOV R3, R5
    ADD R4, R6, #1
    
    CMP R3, #0
    BLE check_right_target_down
    SUB R11, R3, #1
    MUL R12, R11, R1
    ADD R12, R12, R4
    ADD R12, R0, R12
    LDRB R11, [R12]
    CMP R11, #5
    SUBEQ R10, R10, #600
    
check_right_target_down:
    ADD R11, R3, #1
    CMP R11, R2
    BGE check_right_target_left
    MUL R12, R11, R1
    ADD R12, R12, R4
    ADD R12, R0, R12
    LDRB R11, [R12]
    CMP R11, #5
    SUBEQ R10, R10, #600
    
check_right_target_left:
    CMP R4, #0
    BLE check_right_target_right
    SUB R11, R4, #1
    MUL R12, R3, R1
    ADD R12, R12, R11
    ADD R12, R0, R12
    LDRB R11, [R12]
    CMP R11, #5
    SUBEQ R10, R10, #600
    
check_right_target_right:
    ADD R11, R4, #1
    CMP R11, R1
    BGE choose_best
    MUL R12, R3, R1
    ADD R12, R12, R11
    ADD R12, R0, R12
    LDRB R11, [R12]
    CMP R11, #5
    SUBEQ R10, R10, #600
    
    MOV R11, R1
    LSR R11, R11, #1
    CMP R6, R11
    ADDGT R10, R10, #15
    
    ADD R11, R6, #2
    CMP R11, R1
    BGE choose_best
    MUL R12, R5, R1
    ADD R12, R12, R11
    ADD R12, R0, R12
    LDRB R11, [R12]
    CMP R11, #0
    ADDNE R10, R10, #8

choose_best:
    MOV R11, #1
    MOV R12, R7
    
    CMP R8, R12
    MOVGT R11, #2
    MOVGT R12, R8
    
    CMP R9, R12
    MOVGT R11, #3
    MOVGT R12, R9
    
    CMP R10, R12
    MOVGT R11, #4

store_direction:
    LDR R0, =0x30000
    STR R11, [R0]`,
  }
];

export function getMap(id: string): GameMap | undefined {
  return MAPS.find(map => map.id === id);
}

export function getMapByLevel(levelId: string): GameMap | undefined {
  return MAPS.find(map => map.id === `level${levelId}`);
}

// Helper functions to extract information from map
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

export function getEnergizers(map: GameMap): { row: number; col: number }[] {
  const energizers: { row: number; col: number }[] = [];
  for (let row = 0; row < map.height; row++) {
    for (let col = 0; col < map.width; col++) {
      if (map.tiles[row][col] === 'o') {
        energizers.push({ row, col });
      }
    }
  }
  return energizers;
}

export function getGhosts(map: GameMap): { row: number; col: number }[] {
  return map.ghostPositions;
}