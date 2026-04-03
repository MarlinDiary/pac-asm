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

export interface DotAnimationState {
  row: number;
  col: number;
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
  initialCode?: string | { ARM: string; MIPS_R6: string };
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
  dotAnimations?: DotAnimationState[];
  gameOver?: boolean;
}

const CHALLENGE_RAW_MAP = `
%%%%%%%%%%%%%%%%%%%%
%....%........%....%
%.%%.%.%%%%%%.%.%%.%
%.%..............%.%
%.%.%%.%%..%%.%%.%.%
%......%....%......%
%.%.%%.%%%%%%.%%.%.%
%.%..............%.%
%.%%.%.%%%%%%.%.%%.%
%....%........%....%
%%%%%%%%%%%%%%%%%%%%`;

// Level 1: Basic movement - straight line to collect a dot
const LEVEL1_RAW_MAP = `
%%%%%
%  .%
%%%%%`;

// Level 2: Turn required - move right then down
const LEVEL2_RAW_MAP = `
%%%%%%%
%     %
%%%%%.%
%%%%%%%`;

// Level 3: Environment sensing - find the dot by checking surroundings
const LEVEL3_RAW_MAP = `
%%%%%%%%%%%%%
%%%.......%%%
%%..%%%%%..%%
%..%%...%%..%
%.%%..%..%%.%
%.%..%%%..%.%
%.%.%%%%%.%.%
%.%..%%%..%.%
%.%%..%..%%.%
%..%%.%.%%..%
%%..%%%.%..%%
%%%.....% %%%
%%%%%%%%%%%%%`;

// Level 4: Ghost avoidance - reach the dot while avoiding the ghost
const LEVEL4_RAW_MAP = `
%%%%%%
%    %
%    %
%    %
%    %
%    %
%    %
%    %
%    %
%    %
%    %
%   .%
%%%%%%`;

function parseMapFromString(mapString: string): TileSymbol[][] {
  const lines = mapString.trim().split('\n');
  return lines.map(line => line.split('') as TileSymbol[]);
}

export const MAPS: GameMap[] = [
  {
    id: 'level1',
    name: 'Level 1',
    width: 5,
    height: 3,
    tileSize: 64,
    tiles: parseMapFromString(LEVEL1_RAW_MAP),
    playerPosition: { row: 1, col: 1, direction: 'right' },
    ghostPositions: [],
    waterBackground: { tilesX: 71, tilesY: 71 },
    initialCode: {
      ARM: `MOV R0, #4
LDR R1, =0x30000
STR R0, [R1]
STR R0, [R1]`,
      MIPS_R6: `ORI $t0, $zero, 4     # Load immediate value 4 into $t0 (the command code for "go right")
LUI $t1, 0x3          # Load upper immediate: $t1 = 0x00030000 ($t1 points to the movement control register)
SW $t0, 0($t1)        # Write 4 ("go right") to the control register -> tells the pacman to move right
SW $t0, 0($t1)        # Write 4 ("go right") again`
    },
  },
  {
    id: 'level2',
    name: 'Level 2',
    width: 7,
    height: 4,
    tileSize: 56,
    tiles: parseMapFromString(LEVEL2_RAW_MAP),
    playerPosition: { row: 1, col: 1, direction: 'right' },
    ghostPositions: [],
    waterBackground: { tilesX: 71, tilesY: 72 },
    initialCode: {
      ARM: `MOV R0, #4
LDR R1, =0x30000
STR R0, [R1]`,
      MIPS_R6: `main:
    ORI $t2, $zero, 0         # Initialize counter in $t2 to 0

loop:
    SLTI $t3, $t2, 4          # $t3 = 1 if $t2 < 4
    BEQZC $t3, down           # If $t2 >= 4, branch to 'down'

    # If $t2 < 4: go right
    ORI $t0, $zero, 4         # $t0 = 4 (command: go right)
    ADDIU $t2, $t2, 1         # Increment counter ($t2 += 1)
    BC send_command           # Skip 'down' section

down:
    ORI $t0, $zero, 2         # $t0 = 2 (command: go down)

send_command:
    LUI $t1, 0x3              # $t1 = 0x30000 (upper part of command register address)
    SW $t0, 0($t1)            # Send command (2 or 4) to command register

    BC loop                   # Repeat the loop`
    },
  },
  {
    id: 'level3',
    name: 'Level 3',
    width: 13,
    height: 13,
    tileSize: 28,
    tiles: parseMapFromString(LEVEL3_RAW_MAP),
    playerPosition: { row: 11, col: 9, direction: 'right' },
    ghostPositions: [],
    waterBackground: { tilesX: 71, tilesY: 71 },
    initialCode: {
      ARM: `MOV R0, #4
LDR R1, =0x30000
STR R0, [R1]`,
      MIPS_R6: `main:
# Set $t1 = 0x30010, the start of map data in memory
LUI $t1, 0x3
ORI $t1, $t1, 0x0010

# Initialize loop counter $t2 = 169 (maximum tiles to scan)
ORI $t2, $zero, 169

loop:
# Read one map tile (current byte in the map)
LBU $t3, 0($t1)

# Advance to the next tile
ADDIU $t1, $t1, 1

# Load constant 3 = Player tile
ORI $t4, $zero, 3

# If this tile is the Player (Pac-Man), branch to "check"
BEQC $t3, $t4, check

# Otherwise, reduce the counter and keep searching
ADDIU $t2, $t2, -1
BNEZC $t2, loop

check:
# Look 14 tiles back. If that tile = Dot (2), Pac-Man must move Up
LBU $t3, -14($t1)
ORI $t4, $zero, 2
BNEC $t3, $t4, next1
ORI $t0, $zero, 1   # Move Up command

next1:
# Look 12 tiles forward. If that tile = Dot (2), Pac-Man must move Down
LBU $t3, 12($t1)
BNEC $t3, $t4, next2
ORI $t0, $zero, 2   # Move Down command

# Tips The map is stored row by row in memory. Each row has 13 tiles (since width = 13).
# Moving up or down one row means moving ±13 tiles in memory.
# At first glance, you’d expect -13 and +13. But the loop increments $t1 by 1 after reading Pac-Man’s tile.

next2:
# Look 2 tiles back. If that tile = Dot (2), Pac-Man must move Left
LBU $t3, -2($t1)
BNEC $t3, $t4, next3
ORI $t0, $zero, 3   # Move Left command

next3:
# Look at the current tile. If it = Dot (2), Pac-Man must move Right
LBU $t3, 0($t1)
BNEC $t3, $t4, done
ORI $t0, $zero, 4   # Move Right command

done:
# Reset $t1 = 0x30000 (movement command address)
LUI $t1, 0x3

# Write Pac-Man’s movement command into 0x30000
SW $t0, 0($t1)

# Jump back to main loop
BC main`
    },
  },
  {
    id: 'level4',
    name: 'Level 4',
    width: 6,
    height: 13,
    tileSize: 42,
    tiles: parseMapFromString(LEVEL4_RAW_MAP),
    playerPosition: { row: 1, col: 1, direction: 'right' },
    ghostPositions: [{ row: 6, col: 2 }],
    waterBackground: { tilesX: 72, tilesY: 71 },
    initialCode: {
      ARM: `MOV R0, #4
LDR R1, =0x30000
STR R0, [R1]`,
      MIPS_R6: `main:
#TOFILL     Load upper 16 bits of $t8 with 0x0003 (high part of map base address)
#TOFILL     Set $t8 = 0x30010, starting address of map data
#TOFILL     Initialize $s4 = 0 (row counter)
scan:
ORI $t1, $zero, 0        # Initialize $t1 = 0 (column counter)
loop:
#TOFILL     Load byte from map at address in $t8 (current tile)
ADDIU $t8, $t8, 1        # Increment map pointer to next tile
ORI $t5, $zero, 3         # Prepare value 3 (player) in $t5
BNEC $t2, $t5, skip1     # If current tile != player, skip block
#TOFILL     Store current row in $s0 (player row)
OR $s1, $t1, $zero       # Store current column in $s1 (player column)
skip1:
ORI $t5, $zero, 2         # Prepare value 2 (dot) in $t5
BNEC $t2, $t5, skip2     # If current tile != dot, skip block
OR $s2, $s4, $zero       # Store current row in $s2 (dot row)
#TOFILL     Store current column in $s3 (dot column)
skip2:
ORI $t5, $zero, 4         # Prepare value 4 (ghost) in $t5
BNEC $t2, $t5, skip3     # If current tile != ghost, skip block
OR $s6, $s4, $zero       # Store current row in $s6 (ghost row)
#TOFILL     Store current column in $s7 (ghost column)
skip3:
#TOFILL     Increment column counter
#TOFILL     Check if column < 6
#TOFILL     If yes, continue loop over columns
ADDIU $s4, $s4, 1        # Increment row counter
SLTI $t5, $s4, 13        # Check if row < 13
#TOFILL     If yes, continue scanning next row

# Determine movement direction
#TOFILL     If dot is in same row as player, go to same_row
#TOFILL     Check if player row < dot row
#TOFILL     If yes, move down
ORI $t4, $zero, 1        # Else, move up (1)
BC start
dir_down:
#TOFILL     Move down (2)
BC start
same_row:
BEQC $s3, $s1, dir_right  # If dot column = player column, move right
#TOFILL     Check if player column < dot column
#TOFILL     If yes, move right
ORI $t4, $zero, 3        # Else, move left
BC start
dir_right:
#TOFILL     Move right (4)

start:
ORI $t3, $zero, 4        # Max 4 attempts to adjust move if unsafe
#TOFILL     Initialize selected move = 0

test:
OR $t5, $s0, $zero       # Copy target row to $t5
OR $t9, $s1, $zero       # Copy target column to $t9
ORI $t2, $zero, 1
BNEC $t4, $t2, try2      # If move != up, skip
#TOFILL     Adjust row for up
try2:
ORI $t2, $zero, 2
#TOFILL     If move != down, skip
#TOFILL     Adjust row for down
try3:
ORI $t2, $zero, 3
BNEC $t4, $t2, try4      # If move != left, skip
#TOFILL     Adjust column for left
try4:
ORI $t2, $zero, 4
BNEC $t4, $t2, calc      # If move != right, skip
ADDIU $t9, $t9, 1        # Adjust column for right

calc:
SLL $t8, $t5, 1
ADDU $t8, $t8, $t5
SLL $t8, $t8, 1
#TOFILL     Compute offset = row*6 + column
LUI $t1, 0x0003
ORI $t1, $t1, 0x0010
ADDU $t1, $t1, $t8       # Address of target tile
LBU $t2, 0($t1)          # Load target tile
BEQZC $t2, next          # If empty, tile safe
#TOFILL     Check row distance to ghost
BGEZC $t2, pos_r
SUBU $t2, $zero, $t2
pos_r:
SLTI $t1, $t2, 2         # If distance < 2, not safe
BEQZC $t1, safe
SUBU $t2, $t9, $s7       # Check column distance to ghost
BGEZC $t2, pos_c
SUBU $t2, $zero, $t2
pos_c:
#TOFILL     If distance < 2, not safe
BNEZC $t1, next
safe:
OR $s5, $t4, $zero       # Move is safe, select it
BC done
next:
ADDIU $t3, $t3, -1       # Decrement attempts
#TOFILL     If no attempts left, finish
ADDIU $t4, $t4, 1        # Try next direction
SLTI $t2, $t4, 5
BNEZC $t2, test           # Repeat test
ORI $t4, $zero, 1
BC test

done:
BEQZC $s5, write         # If no safe move, proceed to write
OR $t4, $s5, $zero       # Use selected move

write:
LUI $t1, 0x0003
ORI $t1, $t1, 0x0000     # Base address for movement command (0x30000)
SW $t4, 0($t1)           # Write movement command to move Pac-Man
#TOFILL     Repeat main loop
`
    },
  },
  {
    id: 'challenge',
    name: 'Challenge Mode',
    width: 20,
    height: 11,
    tileSize: 20,
    tiles: parseMapFromString(CHALLENGE_RAW_MAP),
    playerPosition: { row: 9, col: 9, direction: 'right' },
    ghostPositions: [{ row: 1, col: 1 }, { row: 9, col: 18 }],
    waterBackground: { tilesX: 72, tilesY: 71 },
    initialCode: {
      ARM: `MOV R0, #4
LDR R1, =0x30000
STR R0, [R1]`,
      MIPS_R6: ''
    },
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

/**
 * Randomize dot position for Level 4
 * Places a single dot randomly in columns 8-11 on grass tiles
 */
export function randomizeLevel4Dot(map: GameMap): GameMap {
  // Only apply to level4
  if (map.id !== 'level4') {
    return map;
  }
  
  // Clear any existing dots
  const newTiles = map.tiles.map(row => 
    row.map(tile => tile === '.' ? ' ' : tile) as TileSymbol[]
  );
  
  // Find all valid grass positions in columns 8-11
  const validPositions: { row: number; col: number }[] = [];
  for (let row = 1; row < map.height - 1; row++) { // Skip border rows
    for (let col = 8; col <= 11; col++) {
      if (newTiles[row][col] === ' ') { // Is grass
        validPositions.push({ row, col });
      }
    }
  }
  
  // Randomly select one position for the dot
  if (validPositions.length > 0) {
    const randomIndex = Math.floor(Math.random() * validPositions.length);
    const { row, col } = validPositions[randomIndex];
    newTiles[row][col] = '.';
  }
  
  return {
    ...map,
    tiles: newTiles
  };
}

export function getGhosts(map: GameMap): { row: number; col: number }[] {
  return map.ghostPositions;
}
