import { ARMAssembler, GASTarget, GASVariant } from '@/lib/assembler'
import { CodeHighlighter, createHighlighter } from '@/lib/highlighter'
import { RegisterInfo } from '@/workers/emulator/types'
import { GameMap } from '@/data/maps'
import { writeCompleteMapToMemory } from './map-memory'
import { getGlobalSettings } from '@/hooks/useSettings'
import { MEMORY_CONFIG } from '@/lib/memory-layout'

export { MEMORY_CONFIG } from '@/lib/memory-layout'

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
 * Initialize emulator if not already initialized
 */
export async function ensureEmulatorInitialized(emulator: EmulatorInstance): Promise<void> {
  if (!emulator.state.isInitialized) {
    await emulator.initializeEmulator()
  }
}

/**
 * Reset emulator to a clean state backed by a fresh memory map.
 */
export async function resetEmulatorWithMemory(emulator: EmulatorInstance): Promise<void> {
  await emulator.reset()
}

/**
 * Assemble source code and return machine code
 */
export async function assembleCode(sourceCode: string): Promise<number[]> {
  const arch = getGlobalSettings().settings.architecture
  const isMipsR6 = arch === 'MIPS_R6'
  const target: GASTarget = isMipsR6 ? 'mips-linux-gnu' : 'armv7-linux-gnueabihf'
  const variant: GASVariant = arch === 'MIPS_R6' ? 'mips-r6' : 'default'
  const assembler = new ARMAssembler({ target, variant })
  try {
    await assembler.initialize()
    const result = await assembler.assemble(sourceCode)
    return Array.from(result.mc)
  } finally {
    assembler.destroy()
  }
}

/**
 * Reset emulator and reload code onto a fresh memory map.
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
  
  // Reset emulator and zero all memory regions before loading code and map
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
  const arch = getGlobalSettings().settings.architecture
  const isMipsR6 = arch === 'MIPS_R6'
  const target: GASTarget = isMipsR6 ? 'mips-linux-gnu' : 'armv7-linux-gnueabihf'
  const variant: GASVariant = arch === 'MIPS_R6' ? 'mips-r6' : 'default'
  const codeHighlighter = createHighlighter({ target, variant })
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
 * Reset and reload code for game cycles.
 */
export async function resetAndReloadCode(
  emulator: EmulatorInstance,
  machineCode: number[]
): Promise<void> {
  await resetEmulatorRegistersOnly(emulator)
  await emulator.loadCode(machineCode)
}

/**
 * Full reset and reload code.
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
    emulator.getMemory(MEMORY_CONFIG.CODE_BASE, MEMORY_CONFIG.CODE_SIZE),
    emulator.getMemory(MEMORY_CONFIG.STACK_BASE, MEMORY_CONFIG.STACK_SIZE),
    emulator.getMemory(MEMORY_CONFIG.DATA_BASE, MEMORY_CONFIG.DATA_PREVIEW_SIZE)
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
