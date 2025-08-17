import { GameMap } from '@/data/maps'
import { checkVictoryCondition } from '@/lib/game-logic'
import { updateMapWithMovementAndGhosts, updateGhostsOnly } from '@/lib/game-animation'
import { resetAndReloadCode, getEmulatorMemoryState, MEMORY_CONFIG } from '@/lib/emulator-utils'
import { writeMapUpdatesToMemory } from './map-memory'
import { RegisterInfo } from '@/workers/emulator/types'

export interface MemoryState {
  registers: RegisterInfo[]
  codeMemory: number[]
  stackMemory: number[]
  dataMemory: number[]
}

export interface CycleEndResult {
  newMapState: GameMap
  isGameComplete: boolean
  shouldContinue: boolean
  memoryState?: MemoryState | null
  hasError?: boolean // For collision detection
}

// Type for emulator objects (avoiding 'any')
interface EmulatorInstance {
  state: { isInitialized: boolean }
  initializeEmulator(): Promise<void>
  reset(): Promise<void>
  writeMemory(address: number, data: number[]): Promise<boolean>
  loadCode(code: number[]): Promise<void>
  getAllRegisters(): Promise<RegisterInfo[] | null>
  getMemory(address: number, size: number): Promise<{ data: number[] } | null>
}

export interface CycleEndOptions {
  emulator: EmulatorInstance
  currentMapState: GameMap
  previousMapState?: GameMap
  originalMachineCode?: number[]
  skipEmulatorReset?: boolean
  isDebugMode?: boolean // To distinguish between debug and play modes
}

/**
 * Check if there's a valid movement command in data memory
 */
export function hasValidMovementCommand(dataMemory: number[]): boolean {
  return dataMemory && dataMemory[0] >= 1 && dataMemory[0] <= 4
}

/**
 * Process movement from memory and update map state
 */
export function processMovementFromMemory(
  mapState: GameMap, 
  dataMemory: number[]
): GameMap {
  if (hasValidMovementCommand(dataMemory)) {
    return updateMapWithMovementAndGhosts(mapState, dataMemory[0])
  } else {
    // If no player movement, still move ghosts
    return updateGhostsOnly(mapState)
  }
}

/**
 * Handle end of code execution cycle - common logic for both debug and play modes
 */
export async function handleCycleEnd(options: CycleEndOptions): Promise<CycleEndResult> {
  const { emulator, currentMapState, previousMapState, originalMachineCode, skipEmulatorReset = false, isDebugMode = false } = options
  
  // Get current memory state to check for movement commands
  const memoryState = await getEmulatorMemoryState(emulator)
  
  // Process any movement commands and ghost movements
  let newMapState = currentMapState
  if (memoryState && hasValidMovementCommand(memoryState.dataMemory)) {
    newMapState = updateMapWithMovementAndGhosts(currentMapState, memoryState.dataMemory[0])
  } else {
    // If no player movement, still move ghosts
    newMapState = updateGhostsOnly(currentMapState)
  }
  
  // Check for game over (collision)
  if (newMapState.gameOver) {
    // Game over should end the game in both debug and play modes
    return {
      newMapState,
      isGameComplete: true, // End the game
      shouldContinue: false, // Stop execution
      hasError: !isDebugMode // Mark as error only in play mode
    }
  }
  
  // Check victory condition
  const isGameComplete = checkVictoryCondition(newMapState)
  
  // Reset emulator for next cycle if game is not complete and machine code is provided
  if (!isGameComplete && !skipEmulatorReset && originalMachineCode) {
    await resetAndReloadCode(emulator, originalMachineCode)
    
    // Update map data in memory for next cycle
    if (previousMapState) {
      await writeMapUpdatesToMemory(emulator, previousMapState, newMapState)
    }
  }
  
  return {
    newMapState,
    isGameComplete,
    shouldContinue: !isGameComplete,
    memoryState
  }
}

/**
 * Handle cycle end specifically for debug mode
 */
export async function handleDebugCycleEnd(
  emulator: EmulatorInstance,
  currentMapState: GameMap,
  previousMapState: GameMap,
  originalMachineCode: number[],
  setIsGameComplete: (complete: boolean) => void
): Promise<CycleEndResult> {
  const result = await handleCycleEnd({
    emulator,
    currentMapState,
    previousMapState,
    originalMachineCode,
    isDebugMode: true
  })
  
  // Set game complete state for debug mode
  if (result.isGameComplete) {
    setIsGameComplete(true)
  }
  
  return result
}

/**
 * Handle cycle end specifically for play mode
 */
export async function handlePlayCycleEnd(
  emulator: EmulatorInstance,
  currentMapState: GameMap,
  previousMapState?: GameMap
): Promise<CycleEndResult> {
  return await handleCycleEnd({
    emulator,
    currentMapState,
    previousMapState,
    skipEmulatorReset: true, // Play mode handles reset differently
    isDebugMode: false
  })
}

/**
 * Clear movement command from data memory after processing
 */
export async function clearMovementCommand(emulator: EmulatorInstance): Promise<void> {
  await emulator.writeMemory(MEMORY_CONFIG.DATA_BASE, [0])
}

/**
 * Check if code execution has ended based on step result
 */
export function isCodeExecutionComplete(stepResult: { message?: string }): boolean {
  return stepResult?.message?.includes('Execution completed') ||
         stepResult?.message?.includes('reached end of code') ||
         stepResult?.message?.includes('no more instructions') ||
         false
}