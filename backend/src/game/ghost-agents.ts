/**
 * Ghost Agents - AI algorithms for ghost movement
 */

import { GameMap } from './maps';

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
 * A* pathfinding algorithm
 * Returns the next position to move towards the target
 */
function aStarNextMove(map: GameMap, start: Position, target: Position): Position | null {
  const posKey = (p: Position) => `${p.row},${p.col}`;

  // Heuristic: Manhattan distance (admissible for grid movement)
  const heuristic = (a: Position, b: Position) =>
    Math.abs(a.row - b.row) + Math.abs(a.col - b.col);

  // Already at target
  if (start.row === target.row && start.col === target.col) {
    return start;
  }

  // gScore: cost from start to this node
  const gScore = new Map<string, number>();
  // fScore: gScore + heuristic estimate to goal
  const fScore = new Map<string, number>();
  // cameFrom: to reconstruct path
  const cameFrom = new Map<string, Position>();

  const startKey = posKey(start);
  gScore.set(startKey, 0);
  fScore.set(startKey, heuristic(start, target));

  // Open set with positions to explore
  const openSet = new Set<string>([startKey]);
  // Closed set to avoid re-expanding visited nodes
  const closedSet = new Set<string>();
  // Map key to position for retrieval
  const keyToPos = new Map<string, Position>([[startKey, start]]);

  while (openSet.size > 0) {
    // Find node in openSet with lowest fScore
    let currentKey: string | null = null;
    let lowestF = Infinity;
    for (const key of openSet) {
      const f = fScore.get(key) ?? Infinity;
      if (f < lowestF) {
        lowestF = f;
        currentKey = key;
      }
    }

    if (currentKey === null) break;

    const current = keyToPos.get(currentKey)!;

    // Skip nodes already processed
    if (closedSet.has(currentKey)) {
      continue;
    }

    // Reached target - reconstruct path and return first step
    if (current.row === target.row && current.col === target.col) {
      const path: Position[] = [];
      let pathKey = currentKey;
      while (cameFrom.has(pathKey)) {
        path.unshift(keyToPos.get(pathKey)!);
        const prevPos = cameFrom.get(pathKey)!;
        pathKey = posKey(prevPos);
      }
      return path.length > 0 ? path[0] : null;
    }

    openSet.delete(currentKey);
    closedSet.add(currentKey);

    // Explore neighbors
    const neighbors = getValidMoves(map, current);
    for (const neighbor of neighbors) {
      const neighborKey = posKey(neighbor);
      if (closedSet.has(neighborKey)) continue;

      const tentativeG = (gScore.get(currentKey) ?? Infinity) + 1;

      if (tentativeG < (gScore.get(neighborKey) ?? Infinity)) {
        // This path is better
        cameFrom.set(neighborKey, current);
        gScore.set(neighborKey, tentativeG);
        fScore.set(neighborKey, tentativeG + heuristic(neighbor, target));
        keyToPos.set(neighborKey, neighbor);

        if (!openSet.has(neighborKey)) {
          openSet.add(neighborKey);
        }
      }
    }
  }

  return null; // No path found
}

/**
 * Algorithm 1: A* pathfinding - follows the shortest path to Pacman
 */
export function smartPatrolGhostMove(map: GameMap, ghostPosition: Position, pacmanPosition: Position, _previousPosition?: Position): Position {
  const validMoves = getValidMoves(map, ghostPosition);

  if (validMoves.length === 0) {
    return ghostPosition;
  }

  // Use A* to find best move
  const nextMove = aStarNextMove(map, ghostPosition, pacmanPosition);
  if (nextMove) {
    return nextMove;
  }

  // Deterministic fallback using the fixed move ordering from getValidMoves.
  return validMoves[0];
}

/**
 * Algorithm 2: mostly A* chase with a small amount of randomness.
 * On the random branch, the ghost takes a legal move that is different from
 * the A* choice when such a move exists.
 */
export function mixedPursuitGhostMove(map: GameMap, ghostPosition: Position, pacmanPosition: Position): Position {
  const validMoves = getValidMoves(map, ghostPosition);

  if (validMoves.length === 0) {
    return ghostPosition;
  }

  const nextMove = aStarNextMove(map, ghostPosition, pacmanPosition);

  if (Math.random() < 0.2) {
    const alternatives = validMoves.filter((move) =>
      !nextMove ||
      move.row !== nextMove.row ||
      move.col !== nextMove.col
    );

    if (alternatives.length > 0) {
      return alternatives[Math.floor(Math.random() * alternatives.length)];
    }
  }

  if (nextMove) {
    return nextMove;
  }

  return validMoves[0];
}

/**
 * Algorithm 3: Level 4 specific - row-based movement
 * Ghost moves only along its current row. It pauses 25% of the time, but
 * never on consecutive turns, to break deterministic parity exploits.
 */
export function level4GhostMove(map: GameMap, ghostPosition: Position, previousPosition?: Position): Position {
  const row = ghostPosition.row;
  const candidates: Position[] = [];
  const left = { row, col: ghostPosition.col - 1 };
  const right = { row, col: ghostPosition.col + 1 };

  if (isValidPosition(map, left.row, left.col)) candidates.push(left);
  if (isValidPosition(map, right.row, right.col)) candidates.push(right);

  if (candidates.length === 0) return ghostPosition;

  const previousWasPause = Boolean(
    previousPosition &&
    previousPosition.row === ghostPosition.row &&
    previousPosition.col === ghostPosition.col
  );

  if (!previousWasPause && Math.random() < 0.25) {
    return ghostPosition;
  }

  return candidates[Math.floor(Math.random() * candidates.length)];
}
