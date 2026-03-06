import { GameMap, PlayerDirection, GhostAnimationState } from '@/data/maps'
import { smartPatrolGhostMove, bfsGhostMove, level4GhostMove } from './ghost-agents'

export interface PlayerAnimationState {
  direction: PlayerDirection
  shouldAnimate?: boolean
  animationPosition?: {
    x: number
    y: number
  }
  teleportAnimation?: 'fade-out' | 'fade-in'
}

export interface AnimatedGameState {
  mapState: GameMap
  [key: string]: unknown
}

export const DEBUG_STEP_FRAME_DELAY_MS = 150

export function cloneGameMap(map: GameMap): GameMap {
  return {
    ...map,
    tiles: map.tiles.map((row) => [...row]),
    ghostPositions: map.ghostPositions.map((pos) => ({ ...pos })),
    ghostPreviousPositions: map.ghostPreviousPositions
      ? map.ghostPreviousPositions.map((pos) => ({ ...pos }))
      : undefined,
    playerPosition: map.playerPosition ? { ...map.playerPosition } : map.playerPosition,
    playerAnimation: map.playerAnimation
      ? {
          ...map.playerAnimation,
          animationPosition: map.playerAnimation.animationPosition
            ? { ...map.playerAnimation.animationPosition }
            : undefined
        }
      : undefined,
    ghostAnimations: map.ghostAnimations
      ? map.ghostAnimations.map((animation) =>
          animation
            ? {
                ...animation,
                animationPosition: animation.animationPosition
                  ? { ...animation.animationPosition }
                  : undefined
              }
            : animation
        )
      : undefined,
    dotAnimations: map.dotAnimations ? map.dotAnimations.map((dot) => ({ ...dot })) : undefined,
    waterBackground: map.waterBackground ? { ...map.waterBackground } : undefined
  }
}

export const checkVictoryCondition = (map: GameMap): boolean => {
  for (let row = 0; row < map.height; row++) {
    for (let col = 0; col < map.width; col++) {
      if (map.tiles[row][col] === '.') {
        return false
      }
    }
  }
  return true
}

/**
 * Movement command to direction mapping
 */
export const MOVEMENT_DIRECTIONS: Record<number, PlayerDirection> = {
  1: 'up',
  2: 'down', 
  3: 'left',
  4: 'right'
}

/**
 * Creates player animation state based on movement command
 */
export function createPlayerAnimation(
  command: number,
  shouldAnimate: boolean = true
): PlayerAnimationState {
  return {
    direction: MOVEMENT_DIRECTIONS[command] || 'right',
    shouldAnimate
  }
}

/**
 * Updates map with player movement and animation
 */
export function updateMapWithMovement(
  currentMap: GameMap, 
  command: number
): GameMap {
  // Get current player position from map data
  const playerPosition = currentMap.playerPosition
  if (!playerPosition) return currentMap // No player found

  const playerRow = playerPosition.row
  const playerCol = playerPosition.col

  // Calculate new position
  let newRow = playerRow
  let newCol = playerCol

  switch (command) {
    case 1: newRow = Math.max(0, playerRow - 1); break
    case 2: newRow = Math.min(currentMap.height - 1, playerRow + 1); break
    case 3: newCol = Math.max(0, playerCol - 1); break
    case 4: newCol = Math.min(currentMap.width - 1, playerCol + 1); break
    default: return currentMap
  }

  // Check if new position is valid (not air/wall)
  if (currentMap.tiles[newRow][newCol] === '%') {
    // Cannot move to air/wall, only update direction
    return {
      ...currentMap,
      playerAnimation: createPlayerAnimation(command)
    }
  }

  // Create updated tiles array
  const updatedTiles = currentMap.tiles.map(row => [...row])

  // Check for dot collision and collect it
  if (updatedTiles[newRow][newCol] === '.') {
    updatedTiles[newRow][newCol] = ' ' // Replace dot with grass
  }

  // Get direction for player movement
  let newDirection = playerPosition.direction
  switch (command) {
    case 1: newDirection = 'up'; break
    case 2: newDirection = 'down'; break
    case 3: newDirection = 'left'; break
    case 4: newDirection = 'right'; break
  }

  return {
    ...currentMap,
    tiles: updatedTiles,
    playerPosition: {
      row: newRow,
      col: newCol,
      direction: newDirection
    },
    playerAnimation: createPlayerAnimation(command)
  }
}

/**
 * Ensures any game state has proper animation state for smooth transitions
 */
export function ensurePlayerAnimation<T extends AnimatedGameState>(
  state: T,
  defaultDirection: PlayerDirection = 'right'
): T {
  return {
    ...state,
    mapState: {
      ...state.mapState,
      playerAnimation: {
        ...state.mapState.playerAnimation,
        direction: state.mapState.playerAnimation?.direction || defaultDirection,
        shouldAnimate: true
      }
    }
  }
}


/**
 * Creates ghost animation state based on movement
 */
export function createGhostAnimation(): GhostAnimationState {
  return {
    shouldAnimate: true
  };
}

/**
 * Creates teleport animation for ghosts
 */
export function createGhostTeleportAnimation(
  direction: PlayerDirection,
  animationType: 'fade-out' | 'fade-in'
): GhostAnimationState {
  return {
    direction,
    teleportAnimation: animationType
  };
}

/**
 * Checks for collision between player and ghosts
 */
function checkCollision(
  currentPlayerPos: {row: number, col: number}, 
  newPlayerPos: {row: number, col: number},
  currentGhostPositions: {row: number, col: number}[],
  nextGhostPositions: {row: number, col: number}[]
): { hasCollision: boolean, collisionType: 'same-position' | 'position-swap' | null } {
  // Check if player and any ghost will be at the same position
  for (let i = 0; i < nextGhostPositions.length; i++) {
    const nextGhostPos = nextGhostPositions[i];
    if (newPlayerPos.row === nextGhostPos.row && newPlayerPos.col === nextGhostPos.col) {
      return { hasCollision: true, collisionType: 'same-position' };
    }
  }
  
  // Check for position swapping (player and ghost exchange positions)
  for (let i = 0; i < currentGhostPositions.length; i++) {
    const currentGhostPos = currentGhostPositions[i];
    const nextGhostPos = nextGhostPositions[i];
    
    if (currentPlayerPos.row === nextGhostPos.row && 
        currentPlayerPos.col === nextGhostPos.col &&
        newPlayerPos.row === currentGhostPos.row && 
        newPlayerPos.col === currentGhostPos.col) {
      return { hasCollision: true, collisionType: 'position-swap' };
    }
  }
  
  return { hasCollision: false, collisionType: null };
}

/**
 * Updates both ghost and player positions together
 * Ghosts make decisions based on current state, then both move simultaneously
 */
export function updateMapWithMovementAndGhosts(
  currentMap: GameMap, 
  command: number
): GameMap {
  // First, let ghosts decide their next moves based on current state
  // Calculate first ghost's move first, then pass its position to second ghost for pincer attack
  const nextGhostPositions: typeof currentMap.ghostPositions = [];

  for (let index = 0; index < currentMap.ghostPositions.length; index++) {
    const ghost = currentMap.ghostPositions[index];
    const previousPos = currentMap.ghostPreviousPositions?.[index];

    // Check if this is Level 4 (single ghost in open space)
    if (currentMap.id === 'level4') {
      nextGhostPositions.push(level4GhostMove(currentMap, ghost, previousPos));
    } else if (index === 0) {
      // First ghost: A* direct pursuit
      nextGhostPositions.push(smartPatrolGhostMove(currentMap, ghost, currentMap.playerPosition, previousPos));
    } else {
      // Second ghost: 50% A* chase, 50% random
      nextGhostPositions.push(bfsGhostMove(currentMap, ghost, currentMap.playerPosition));
    }
  }

  // Then move player and apply ghost movements simultaneously
  const playerPosition = currentMap.playerPosition;
  if (!playerPosition) return currentMap;

  // Calculate new player position
  let newRow = playerPosition.row;
  let newCol = playerPosition.col;
  let newDirection = playerPosition.direction;

  switch (command) {
    case 1: newRow = Math.max(0, playerPosition.row - 1); newDirection = 'up'; break;
    case 2: newRow = Math.min(currentMap.height - 1, playerPosition.row + 1); newDirection = 'down'; break;
    case 3: newCol = Math.max(0, playerPosition.col - 1); newDirection = 'left'; break;
    case 4: newCol = Math.min(currentMap.width - 1, playerPosition.col + 1); newDirection = 'right'; break;
  }

  // Check for collision FIRST before wall check - even if player hits wall, ghost can still collide
  const newPlayerPos = { row: newRow, col: newCol };
  const collisionResult = checkCollision(
    playerPosition, 
    newPlayerPos, 
    currentMap.ghostPositions, 
    nextGhostPositions
  );

  // Check if new player position is valid (not air/wall)
  if (currentMap.tiles[newRow][newCol] === '%') {
    // Check collision even when hitting wall - ghost might move to player's current position
    const wallCollisionResult = checkCollision(
      playerPosition, 
      playerPosition, // Player doesn't move when hitting wall
      currentMap.ghostPositions, 
      nextGhostPositions
    );
    
    if (wallCollisionResult.hasCollision) {
      const ghostAnimations = nextGhostPositions.map(() => createGhostAnimation());

      const gameOverMap = {
        ...currentMap,
        ghostPositions: nextGhostPositions,
        ghostPreviousPositions: currentMap.ghostPositions,
        playerAnimation: {
          direction: MOVEMENT_DIRECTIONS[command] || 'right',
          teleportAnimation: 'fade-out' as const // Player disappears
        },
        ghostAnimations: ghostAnimations,
        gameOver: true // Add game over state
      };
      
      return gameOverMap;
    }
    
    // Cannot move to air/wall, only update direction and move ghosts
    const ghostAnimations = nextGhostPositions.map(() => createGhostAnimation());

    return {
      ...currentMap,
      ghostPositions: nextGhostPositions,
      ghostPreviousPositions: currentMap.ghostPositions, // Save current positions as previous
      playerAnimation: createPlayerAnimation(command),
      ghostAnimations: ghostAnimations
    };
  }

  if (collisionResult.hasCollision) {
    // Create ghost animations based on movement
    const ghostAnimations = nextGhostPositions.map(() => createGhostAnimation());

    let playerFinalPosition, playerAnimation;
    
    if (collisionResult.collisionType === 'same-position') {
      // Same position collision: player moves to target position and disappears there
      playerFinalPosition = {
        row: newRow,
        col: newCol,
        direction: newDirection
      };
      playerAnimation = {
        direction: newDirection,
        shouldAnimate: true,
        teleportAnimation: 'fade-out' as const
      };
    } else {
      // Position swap collision: player disappears at halfway point
      playerFinalPosition = {
        row: playerPosition.row, // Stay at original position
        col: playerPosition.col,
        direction: newDirection
      };
      playerAnimation = {
        direction: newDirection,
        shouldAnimate: true,
        animationPosition: { // Show 1/3 position
          x: (playerPosition.col + (newCol - playerPosition.col) * 0.33) * (currentMap.tileSize || 20),
          y: (playerPosition.row + (newRow - playerPosition.row) * 0.33) * (currentMap.tileSize || 20)
        },
        teleportAnimation: 'fade-out' as const
      };
    }

    const collisionMap = {
      ...currentMap,
      // tiles unchanged - player doesn't affect target tile (no dot collection)
      playerPosition: playerFinalPosition,
      ghostPositions: nextGhostPositions,
      ghostPreviousPositions: currentMap.ghostPositions,
      playerAnimation: playerAnimation,
      ghostAnimations: ghostAnimations,
      gameOver: true // Mark as game over
    };
    
    return collisionMap;
  }

  // Create updated tiles array
  const updatedTiles = currentMap.tiles.map(row => [...row]);

  // Check for dot collision and collect it
  if (updatedTiles[newRow][newCol] === '.') {
    updatedTiles[newRow][newCol] = ' '; // Replace dot with grass
  }

  // Create ghost animations based on movement
  const ghostAnimations = nextGhostPositions.map(() => createGhostAnimation());

  return {
    ...currentMap,
    tiles: updatedTiles,
    playerPosition: {
      row: newRow,
      col: newCol,
      direction: newDirection
    },
    ghostPositions: nextGhostPositions,
    ghostPreviousPositions: currentMap.ghostPositions, // Save current positions as previous
    playerAnimation: createPlayerAnimation(command),
    ghostAnimations: ghostAnimations
  };
}

/**
 * Updates only ghost positions (for cases where player doesn't move)
 */
export function updateGhostsOnly(mapState: GameMap): GameMap {
  if (!mapState.ghostPositions || mapState.ghostPositions.length === 0) {
    return mapState;
  }

  const pacmanPosition = mapState.playerPosition;
  if (!pacmanPosition) {
    return mapState;
  }

  // Update ghost positions using the two algorithms
  const updatedGhostPositions = mapState.ghostPositions.map((ghost, index) => {
    const previousPos = mapState.ghostPreviousPositions?.[index];
    
    // Check if this is Level 4 (single ghost in open space)
    if (mapState.id === 'level4') {
      return level4GhostMove(mapState, ghost, previousPos);
    }
    
    if (index === 0) {
      // First ghost: Smart patrol movement
      return smartPatrolGhostMove(mapState, ghost, pacmanPosition, previousPos);
    } else {
      // Second ghost: BFS optimal pursuit
      return bfsGhostMove(mapState, ghost, pacmanPosition);
    }
  });

  // Create ghost animations based on movement
  const ghostAnimations = updatedGhostPositions.map(() => createGhostAnimation());

  return {
    ...mapState,
    ghostPositions: updatedGhostPositions,
    ghostPreviousPositions: mapState.ghostPositions, // Save current positions as previous
    ghostAnimations: ghostAnimations
  };
}
