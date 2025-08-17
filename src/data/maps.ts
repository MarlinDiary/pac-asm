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
    initialCode: `// Super Safe Pac-Man: Ghost avoidance priority
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
    MUL R7, R5, R1      // R7 = row * width
    ADD R7, R7, R6      // R7 = row * width + col
    ADD R7, R0, R7      // R7 = map_base + offset
    LDRB R8, [R7]       // Load tile value  
    CMP R8, #4          // Is it player tile?
    BEQ found_player    // Found player at (R5, R6)
    
    ADD R6, R6, #1      // col++
    CMP R6, R1          // col >= width?
    BLT find_player_loop
    MOV R6, #0          // Reset col
    ADD R5, R5, #1      // row++
    CMP R5, R2          // row >= height?
    BLT find_player_loop
    
    MOV R11, #1         // Player not found, default UP
    B store_direction

found_player:
    // Check all directions for safety first, then score
    // R7(UP), R8(DOWN), R9(LEFT), R10(RIGHT) scores
    MOV R7, #0          
    MOV R8, #0          
    MOV R9, #0          
    MOV R10, #0         

// Check UP direction
check_up:
    CMP R5, #0          
    MOVEQ R7, #0        // Edge = bad (will be set to 0)
    BEQ check_down
    
    // Check immediate UP tile
    SUB R11, R5, #1     
    MUL R12, R11, R1    
    ADD R12, R12, R6
    ADD R12, R0, R12    
    LDRB R11, [R12]     
    
    CMP R11, #0         // Wall?
    MOVEQ R7, #0        // Wall = 0 score
    BEQ check_down
    CMP R11, #5         // Ghost?
    MOVEQ R7, #0        // Ghost = 0 score (avoid)
    BEQ check_down
    
    // Safe tile - give good score
    MOV R7, #100        // Base safe score
    CMP R11, #2         // Dot?
    ADDEQ R7, R7, #50   // Dot bonus
    B check_down
    
// Check DOWN direction 
check_down:
    ADD R11, R5, #1     
    CMP R11, R2         
    MOVGE R8, #0        // Edge = 0
    BGE check_left
    
    MUL R12, R11, R1    
    ADD R12, R12, R6
    ADD R12, R0, R12
    LDRB R11, [R12]     
    
    CMP R11, #0         
    MOVEQ R8, #0        // Wall = 0
    BEQ check_left
    CMP R11, #5         
    MOVEQ R8, #0        // Ghost = 0
    BEQ check_left
    
    MOV R8, #100        // Safe path
    CMP R11, #2         
    ADDEQ R8, R8, #50   // Dot bonus

// Check LEFT direction
check_left:
    CMP R6, #0          
    MOVEQ R9, #0        // Edge = 0
    BEQ check_right
    
    SUB R11, R6, #1     
    MUL R12, R5, R1     
    ADD R12, R12, R11
    ADD R12, R0, R12
    LDRB R11, [R12]     
    
    CMP R11, #0         
    MOVEQ R9, #0        // Wall = 0
    BEQ check_right
    CMP R11, #5         
    MOVEQ R9, #0        // Ghost = 0
    BEQ check_right
    
    MOV R9, #100        // Safe path
    CMP R11, #2         
    ADDEQ R9, R9, #50   // Dot bonus

// Check RIGHT direction
check_right:
    ADD R11, R6, #1     
    CMP R11, R1         
    MOVGE R10, #0       // Edge = 0
    BGE choose_safest
    
    MUL R12, R5, R1     
    ADD R12, R12, R11
    ADD R12, R0, R12
    LDRB R11, [R12]     
    
    CMP R11, #0         
    MOVEQ R10, #0       // Wall = 0
    BEQ choose_safest
    CMP R11, #5         
    MOVEQ R10, #0       // Ghost = 0
    BEQ choose_safest
    
    MOV R10, #100       // Safe path
    CMP R11, #2         
    ADDEQ R10, R10, #50 // Dot bonus 

choose_safest:
    // Choose highest scoring (safest) direction
    MOV R11, #1         // Default UP
    MOV R12, R7         // Best score = UP
    
    CMP R8, R12         
    MOVGT R11, #2       // DOWN is better
    MOVGT R12, R8       
    
    CMP R9, R12         
    MOVGT R11, #3       // LEFT is better
    MOVGT R12, R9       
    
    CMP R10, R12        
    MOVGT R11, #4       // RIGHT is better

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