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
  initialCode?: string | { ARM: string; MIPS: string; MIPS_R6?: string };
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
%.%.%%.%%  %%.%%.%.%
%......%    %......%
%.%.%%.%%%%%%.%%.%.%
%.%..............%.%
%.%%.%.%%%%%%.%.%%.%
%....%... ....%....%
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
      MIPS: `LI $t0, 4
LI $t1, 0x30000
SW $t0, 0($t1)
SW $t0, 0($t1)`,
      MIPS_R6: `ORI $t0, $zero, 4
LUI $t1, 0x3
SW $t0, 0($t1)
SW $t0, 0($t1)`
    },
  },
  {
    id: 'level2',
    name: 'Level 2',
    width: 7,
    height: 4,
    tileSize: 64,
    tiles: parseMapFromString(LEVEL2_RAW_MAP),
    playerPosition: { row: 1, col: 1, direction: 'right' },
    ghostPositions: [],
    waterBackground: { tilesX: 71, tilesY: 72 },
    initialCode: {
      ARM: `main:
LDR R1, =0x30400
LDR R2, [R1]
CMP R2, #4
MOVLT R0, #4
MOVGE R0, #2
ADD R2, R2, #1
STR R2, [R1]
LDR R1, =0x30000
STR R0, [R1]
B main`,
      MIPS: `main:
LUI $t1, 0x3
ORI $t1, $t1, 0x0400
LW $t2, 0($t1)

SLTI $t3, $t2, 4
BEQ $t3, $zero, down

LI $t0, 4
B continue

down:
LI $t0, 2

continue:
ADDI $t2, $t2, 1
SW $t2, 0($t1)

LUI $t1, 0x3
SW $t0, 0($t1)

B main`,
      MIPS_R6: `main:
LUI $t1, 0x3
ORI $t1, $t1, 0x0400
LW $t2, 0($t1)

SLTI $t3, $t2, 4
BEQZC $t3, down

ORI $t0, $zero, 4
BC continue

down:
ORI $t0, $zero, 2

continue:
ADDIU $t2, $t2, 1
SW $t2, 0($t1)

LUI $t1, 0x3
SW $t0, 0($t1)

BC main`
    },
  },
  {
    id: 'level3',
    name: 'Level 3',
    width: 13,
    height: 13,
    tileSize: 32,
    tiles: parseMapFromString(LEVEL3_RAW_MAP),
    playerPosition: { row: 11, col: 9, direction: 'right' },
    ghostPositions: [],
    waterBackground: { tilesX: 71, tilesY: 71 },
    initialCode: {
      ARM: `main:
LDR R1, =0x30010
MOV R2, #169
loop:
LDRB R3, [R1], #1
CMP R3, #3
BEQ check
SUBS R2, R2, #1
BNE loop
check:
LDRB R3, [R1, #-14]
CMP R3, #2
MOVEQ R0, #1
LDRB R3, [R1, #12]
CMP R3, #2
MOVEQ R0, #2
LDRB R3, [R1, #-2]
CMP R3, #2
MOVEQ R0, #3
LDRB R3, [R1]
CMP R3, #2
MOVEQ R0, #4
LDR R1, =0x30000
STR R0, [R1]
B main`,
      MIPS: `main:
LUI $t1, 0x3
ORI $t1, $t1, 0x0010
LI $t2, 169
loop:
LBU $t3, 0($t1)
ADDI $t1, $t1, 1
LI $t4, 3
BEQ $t3, $t4, check
ADDI $t2, $t2, -1
BNE $t2, $zero, loop
check:
LBU $t3, -14($t1)
LI $t4, 2
BNE $t3, $t4, next1
LI $t0, 1
next1:
LBU $t3, 12($t1)
BNE $t3, $t4, next2
LI $t0, 2
next2:
LBU $t3, -2($t1)
BNE $t3, $t4, next3
LI $t0, 3
next3:
LBU $t3, 0($t1)
BNE $t3, $t4, done
LI $t0, 4
done:
LUI $t1, 0x3
SW $t0, 0($t1)
B main`,
      MIPS_R6: `main:
LUI $t1, 0x3
ORI $t1, $t1, 0x0010
ORI $t2, $zero, 169

loop:
LBU $t3, 0($t1)
ADDIU $t1, $t1, 1
ORI $t4, $zero, 3
BEQC $t3, $t4, check
ADDIU $t2, $t2, -1
BNEZC $t2, loop

check:
LBU $t3, -14($t1)
ORI $t4, $zero, 2
BNEC $t3, $t4, next1
ORI $t0, $zero, 1

next1:
LBU $t3, 12($t1)
BNEC $t3, $t4, next2
ORI $t0, $zero, 2

next2:
LBU $t3, -2($t1)
BNEC $t3, $t4, next3
ORI $t0, $zero, 3

next3:
LBU $t3, 0($t1)
BNEC $t3, $t4, done
ORI $t0, $zero, 4

done:
LUI $t1, 0x3
SW $t0, 0($t1)
BC main`
    },
  },
  {
    id: 'level4',
    name: 'Level 4',
    width: 6,
    height: 13,
    tileSize: 48,
    tiles: parseMapFromString(LEVEL4_RAW_MAP),
    playerPosition: { row: 1, col: 1, direction: 'right' },
    ghostPositions: [{ row: 6, col: 2 }],
    waterBackground: { tilesX: 72, tilesY: 71 },
    initialCode: {
      ARM: `main:
LDR R8, =0x30010
MOV R12, #0
scan:
MOV R1, #0
loop:
LDRB R2, [R8], #1
CMP R2, #3
MOVEQ R0, R12
MOVEQ R9, R1
CMP R2, #2
MOVEQ R3, R12
MOVEQ R11, R1
CMP R2, #4
MOVEQ R6, R12
MOVEQ R7, R1
ADD R1, R1, #1
CMP R1, #6
BLT loop
ADD R12, R12, #1
CMP R12, #13
BLT scan
CMP R3, R0
MOVGT R4, #2
MOVLT R4, #1
BNE start
CMP R11, R9
MOVGT R4, #4
MOVLT R4, #3
MOVEQ R4, #4
start:
MOV R3, #4
MOV R11, #0
test:
MOV R5, R0
MOV R10, R9
CMP R4, #1
SUBEQ R5, R5, #1
CMP R4, #2
ADDEQ R5, R5, #1
CMP R4, #3
SUBEQ R10, R10, #1
CMP R4, #4
ADDEQ R10, R10, #1
MOV R2, #6
MUL R8, R5, R2
ADD R8, R8, R10
LDR R1, =0x30010
LDRB R2, [R1, R8]
CMP R2, #0
BEQ next
SUBS R2, R5, R6
RSBMI R2, R2, #0
CMP R2, #2
BGE safe
SUBS R2, R10, R7
RSBMI R2, R2, #0
CMP R2, #2
BLT next
safe:
MOV R11, R4
B done
next:
SUBS R3, R3, #1
BEQ done
ADD R4, R4, #1
CMP R4, #5
MOVEQ R4, #1
B test
done:
CMP R11, #0
MOVNE R4, R11
LDR R1, =0x30000
STR R4, [R1]
B main`,
      MIPS: `main:
LUI $t8, 0x0003
ORI $t8, $t8, 0x0010
LI $s4, 0
scan:
LI $t1, 0
loop:
LBU $t2, 0($t8)
ADDIU $t8, $t8, 1
LI $t5, 3
BNE $t2, $t5, skip1
MOVE $s0, $s4
MOVE $s1, $t1
skip1:
LI $t5, 2
BNE $t2, $t5, skip2
MOVE $s2, $s4
MOVE $s3, $t1
skip2:
LI $t5, 4
BNE $t2, $t5, skip3
MOVE $s6, $s4
MOVE $s7, $t1
skip3:
ADDIU $t1, $t1, 1
SLTI $t5, $t1, 6
BNE $t5, $zero, loop
ADDIU $s4, $s4, 1
SLTI $t5, $s4, 13
BNE $t5, $zero, scan
BEQ $s2, $s0, same_row
SLT $t5, $s0, $s2
BNE $t5, $zero, dir_down
LI $t4, 1
B start
dir_down:
LI $t4, 2
B start
same_row:
BEQ $s3, $s1, dir_right
SLT $t5, $s1, $s3
BNE $t5, $zero, dir_right
LI $t4, 3
B start
dir_right:
LI $t4, 4
start:
LI $t3, 4
LI $s5, 0
test:
MOVE $t5, $s0
MOVE $t9, $s1
LI $t2, 1
BNE $t4, $t2, try2
ADDIU $t5, $t5, -1
try2:
LI $t2, 2
BNE $t4, $t2, try3
ADDIU $t5, $t5, 1
try3:
LI $t2, 3
BNE $t4, $t2, try4
ADDIU $t9, $t9, -1
try4:
LI $t2, 4
BNE $t4, $t2, calc
ADDIU $t9, $t9, 1
calc:
SLL $t8, $t5, 1
ADDU $t8, $t8, $t5
SLL $t8, $t8, 1
ADDU $t8, $t8, $t9
LUI $t1, 0x0003
ORI $t1, $t1, 0x0010
ADDU $t1, $t1, $t8
LBU $t2, 0($t1)
BEQ $t2, $zero, next
SUBU $t2, $t5, $s6
BGEZ $t2, pos_r
SUBU $t2, $zero, $t2
pos_r:
SLTI $t1, $t2, 2
BEQ $t1, $zero, safe
SUBU $t2, $t9, $s7
BGEZ $t2, pos_c
SUBU $t2, $zero, $t2
pos_c:
SLTI $t1, $t2, 2
BNE $t1, $zero, next
safe:
MOVE $s5, $t4
B done
next:
ADDIU $t3, $t3, -1
BEQ $t3, $zero, done
ADDIU $t4, $t4, 1
SLTI $t2, $t4, 5
BNE $t2, $zero, test
LI $t4, 1
B test
done:
BEQ $s5, $zero, write
MOVE $t4, $s5
write:
LUI $t1, 0x0003
ORI $t1, $t1, 0x0000
SW $t4, 0($t1)
B main`,
      MIPS_R6: `main:
LUI $t8, 0x0003
ORI $t8, $t8, 0x0010
ORI $s4, $zero, 0
scan:
ORI $t1, $zero, 0
loop:
LBU $t2, 0($t8)
ADDIU $t8, $t8, 1
ORI $t5, $zero, 3
BNEC $t2, $t5, skip1
OR $s0, $s4, $zero
OR $s1, $t1, $zero
skip1:
ORI $t5, $zero, 2
BNEC $t2, $t5, skip2
OR $s2, $s4, $zero
OR $s3, $t1, $zero
skip2:
ORI $t5, $zero, 4
BNEC $t2, $t5, skip3
OR $s6, $s4, $zero
OR $s7, $t1, $zero
skip3:
ADDIU $t1, $t1, 1
SLTI $t5, $t1, 6
BNEZC $t5, loop
ADDIU $s4, $s4, 1
SLTI $t5, $s4, 13
BNEZC $t5, scan
BEQC $s2, $s0, same_row
SLT $t5, $s0, $s2
BNEZC $t5, dir_down
ORI $t4, $zero, 1
BC start
dir_down:
ORI $t4, $zero, 2
BC start
same_row:
BEQC $s3, $s1, dir_right
SLT $t5, $s1, $s3
BNEZC $t5, dir_right
ORI $t4, $zero, 3
BC start
dir_right:
ORI $t4, $zero, 4
start:
ORI $t3, $zero, 4
ORI $s5, $zero, 0
test:
OR $t5, $s0, $zero
OR $t9, $s1, $zero
ORI $t2, $zero, 1
BNEC $t4, $t2, try2
ADDIU $t5, $t5, -1
try2:
ORI $t2, $zero, 2
BNEC $t4, $t2, try3
ADDIU $t5, $t5, 1
try3:
ORI $t2, $zero, 3
BNEC $t4, $t2, try4
ADDIU $t9, $t9, -1
try4:
ORI $t2, $zero, 4
BNEC $t4, $t2, calc
ADDIU $t9, $t9, 1
calc:
SLL $t8, $t5, 1
ADDU $t8, $t8, $t5
SLL $t8, $t8, 1
ADDU $t8, $t8, $t9
LUI $t1, 0x0003
ORI $t1, $t1, 0x0010
ADDU $t1, $t1, $t8
LBU $t2, 0($t1)
BEQZC $t2, next
SUBU $t2, $t5, $s6
BGEZC $t2, pos_r
SUBU $t2, $zero, $t2
pos_r:
SLTI $t1, $t2, 2
BEQZC $t1, safe
SUBU $t2, $t9, $s7
BGEZC $t2, pos_c
SUBU $t2, $zero, $t2
pos_c:
SLTI $t1, $t2, 2
BNEZC $t1, next
safe:
OR $s5, $t4, $zero
BC done
next:
ADDIU $t3, $t3, -1
BEQZC $t3, done
ADDIU $t4, $t4, 1
SLTI $t2, $t4, 5
BNEZC $t2, test
ORI $t4, $zero, 1
BC test
done:
BEQZC $s5, write
OR $t4, $s5, $zero
write:
LUI $t1, 0x0003
ORI $t1, $t1, 0x0000
SW $t4, 0($t1)
BC main`
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
    ghostPositions: [{ row: 5, col: 8 }, { row: 5, col: 11 }],
    waterBackground: { tilesX: 72, tilesY: 71 },
    initialCode: {
      ARM: `MOV R0, #4
LDR R1, =0x30000
STRB R0, [R1]`,
      MIPS: `LI $t0, 4
LI $t1, 0x30000
SB $t0, 0($t1)`,
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
