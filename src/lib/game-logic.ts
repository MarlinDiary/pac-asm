import { GameMap, getPlayerPosition } from '@/data/maps'

export interface PlayerMovement {
  newRow: number
  newCol: number
  newDirection: 'up' | 'down' | 'left' | 'right'
  collectedDot: boolean
  updatedMap: GameMap
}

export const movePlayer = async (
  currentMap: GameMap,
  command: number
): Promise<PlayerMovement | null> => {
  const playerPos = getPlayerPosition(currentMap)
  if (!playerPos) return null
  
  let newRow = playerPos.row
  let newCol = playerPos.col
  let newDirection = playerPos.direction
  
  switch (command) {
    case 1: // Up
      newRow = Math.max(0, newRow - 1)
      newDirection = 'up'
      break
    case 2: // Down  
      newRow = Math.min(currentMap.height - 1, newRow + 1)
      newDirection = 'down'
      break
    case 3: // Left
      newCol = Math.max(0, newCol - 1)
      newDirection = 'left'
      break
    case 4: // Right
      newCol = Math.min(currentMap.width - 1, newCol + 1)
      newDirection = 'right'
      break
    default:
      return null
  }
  
  // Create updated tiles array
  const updatedTiles = currentMap.tiles.map(row => [...row])
  
  // Check for dot collision and collect it
  let collectedDot = false
  if (updatedTiles[newRow][newCol] === '.') {
    collectedDot = true
    updatedTiles[newRow][newCol] = ' ' // Replace dot with grass
  }
  
  const updatedMap = {
    ...currentMap,
    tiles: updatedTiles,
    playerPosition: {
      row: newRow,
      col: newCol,
      direction: newDirection
    }
  }
  
  return {
    newRow,
    newCol,
    newDirection,
    collectedDot,
    updatedMap
  }
}

export const handleDotCollection = (
  setCurrentMap: (mapOrUpdater: GameMap | ((prevMap: GameMap) => GameMap)) => void,
  row: number,
  col: number
) => {
  setTimeout(() => {
    setCurrentMap(prevMap => {
      const updatedTiles = prevMap.tiles.map(tileRow => [...tileRow])
      if (updatedTiles[row][col] === '.') {
        updatedTiles[row][col] = ' ' // Replace dot with grass
      }
      return {
        ...prevMap,
        tiles: updatedTiles
      }
    })
  }, 200)
}

// Victory condition checking
export const checkVictoryCondition = (map: GameMap): boolean => {
  // Check if there are any dots left in the tiles array
  for (let row = 0; row < map.height; row++) {
    for (let col = 0; col < map.width; col++) {
      if (map.tiles[row][col] === '.') {
        return false // Found a dot, game not won yet
      }
    }
  }
  return true // No dots found, game won
}


// Game state management interface  
export interface GameVictoryState {
  hasWon: boolean // Permanent victory status (shows Next button)
  currentPlayWon: boolean // Current play victory status (shows confetti)
}

// Victory handler - processes victory condition and updates states
export const handleVictoryCheck = (
  map: GameMap,
  setHasWon: (won: boolean) => void,
  setCurrentPlayWon: (won: boolean) => void,
  isPlayMode: boolean
): boolean => {
  if (isPlayMode && checkVictoryCondition(map)) {
    setHasWon(true) // Permanent victory status
    setCurrentPlayWon(true) // This play victory status
    return true
  }
  return false
}
