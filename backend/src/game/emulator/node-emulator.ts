import { Architecture, EmulatorConfig, EmulatorResponse, RegisterInfo, UnicornGlobal, UnicornInstance } from './types'
import { UnicornLoader } from './unicorn-loader'
import { LiteralPoolDetector } from './literal-pool'
import { MemoryManager } from './memory-manager'
import { ExecutionEngine } from './execution'

class NodeWorkerSelf {
  uc?: UnicornGlobal
  location = { origin: '' }

  constructor(private readonly onMessage?: (message: EmulatorResponse) => void) {}

  postMessage(message: EmulatorResponse): void {
    if (this.onMessage) {
      this.onMessage(message)
    }
  }

  addEventListener(): void {
    // No-op in Node environment
  }
}

export interface RunUntilMemWriteResult {
  message: string
  executedInstructions: number
  stopReason: 'mem-write' | 'end-of-code' | 'timeout' | 'unknown'
  memEvent?: { address: number; value: number }
}

export class NodeEmulator {
  private readonly config: EmulatorConfig = {
    codeAddress: 0x10000,
    stackAddress: 0x20000,
    stackSize: 4096,
    dataAddress: 0x30000,
    dataSize: 8 * 1024
  }

  private readonly literalPoolDetector = new LiteralPoolDetector(this.config)
  private readonly workerSelf: NodeWorkerSelf
  private readonly loader: UnicornLoader

  private unicorn: UnicornInstance | null = null
  private uc: UnicornGlobal | null = null
  private memoryManager: MemoryManager | null = null
  private executionEngine: ExecutionEngine | null = null
  private currentArch: Architecture | null = null

  public readonly state = {
    isInitialized: false
  }

  constructor(options?: { onMessage?: (message: EmulatorResponse) => void; baseDir?: string }) {
    this.workerSelf = new NodeWorkerSelf(options?.onMessage)
    this.loader = new UnicornLoader(this.workerSelf, { baseDir: options?.baseDir })
  }

  async initializeEmulator(arch: Architecture): Promise<void> {
    this.currentArch = arch
    this.loader.setArchitecture(arch)
    await this.loader.loadUnicornScript()

    this.uc = this.loader.getUnicorn()

    if (this.unicorn) {
      try {
        this.unicorn.close()
      } catch {}
    }

    if (arch === 'MIPS_R6') {
      const uc = this.uc as unknown as Record<string, number>
      const archConst = this.uc.ARCH_MIPS ?? uc.ARCH_MIPS
      const baseMode = ((this.uc.MODE_MIPS32 || 0) | (this.uc.MODE_BIG_ENDIAN || 0)) || uc.MODE_MIPS32
      const r6Bit = this.uc.MODE_MIPS32R6 || uc.MODE_MIPS32R6 || 0
      const modeConst = arch === 'MIPS_R6' && r6Bit ? (baseMode | r6Bit) : baseMode
      this.unicorn = new this.uc.Unicorn(archConst, modeConst)
    } else {
      this.unicorn = new this.uc.Unicorn(this.uc.ARCH_ARM, this.uc.MODE_ARM)
    }

    this.memoryManager = new MemoryManager(this.unicorn, this.uc, this.config, arch)
    this.executionEngine = new ExecutionEngine(
      this.unicorn,
      this.uc,
      this.config,
      this.literalPoolDetector,
      this.memoryManager,
      arch
    )

    this.memoryManager.initializeMemory()
    this.memoryManager.initializeRegisters()

    this.state.isInitialized = true
  }

  async reset(): Promise<void> {
    this.ensureReady()
    this.memoryManager!.resetRegisters()
  }

  async loadCode(machineCode: number[]): Promise<void> {
    this.ensureReady()
    if (this.currentArch === 'MIPS_R6' && this.unicorn && this.uc) {
      try {
        this.unicorn.close()
      } catch {}

      const uc = this.uc as unknown as Record<string, number>
      const archConst = this.uc.ARCH_MIPS ?? uc.ARCH_MIPS
      const baseMode = ((this.uc.MODE_MIPS32 || 0) | (this.uc.MODE_BIG_ENDIAN || 0)) || uc.MODE_MIPS32
      const r6Bit = this.uc.MODE_MIPS32R6 || uc.MODE_MIPS32R6 || 0
      const modeConst = baseMode | r6Bit
      this.unicorn = new this.uc.Unicorn(archConst, modeConst)

      this.memoryManager = new MemoryManager(this.unicorn, this.uc, this.config, this.currentArch)
      this.executionEngine = new ExecutionEngine(
        this.unicorn,
        this.uc,
        this.config,
        this.literalPoolDetector,
        this.memoryManager,
        this.currentArch
      )

      this.memoryManager.initializeMemory()
      this.memoryManager.initializeRegisters()
    }

    this.memoryManager!.loadCode(machineCode)
  }

  async writeMemory(address: number, data: number[]): Promise<boolean> {
    this.ensureReady()
    this.memoryManager!.writeMemory(address, data)
    return true
  }

  async getAllRegisters(): Promise<RegisterInfo[] | null> {
    this.ensureReady()
    return this.memoryManager!.getAllRegisters()
  }

  async getMemory(address: number, size: number): Promise<{ address: number; size: number; data: number[]; hex: string } | null> {
    this.ensureReady()
    return this.memoryManager!.readMemory(address, size)
  }

  async runUntilMemWrite(
    address: number,
    validValues?: number[],
    timeoutUs?: number
  ): Promise<RunUntilMemWriteResult> {
    this.ensureReady()
    const result = this.executionEngine!.runUntilMemoryWrite(address, validValues, timeoutUs)
    return result
  }

  async close(): Promise<void> {
    if (this.unicorn) {
      try {
        this.unicorn.close()
      } catch {}
      this.unicorn = null
    }
    this.memoryManager = null
    this.executionEngine = null
    this.state.isInitialized = false
  }

  get architecture(): Architecture | null {
    return this.currentArch
  }

  private ensureReady(): void {
    if (!this.state.isInitialized || !this.memoryManager || !this.executionEngine || !this.unicorn || !this.uc) {
      throw new Error('Emulator not initialized')
    }
  }
}
