// Core EmulatorWorker class

import { EMULATOR_RUN_TIMEOUT_US } from './errors';
import {
  UnicornInstance,
  EmulatorMessage,
  EmulatorResponse,
  WorkerSelf,
  EmulatorConfig,
  UnicornGlobal,
  Architecture
} from './types';
import { UnicornLoader } from './unicorn-loader';
import { LiteralPoolDetector } from './literal-pool';
import { MemoryManager } from './memory-manager';
import { ExecutionEngine } from './execution';

interface EmulatorWorkerOptions {
  baseDir?: string;
}

export class EmulatorWorker {
  private unicorn: UnicornInstance | null = null;
  private isInitialized = false;
  private config: EmulatorConfig;
  private currentMessageId: string | undefined;
  private uc!: UnicornGlobal;
  private arch: Architecture = 'ARM';
  
  // Module instances
  private unicornLoader: UnicornLoader;
  private literalPoolDetector: LiteralPoolDetector;
  private memoryManager: MemoryManager | null = null;
  private executionEngine: ExecutionEngine | null = null;

  constructor(private workerSelf: WorkerSelf, options: EmulatorWorkerOptions = {}) {
    this.config = {
      codeAddress: 0x10000,
      stackAddress: 0x20000,
      stackSize: 4096,
      dataAddress: 0x30000,
      dataSize: 8 * 1024
    };

    this.unicornLoader = new UnicornLoader(workerSelf, { baseDir: options.baseDir });
    this.literalPoolDetector = new LiteralPoolDetector(this.config);
    
    // wait for explicit init message to set arch and load Unicorn script
  }

  private async loadUnicornScript(): Promise<void> {
    await this.unicornLoader.loadUnicornScript();
  }

  private initialize(): void {
    try {
      const uc = this.unicornLoader.getUnicorn();
      this.uc = uc;
      if (this.arch === 'MIPS_R6') {
        const archConst = (uc.ARCH_MIPS ?? (uc as unknown as Record<string, number>).ARCH_MIPS);
        // Match GAS target mips-linux-gnu (big-endian)
        const baseMode = ((uc.MODE_MIPS32 || 0) | (uc.MODE_BIG_ENDIAN || 0)) || (uc as unknown as Record<string, number>).MODE_MIPS32;
        // unicorn_wasm_mips.wasm already targets R6; using base mode avoids redundant flagging.
        this.unicorn = new uc.Unicorn(archConst, baseMode);
      } else {
        this.unicorn = new uc.Unicorn(uc.ARCH_ARM, uc.MODE_ARM);
      }
      
      // Initialize managers
      this.memoryManager = new MemoryManager(this.unicorn, this.uc, this.config, this.arch);
      this.executionEngine = new ExecutionEngine(
        this.unicorn,
        this.uc,
        this.config,
        this.literalPoolDetector,
        this.memoryManager,
        this.arch
      );
      
      // Setup memory and registers
      this.memoryManager.initializeMemory();
      this.memoryManager.initializeRegisters();

      this.isInitialized = true;

      this.postMessage({
        type: 'success',
        payload: 'Emulator initialized'
      });
    } catch (error) {
      this.postMessage({
        type: 'error',
        payload: String(error)
      });
    }
  }

  private loadCode(machineCode: number[]): void {
    try {
      if (!this.memoryManager || !this.isInitialized) {
        throw new Error('Emulator not initialized');
      }

      if (this.arch === 'MIPS_R6' && this.unicorn) {
        try {
          this.unicorn.close();
        } catch {}

        const uc = this.uc;
        const archConst = (uc.ARCH_MIPS ?? (uc as unknown as Record<string, number>).ARCH_MIPS);
        const baseMode = ((uc.MODE_MIPS32 || 0) | (uc.MODE_BIG_ENDIAN || 0)) || (uc as unknown as Record<string, number>).MODE_MIPS32;
        this.unicorn = new uc.Unicorn(archConst, baseMode);

        this.memoryManager = new MemoryManager(this.unicorn, this.uc, this.config, this.arch);
        this.executionEngine = new ExecutionEngine(
          this.unicorn,
          this.uc,
          this.config,
          this.literalPoolDetector,
          this.memoryManager,
          this.arch
        );

        this.memoryManager.initializeMemory();
        this.memoryManager.initializeRegisters();
      }

      this.memoryManager.loadCode(machineCode);

      this.postMessage({
        type: 'success',
        payload: `Loaded ${machineCode.length} bytes of code`
      });
    } catch (error) {
      this.postMessage({
        type: 'error',
        payload: `Failed to load code: ${error}`
      });
    }
  }

  private setRegister(register: string, value: number): void {
    try {
      if (!this.memoryManager || !this.isInitialized) {
        throw new Error('Emulator not initialized');
      }

      this.memoryManager.setRegister(register, value);

      this.postMessage({
        type: 'success',
        payload: `Set ${register} = 0x${value.toString(16).padStart(8, '0')}`
      });
    } catch (error) {
      this.postMessage({
        type: 'error',
        payload: `Failed to set register: ${error}`
      });
    }
  }

  private getRegister(register: string): void {
    try {
      if (!this.memoryManager || !this.isInitialized) {
        throw new Error('Emulator not initialized');
      }

      const registerInfo = this.memoryManager.getRegister(register);

      this.postMessage({
        type: 'register-value',
        payload: registerInfo
      });
    } catch (error) {
      this.postMessage({
        type: 'error',
        payload: `Failed to get register: ${error}`
      });
    }
  }

  private getAllRegisters(): void {
    try {
      if (!this.memoryManager || !this.isInitialized) {
        throw new Error('Emulator not initialized');
      }

      const allRegisters = this.memoryManager.getAllRegisters();

      this.postMessage({
        type: 'registers-data',
        payload: allRegisters
      });
    } catch (error) {
      this.postMessage({
        type: 'error',
        payload: `Failed to get all registers: ${error}`
      });
    }
  }

  private stepExecution(): void {
    try {
      if (!this.executionEngine || !this.isInitialized) {
        throw new Error('Emulator not initialized');
      }

      this.executionEngine.stepExecution();

      this.postMessage({
        type: 'execution-complete',
        payload: 'Step completed'
      });
    } catch (error) {
      this.postMessage({
        type: 'error',
        payload: String(error)
      });
    }
  }

  private stepDebugExecution(): void {
    try {
      if (!this.executionEngine || !this.isInitialized) {
        throw new Error('Emulator not initialized');
      }

      const stepResult = this.executionEngine.stepDebugExecution();

      this.postMessage({
        type: 'step-result',
        payload: stepResult
      });
    } catch (error) {
      this.postMessage({
        type: 'step-result',
        payload: {
          success: false,
          message: String(error),
          pc: 0
        }
      });
    }
  }

  private runExecution(instructionCount?: number): void {
    try {
      if (!this.executionEngine || !this.isInitialized) {
        throw new Error('Emulator not initialized');
      }

      const result = this.executionEngine.runExecution(instructionCount);

      this.postMessage({
        type: 'execution-complete',
        payload: result
      });
    } catch (error) {
      this.postMessage({
        type: 'error',
        payload: String(error)
      });
    }
  }

  private runUntilMemWrite(address: number, validValues?: number[], timeoutUs?: number): void {
    try {
      if (!this.executionEngine || !this.isInitialized) {
        throw new Error('Emulator not initialized');
      }

      const effectiveTimeoutUs = timeoutUs ?? EMULATOR_RUN_TIMEOUT_US;
      const result = this.executionEngine.runUntilMemoryWrite(address, validValues, effectiveTimeoutUs);

      this.postMessage({
        type: 'execution-complete',
        payload: result
      });
    } catch (error) {
      this.postMessage({
        type: 'error',
        payload: String(error)
      });
    }
  }

  private getMemory(address: number, size: number): void {
    try {
      if (!this.memoryManager || !this.isInitialized) {
        throw new Error('Emulator not initialized');
      }

      const memoryData = this.memoryManager.readMemory(address, size);

      this.postMessage({
        type: 'memory-data',
        payload: memoryData
      });
    } catch (error) {
      this.postMessage({
        type: 'error',
        payload: `Failed to read memory: ${error}`
      });
    }
  }

  private writeMemory(address: number, data: number[]): void {
    try {
      if (!this.memoryManager || !this.isInitialized) {
        throw new Error('Emulator not initialized');
      }

      this.memoryManager.writeMemory(address, data);

      this.postMessage({
        type: 'success',
        payload: `Wrote ${data.length} bytes to address 0x${address.toString(16).padStart(8, '0')}`
      });
    } catch (error) {
      this.postMessage({
        type: 'error',
        payload: `Failed to write memory: ${error}`
      });
    }
  }

  private getCycleCount(): void {
    try {
      if (!this.unicorn || !this.isInitialized) {
        throw new Error('Emulator not initialized');
      }

      if (typeof this.unicorn.cycle_count !== 'function') {
        this.postMessage({ type: 'cycle-count', payload: { cycles: 0 } });
        return;
      }

      const rawCount = this.unicorn.cycle_count();
      const numericCount = typeof rawCount === 'bigint' ? Number(rawCount) : Number(rawCount);
      const cycles = Number.isFinite(numericCount) ? numericCount : 0;

      this.postMessage({
        type: 'cycle-count',
        payload: { cycles }
      });
    } catch (error) {
      this.postMessage({
        type: 'error',
        payload: `Failed to get cycle count: ${error}`
      });
    }
  }

  private reset(): void {
    try {
      if (!this.memoryManager || !this.isInitialized) {
        throw new Error('Emulator not initialized');
      }

      this.memoryManager.resetRegisters();

      this.postMessage({
        type: 'success',
        payload: 'Emulator reset'
      });
    } catch (error) {
      this.postMessage({
        type: 'error',
        payload: `Failed to reset emulator: ${error}`
      });
    }
  }

  private postMessage(response: EmulatorResponse): void {
    if (this.currentMessageId) {
      response.messageId = this.currentMessageId;
    }
    this.workerSelf.postMessage(response);
  }

  public handleMessage(message: EmulatorMessage): void {
    this.currentMessageId = message.messageId;
    
    switch (message.type) {
      case 'init':
        // Optional: select architecture from payload
        if (message.payload && typeof message.payload === 'object' && 'arch' in message.payload) {
          const arch = (message.payload as { arch?: Architecture }).arch;
          if (arch === 'ARM' || arch === 'MIPS_R6') {
            this.arch = arch;
          }
        }
        // Load appropriate Unicorn build
        this.unicornLoader.setArchitecture(this.arch);
        this.loadUnicornScript().then(() => this.initialize());
        break;
      case 'load-code':
        this.loadCode(message.payload as number[]);
        break;
      case 'set-register':
        if (typeof message.payload === 'object' && message.payload && 'register' in message.payload && 'value' in message.payload) {
          this.setRegister(message.payload.register!, message.payload.value!);
        }
        break;
      case 'get-register':
        this.getRegister(message.payload as string);
        break;
      case 'get-all-registers':
        this.getAllRegisters();
        break;
      case 'step':
        this.stepExecution();
        break;
      case 'step-debug':
        this.stepDebugExecution();
        break;
      case 'run':
        if (typeof message.payload === 'object' && message.payload) {
          const p = message.payload as { instructionCount?: number; untilMemWriteAt?: number; validValues?: number[]; timeoutUs?: number };
          if (p.untilMemWriteAt !== undefined) {
            this.runUntilMemWrite(p.untilMemWriteAt, p.validValues, p.timeoutUs);
          } else if (p.instructionCount !== undefined) {
            this.runExecution(p.instructionCount);
          } else {
            this.runExecution();
          }
        } else {
          this.runExecution();
        }
        break;
      case 'get-memory':
        if (typeof message.payload === 'object' && message.payload && 'address' in message.payload && 'size' in message.payload) {
          this.getMemory(message.payload.address!, message.payload.size!);
        }
        break;
      case 'write-memory':
        if (typeof message.payload === 'object' && message.payload && 'address' in message.payload && 'data' in message.payload) {
          this.writeMemory(message.payload.address!, message.payload.data!);
        }
        break;
      case 'get-cycle-count':
        this.getCycleCount();
        break;
      case 'reset':
        this.reset();
        break;
      default:
        this.postMessage({
          type: 'error',
          payload: `Unknown message type: ${message.type}`
        });
    }
  }
}
