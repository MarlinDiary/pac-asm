import { ARMAssembler } from '@/lib/assembler'
import { CodeHighlighter, createHighlighter } from '@/lib/highlighter'
import { RegisterInfo } from '@/workers/emulator/types'
import { GameMap } from '@/data/maps'
import { writeCompleteMapToMemory } from './map-memory'

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

export interface EmulatorInitResult {
  codeHighlighter: CodeHighlighter
  machineCode: number[]
}

/**
 * Standard memory layout configuration
 */
export const MEMORY_CONFIG = {
  CODE_BASE: 0x10000,
  STACK_BASE: 0x20000,
  DATA_BASE: 0x30000,
  MEMORY_SIZE: 1024
} as const

/**
 * Initialize emulator if not already initialized
 */
export async function ensureEmulatorInitialized(emulator: EmulatorInstance): Promise<void> {
  if (!emulator.state.isInitialized) {
    await emulator.initializeEmulator()
  }
}

/**
 * Reset emulator and initialize all memory regions to zero
 */
export async function resetEmulatorWithMemory(emulator: EmulatorInstance): Promise<void> {
  await emulator.reset()
  
  // Initialize memory regions
  const zeroData = new Array(MEMORY_CONFIG.MEMORY_SIZE).fill(0)
  await emulator.writeMemory(MEMORY_CONFIG.CODE_BASE, zeroData)
  await emulator.writeMemory(MEMORY_CONFIG.STACK_BASE, zeroData)
  await emulator.writeMemory(MEMORY_CONFIG.DATA_BASE, zeroData)
}

/**
 * Assemble source code and return machine code
 */
export async function assembleCode(sourceCode: string): Promise<number[]> {
  const assembler = new ARMAssembler()
  try {
    await assembler.initialize()
    const result = await assembler.assemble(sourceCode)
    return Array.from(result.mc)
  } finally {
    assembler.destroy()
  }
}

/**
 * Reset emulator registers only (preserve memory data)
 */
async function resetEmulatorRegistersOnly(emulator: EmulatorInstance): Promise<void> {
  await emulator.reset()
}

/**
 * Complete emulator initialization: reset, assemble code, load code, create highlighter, write map
 */
export async function initializeEmulatorWithCode(
  emulator: EmulatorInstance, 
  sourceCode: string, 
  initialMap: GameMap,
  abortController?: AbortController
): Promise<EmulatorInitResult> {
  // Ensure emulator is initialized
  await ensureEmulatorInitialized(emulator)
  
  // Reset emulator and memory
  await resetEmulatorWithMemory(emulator)
  
  // Check for abort before continuing
  if (abortController?.signal.aborted) {
    throw new Error('Operation aborted')
  }
  
  // Assemble code
  const machineCode = await assembleCode(sourceCode)
  
  // Load code into emulator
  await emulator.loadCode(machineCode)
  
  // Write complete map data to memory
  await writeCompleteMapToMemory(emulator, initialMap)
  
  // Create code highlighter
  const codeHighlighter = createHighlighter()
  await codeHighlighter.initialize(sourceCode)
  
  // Final abort check
  if (abortController?.signal.aborted) {
    throw new Error('Operation aborted')
  }
  
  return {
    codeHighlighter,
    machineCode
  }
}

/**
 * Quick reset and reload code for game cycles (preserves memory data)
 */
export async function resetAndReloadCode(
  emulator: EmulatorInstance,
  machineCode: number[]
): Promise<void> {
  await resetEmulatorRegistersOnly(emulator)
  await emulator.loadCode(machineCode)
}

/**
 * Full reset and reload code (clears all memory)
 */
export async function fullResetAndReloadCode(
  emulator: EmulatorInstance,
  machineCode: number[]
): Promise<void> {
  await resetEmulatorWithMemory(emulator)
  await emulator.loadCode(machineCode)
}

/**
 * Get current memory state from all regions
 */
export async function getEmulatorMemoryState(emulator: EmulatorInstance) {
  const [registers, codeMemory, stackMemory, dataMemory] = await Promise.all([
    emulator.getAllRegisters(),
    emulator.getMemory(MEMORY_CONFIG.CODE_BASE, MEMORY_CONFIG.MEMORY_SIZE),
    emulator.getMemory(MEMORY_CONFIG.STACK_BASE, MEMORY_CONFIG.MEMORY_SIZE),
    emulator.getMemory(MEMORY_CONFIG.DATA_BASE, MEMORY_CONFIG.MEMORY_SIZE)
  ])
  
  if (registers && codeMemory && stackMemory && dataMemory) {
    return {
      registers,
      codeMemory: codeMemory.data,
      stackMemory: stackMemory.data,
      dataMemory: dataMemory.data
    }
  }
  
  return null
}