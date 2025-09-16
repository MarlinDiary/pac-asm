// Map information memory layout and writing utilities

import { GameMap, TileSymbol } from '@/data/maps'
import { getGlobalSettings } from '@/hooks/useSettings'

/**
 * Simplified memory layout for map data:
 * 
 * 0x30004: Map width (4 bytes, endian depends on architecture)
 * 0x30008: Map height (4 bytes, endian depends on architecture)
 * 0x30010: Map tiles start (width * height bytes)
 *   Each tile: 1 byte representing the current tile type with entities
 */

export const MAP_MEMORY_LAYOUT = {
  // Memory addresses (absolute)
  WIDTH_ADDRESS: 0x30004,
  HEIGHT_ADDRESS: 0x30008,
  MAP_BASE_ADDRESS: 0x30010,
  
  // Offsets from DATA_BASE
  WIDTH_OFFSET: 0x0004,
  HEIGHT_OFFSET: 0x0008,
  MAP_BASE_OFFSET: 0x0010,
} as const

/**
 * Tile type encoding for memory storage
 */
export const TILE_ENCODING = {
  'air': 0,      // % - wall/air
  'grass': 1,    // space - empty grass
  'dot': 2,      // . - collectible dot
  'player': 3,   // P - player position
  'ghost': 4,    // G - ghost position
} as const


/**
 * Convert a tile symbol to its encoded byte value
 */
function encodeTile(tileSymbol: TileSymbol): number {
  const tileType = {
    '%': 'air',
    ' ': 'grass', 
    '.': 'dot'
  }[tileSymbol] as keyof typeof TILE_ENCODING
  
  return TILE_ENCODING[tileType] || 0 // Default to wall if unknown
}

/**
 * Create a map with player and ghost positions overlaid onto the base tiles
 */
function createRuntimeMap(map: GameMap): number[] {
  const { width, height, tiles, playerPosition, ghostPositions } = map
  
  // Start with base tiles
  const runtimeTiles = tiles.map(row => 
    row.map(tile => encodeTile(tile))
  )
  
  // Place ghosts first (so player can override if on same position)
  ghostPositions.forEach(ghost => {
    if (ghost.row >= 0 && ghost.row < height && ghost.col >= 0 && ghost.col < width) {
      runtimeTiles[ghost.row][ghost.col] = TILE_ENCODING.ghost
    }
  })
  
  // Place player (overrides ghost if on same position)
  if (playerPosition.row >= 0 && playerPosition.row < height && 
      playerPosition.col >= 0 && playerPosition.col < width) {
    runtimeTiles[playerPosition.row][playerPosition.col] = TILE_ENCODING.player
  }
  
  // Flatten to 1D array
  return runtimeTiles.flat()
}

/**
 * Convert 32-bit integer to byte array using selected endianness.
 * ARM uses little-endian. MIPS (our target) uses big-endian.
 */
function toEndian32(value: number): number[] {
  const arch = getGlobalSettings().settings.architecture
  if (arch === 'MIPS') {
    // Big-endian: most-significant byte first
    return [
      (value >> 24) & 0xFF,
      (value >> 16) & 0xFF,
      (value >> 8) & 0xFF,
      value & 0xFF,
    ]
  }
  // Little-endian: least-significant byte first (ARM)
  return [
    value & 0xFF,
    (value >> 8) & 0xFF,
    (value >> 16) & 0xFF,
    (value >> 24) & 0xFF,
  ]
}

/**
 * Generate complete map memory data for first-time writing to emulator
 */
export function generateMapMemoryData(map: GameMap): { address: number; data: number[] }[] {
  const { width, height } = map
  const runtimeTiles = createRuntimeMap(map)
  
  return [
    // Write width at 0x30004
    {
      address: MAP_MEMORY_LAYOUT.WIDTH_ADDRESS,
      data: toEndian32(width)
    },
    // Write height at 0x30008 
    {
      address: MAP_MEMORY_LAYOUT.HEIGHT_ADDRESS,
      data: toEndian32(height)
    },
    // Write map tiles at 0x30010
    {
      address: MAP_MEMORY_LAYOUT.MAP_BASE_ADDRESS,
      data: runtimeTiles
    }
  ]
}

/**
 * Generate only tile data for incremental updates (dimensions never change)
 */
export function generateMapTileData(map: GameMap): { address: number; data: number[] } {
  const runtimeTiles = createRuntimeMap(map)
  
  return {
    address: MAP_MEMORY_LAYOUT.MAP_BASE_ADDRESS,
    data: runtimeTiles
  }
}

/**
 * Write complete map data to emulator memory (first round)
 */
export async function writeCompleteMapToMemory(
  emulator: { writeMemory(address: number, data: number[]): Promise<boolean> },
  map: GameMap
): Promise<boolean> {
  const memoryWrites = generateMapMemoryData(map)
  
  try {
    for (const write of memoryWrites) {
      const success = await emulator.writeMemory(write.address, write.data)
      if (!success) {
        console.error(`Failed to write to address 0x${write.address.toString(16)}`)
        return false
      }
    }
    return true
  } catch (error) {
    console.error('Failed to write map data to memory:', error)
    return false
  }
}

/**
 * Calculate tile differences between two maps
 * Note: Map dimensions are guaranteed to be the same within a level
 */
function calculateTileDifferences(oldMap: GameMap, newMap: GameMap): { offset: number; value: number }[] {
  const oldTiles = createRuntimeMap(oldMap)
  const newTiles = createRuntimeMap(newMap)
  const differences: { offset: number; value: number }[] = []
  
  // Compare all tiles (dimensions are guaranteed to be the same)
  for (let i = 0; i < oldTiles.length && i < newTiles.length; i++) {
    if (oldTiles[i] !== newTiles[i]) {
      differences.push({ offset: i, value: newTiles[i] })
    }
  }
  
  return differences
}

/**
 * Write only changed tiles to emulator memory (subsequent rounds)
 * Note: Map dimensions never change within the same level
 */
export async function writeMapUpdatesToMemory(
  emulator: { writeMemory(address: number, data: number[]): Promise<boolean> },
  oldMap: GameMap,
  newMap: GameMap
): Promise<boolean> {
  try {
    // Calculate tile differences (dimensions are guaranteed to be the same)
    const tileDifferences = calculateTileDifferences(oldMap, newMap)
    
    if (tileDifferences.length === 0) {
      return true // No changes needed
    }
    
    
    // Write each changed tile individually
    for (const diff of tileDifferences) {
      const address = MAP_MEMORY_LAYOUT.MAP_BASE_ADDRESS + diff.offset
      const success = await emulator.writeMemory(address, [diff.value])
      if (!success) {
        console.error(`Failed to update tile at offset ${diff.offset}`)
        return false
      }
    }
    
    return true
  } catch (error) {
    console.error('Failed to write map updates to memory:', error)
    return false
  }
}

/**
 * Backward compatibility alias
 */
export const writeMapToMemory = writeCompleteMapToMemory
