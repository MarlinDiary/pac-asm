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
    initialCode: `// Simple Smart Pac-Man: Avoid nearby ghosts
// Memory layout: 0x30004=width, 0x30008=height, 0x30010=map tiles
// Tile encoding: 0=wall, 1=grass, 2=dot, 3=energizer, 4=player, 5=ghost

// Read map dimensions
LDR R0, =0x30004
LDR R1, [R0]        // R1 = width
LDR R0, =0x30008  
LDR R2, [R0]        // R2 = height

// Find current player position
LDR R0, =0x30010    // Map data start
MOV R5, #0          // Row counter 
MOV R6, #0          // Col counter

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
    // Start with base scores for all directions  
    MOV R7, #100        // UP score
    MOV R8, #100        // DOWN score  
    MOV R9, #100        // LEFT score
    MOV R10, #100       // RIGHT score

// === EVALUATE UP ===
eval_up:
    CMP R5, #0          
    SUBEQ R7, R7, #300  // Edge penalty
    BEQ eval_down
    
    SUB R11, R5, #1     // Target position: (R5-1, R6)
    MUL R12, R11, R1    
    ADD R12, R12, R6
    ADD R12, R0, R12    
    LDRB R11, [R12]     
    
    CMP R11, #0         // Wall?
    SUBEQ R7, R7, #400  
    CMP R11, #5         // Ghost already there? 
    SUBEQ R7, R7, #800  
    CMP R11, #2         // Dot?
    ADDEQ R7, R7, #50
    CMP R11, #1         // Empty grass?
    ADDEQ R7, R7, #10   // Small bonus for valid movement   
    
    // Check if ghost is within 2 spaces in UP direction
    CMP R5, #1          // Can we check 2 spaces up?
    BLE eval_down
    SUB R11, R5, #2     // Position 2 spaces up: (R5-2, R6)
    MUL R12, R11, R1    
    ADD R12, R12, R6
    ADD R12, R0, R12    
    LDRB R11, [R12]     
    CMP R11, #5         // Ghost 2 spaces away?
    SUBEQ R7, R7, #500  // Penalty for nearby ghost

// === EVALUATE DOWN ===
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
    CMP R11, #1         // Empty grass?
    ADDEQ R8, R8, #10   // Small bonus for valid movement
    
    // Check if ghost is within 2 spaces in DOWN direction
    ADD R11, R5, #2     // Position 2 spaces down: (R5+2, R6)
    CMP R11, R2         // Within bounds?
    BGE eval_left
    MUL R12, R11, R1    
    ADD R12, R12, R6
    ADD R12, R0, R12    
    LDRB R11, [R12]     
    CMP R11, #5         // Ghost 2 spaces away?
    SUBEQ R8, R8, #500  // Penalty for nearby ghost

// === EVALUATE LEFT ===
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
    CMP R11, #1         // Empty grass?
    ADDEQ R9, R9, #10   // Small bonus for valid movement
    
    // Check if ghost is within 2 spaces in LEFT direction
    CMP R6, #1          // Can we check 2 spaces left?
    BLE eval_right
    SUB R11, R6, #2     // Position 2 spaces left: (R5, R6-2)
    MUL R12, R5, R1     
    ADD R12, R12, R11
    ADD R12, R0, R12
    LDRB R11, [R12]     
    CMP R11, #5         // Ghost 2 spaces away?
    SUBEQ R9, R9, #500  // Penalty for nearby ghost

// === EVALUATE RIGHT ===
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
    CMP R11, #1         // Empty grass?
    ADDEQ R10, R10, #10 // Small bonus for valid movement 
    
    // Check if ghost is within 2 spaces in RIGHT direction
    ADD R11, R6, #2     // Position 2 spaces right: (R5, R6+2)
    CMP R11, R1         // Within bounds?
    BGE choose_best
    MUL R12, R5, R1     
    ADD R12, R12, R11
    ADD R12, R0, R12
    LDRB R11, [R12]     
    CMP R11, #5         // Ghost 2 spaces away?
    SUBEQ R10, R10, #500 // Penalty for nearby ghost

choose_best:
    // Find best score (highest positive value)
    MOV R11, #1         // Default UP
    MOV R12, R7         // Best score
    
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