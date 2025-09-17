/**
 * Ghost Agents - Simplified AI algorithms for balanced ghost movement
 */

import { GameMap } from '@/data/maps';

export interface Position {
  row: number;
  col: number;
}

/**
 * Check if a position is valid for movement (not air/wall)
 */
function isValidPosition(map: GameMap, row: number, col: number): boolean {
  if (row < 0 || row >= map.height || col < 0 || col >= map.width) {
    return false;
  }
  return map.tiles[row][col] !== '%';
}

/**
 * Get all valid adjacent positions from current position
 */
function getValidMoves(map: GameMap, position: Position): Position[] {
  const moves: Position[] = [];
  const directions = [
    { row: -1, col: 0 }, // up
    { row: 1, col: 0 },  // down
    { row: 0, col: -1 }, // left
    { row: 0, col: 1 }   // right
  ];

  for (const dir of directions) {
    const newRow = position.row + dir.row;
    const newCol = position.col + dir.col;
    if (isValidPosition(map, newRow, newCol)) {
      moves.push({ row: newRow, col: newCol });
    }
  }

  return moves;
}

/**
 * Algorithm 1: Simple random movement with momentum
 * Much less intelligent - mostly random with slight preference for continuing straight
 */
export function smartPatrolGhostMove(map: GameMap, ghostPosition: Position, pacmanPosition: Position, previousPosition?: Position): Position {
  const validMoves = getValidMoves(map, ghostPosition);
  
  if (validMoves.length === 0) {
    return ghostPosition;
  }
  
  // 70% chance to move randomly, 30% chance to use simple logic
  if (Math.random() < 0.7) {
    // Pure random movement
    return validMoves[Math.floor(Math.random() * validMoves.length)];
  }
  
  // Simple logic: slight preference for continuing straight, avoid backtracking
  let currentDirection: {row: number, col: number} | null = null;
  if (previousPosition) {
    currentDirection = {
      row: ghostPosition.row - previousPosition.row,
      col: ghostPosition.col - previousPosition.col
    };
  }
  
  const moveScores = validMoves.map(move => {
    let score = Math.random() * 100; // Heavy randomness
    
    // Slight preference for continuing straight
    if (currentDirection) {
      const moveDirection = {
        row: move.row - ghostPosition.row,
        col: move.col - ghostPosition.col
      };
      
      if (moveDirection.row === currentDirection.row && moveDirection.col === currentDirection.col) {
        score += 20; // Reduced from 50
      }
    }
    
    // Avoid going back to previous position
    if (previousPosition && move.row === previousPosition.row && move.col === previousPosition.col) {
      score -= 30; // Reduced from 100
    }
    
    return { move, score };
  });
  
  moveScores.sort((a, b) => b.score - a.score);
  return moveScores[0].move;
}

/**
 * Algorithm 2: Moderate pursuit 
 * 70% chase behavior, 30% random movement
 */
export function bfsGhostMove(map: GameMap, ghostPosition: Position, pacmanPosition: Position): Position {
  const validMoves = getValidMoves(map, ghostPosition);
  
  if (validMoves.length === 0) {
    return ghostPosition;
  }
  
  // 30% chance to move completely randomly
  if (Math.random() < 0.3) {
    return validMoves[Math.floor(Math.random() * validMoves.length)];
  }
  
  // 70% chance to pursue pacman
  const moveScores = validMoves.map(move => {
    let score = Math.random() * 20; // Reduced base randomness
    
    // Simple distance calculation - prefer moves that get closer to pacman
    const currentDistance = Math.abs(ghostPosition.row - pacmanPosition.row) + 
                           Math.abs(ghostPosition.col - pacmanPosition.col);
    const newDistance = Math.abs(move.row - pacmanPosition.row) + 
                       Math.abs(move.col - pacmanPosition.col);
    
    if (newDistance < currentDistance) {
      score += 60; // Stronger bonus for getting closer
    } else if (newDistance > currentDistance) {
      score -= 20; // Penalty for getting farther
    }
    
    return { move, score };
  });
  
  moveScores.sort((a, b) => b.score - a.score);
  return moveScores[0].move; // Take the best move
}

// Store ghost history for Level 4
const level4GhostHistory: Position[] = [];
// Persist initial row for Level 4 ghost (set on first use, reset on level reset)
let level4InitialRow: number | null = null;

/**
 * Algorithm 3: Level 4 specific - row-based movement
 * Ghost moves only along its initial row (random left/right), never up/down.
 */
export function level4GhostMove(map: GameMap, ghostPosition: Position): Position {
  // Level 4 rule: ghost moves only along its initial row (random left/right), never up/down.
  // Record initial row at first call
  if (level4InitialRow === null) {
    level4InitialRow = ghostPosition.row;
  }

  const row = level4InitialRow;
  const candidates: Position[] = [];
  const left = { row, col: ghostPosition.col - 1 };
  const right = { row, col: ghostPosition.col + 1 };

  if (isValidPosition(map, left.row, left.col)) candidates.push(left);
  if (isValidPosition(map, right.row, right.col)) candidates.push(right);

  if (candidates.length === 0) return ghostPosition;

  const next = candidates[Math.floor(Math.random() * candidates.length)];

  level4GhostHistory.push(next);
  if (level4GhostHistory.length > 20) level4GhostHistory.shift();

  return next;
}
