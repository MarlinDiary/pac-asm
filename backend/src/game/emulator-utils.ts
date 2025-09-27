import { ARMAssembler, GASTarget, GASVariant } from './assembler'
import { GameMap } from './maps'
import { writeCompleteMapToMemory } from './map-memory'
import { NodeEmulator } from './emulator/node-emulator'
import { Architecture, RegisterInfo } from './emulator/types'

export const MEMORY_CONFIG = {
  CODE_BASE: 0x10000,
  STACK_BASE: 0x20000,
  DATA_BASE: 0x30000,
  MEMORY_SIZE: 4096
} as const

export async function ensureEmulatorInitialized(emulator: NodeEmulator, arch: Architecture): Promise<void> {
  if (!emulator.state.isInitialized || emulator.architecture !== arch) {
    await emulator.initializeEmulator(arch)
  }
}

export async function resetEmulatorWithMemory(emulator: NodeEmulator): Promise<void> {
  await emulator.reset()
  const zeroData = new Array(MEMORY_CONFIG.MEMORY_SIZE).fill(0)
  await emulator.writeMemory(MEMORY_CONFIG.CODE_BASE, zeroData)
  await emulator.writeMemory(MEMORY_CONFIG.STACK_BASE, zeroData)
  await emulator.writeMemory(MEMORY_CONFIG.DATA_BASE, zeroData)
}

export async function assembleCode(sourceCode: string, arch: Architecture): Promise<number[]> {
  const isMipsR6 = arch === 'MIPS_R6'
  const target: GASTarget = isMipsR6 ? 'mips-linux-gnu' : 'armv7-linux-gnueabihf'
  const variant: GASVariant = isMipsR6 ? 'mips-r6' : 'default'
  const assembler = new ARMAssembler({ target, variant })
  try {
    await assembler.initialize()
    const result = await assembler.assemble(sourceCode)
    return Array.from(result.mc)
  } finally {
    assembler.destroy()
  }
}

export interface EmulatorInitResult {
  machineCode: number[]
}

export async function initializeEmulatorWithCode(
  emulator: NodeEmulator,
  sourceCode: string,
  initialMap: GameMap,
  arch: Architecture
): Promise<EmulatorInitResult> {
  await ensureEmulatorInitialized(emulator, arch)
  await resetEmulatorWithMemory(emulator)

  const machineCode = await assembleCode(sourceCode, arch)
  await emulator.loadCode(machineCode)

  const mapWriteSuccess = await writeCompleteMapToMemory(emulator, initialMap, arch)
  if (!mapWriteSuccess) {
    throw new Error('Failed to write map data to emulator memory')
  }

  return { machineCode }
}

export async function getEmulatorMemoryState(emulator: NodeEmulator): Promise<{
  registers: RegisterInfo[]
  codeMemory: number[]
  stackMemory: number[]
  dataMemory: number[]
} | null> {
  const [registers, codeMemory, stackMemory, dataMemory] = await Promise.all([
    emulator.getAllRegisters(),
    emulator.getMemory(MEMORY_CONFIG.CODE_BASE, MEMORY_CONFIG.MEMORY_SIZE),
    emulator.getMemory(MEMORY_CONFIG.STACK_BASE, MEMORY_CONFIG.MEMORY_SIZE),
    emulator.getMemory(MEMORY_CONFIG.DATA_BASE, MEMORY_CONFIG.MEMORY_SIZE)
  ])

  if (!registers || !codeMemory || !stackMemory || !dataMemory) {
    return null
  }

  return {
    registers,
    codeMemory: codeMemory.data,
    stackMemory: stackMemory.data,
    dataMemory: dataMemory.data
  }
}
