// Execution engine for ARM and MIPS R6 instructions

import { EMULATOR_RUN_TIMEOUT_US } from '@/lib/emulator-errors';
import { UnicornInstance, UnicornGlobal, StepResult, EmulatorConfig, Architecture } from './types';
import { LiteralPoolDetector } from './literal-pool';
import { MemoryManager } from './memory-manager';

export class ExecutionEngine {
  private unicorn: UnicornInstance;
  private uc: UnicornGlobal;
  private config: EmulatorConfig;
  private literalPoolDetector: LiteralPoolDetector;
  private memoryManager: MemoryManager;
  private arch: Architecture;

  constructor(
    unicorn: UnicornInstance,
    uc: UnicornGlobal,
    config: EmulatorConfig,
    literalPoolDetector: LiteralPoolDetector,
    memoryManager: MemoryManager,
    arch: Architecture
  ) {
    this.unicorn = unicorn;
    this.uc = uc;
    this.config = config;
    this.literalPoolDetector = literalPoolDetector;
    this.memoryManager = memoryManager;
    this.arch = arch;
  }

  private decodeInstr32(bytes: number[]): number {
    if (bytes.length !== 4) return 0;
    if (this.arch === 'MIPS_R6') {
      // MIPS32 big-endian in our configuration
      return (((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0);
    }
    // ARM little-endian (ARM state, 32-bit)
    return (((bytes[3] << 24) | (bytes[2] << 16) | (bytes[1] << 8) | bytes[0]) >>> 0);
  }

  private isMipsBranchOrJump(instruction: number): boolean {
    const op = (instruction >>> 26) & 0x3f;
    if (op === 0x02 || op === 0x03) {
      // J, JAL
      return true;
    }

    if (op === 0x01) {
      // REGIMM encoding: BLTZ/BGEZ and their variants
      const rt = (instruction >>> 16) & 0x1f;
      // 0x00 BLTZ, 0x01 BGEZ, 0x10 BLTZAL, 0x11 BGEZAL, 0x12 BLTZALL, 0x13 BGEZALL
      if (rt === 0x00 || rt === 0x01 || (rt >= 0x10 && rt <= 0x13)) {
        return true;
      }
    }

    if (op === 0x00) {
      const funct = instruction & 0x3f;
      // JR, JALR
      if (funct === 0x08 || funct === 0x09) {
        return true;
      }
    }

    // BEQ, BNE, BLEZ, BGTZ and their likely variants
    if (op === 0x04 || op === 0x05 || op === 0x06 || op === 0x07 ||
        op === 0x14 || op === 0x15 || op === 0x16 || op === 0x17) {
      return true;
    }

    return false;
  }

  private extractMemoryHookEvent(args: unknown[]): { type: number; addr: number; size: number; value: number } | null {
    if (!Array.isArray(args)) {
      args = Array.from(args as IArguments);
    }
    if (args.length < 4) {
      return null;
    }

    const typeRaw = args[1];
    if (typeof typeRaw !== 'number') {
      return null;
    }

    // Special handling for MIPS_R6 (WASM version)
    // The actual parameter layout we observed:
    // args[0] = handle (number)
    // args[1] = type (number)
    // args[2] = addr (BigInt!)
    // args[3] = size (number)
    // args[4] = value (BigInt!)
    // args[5] = user_data (object)
    if (this.arch === 'MIPS_R6') {
      if (args.length === 6) {
        // Handle BigInt parameters for addr and value
        if (typeof args[2] === 'bigint' && typeof args[3] === 'number' && typeof args[4] === 'bigint') {
          return {
            type: typeRaw >>> 0,
            addr: Number(args[2] & BigInt(0xFFFFFFFF)),  // Convert BigInt to 32-bit number
            size: (args[3] as number) >>> 0,
            value: Number(args[4] & BigInt(0xFFFFFFFF))   // Convert BigInt to 32-bit number
          };
        }
      }
    }

    // Standard parameter extraction for non-WASM versions
    if (args.length >= 5 && typeof args[2] === 'number' && typeof args[3] === 'number' && typeof args[4] === 'number' && typeof args[5] !== 'number') {
      return {
        type: typeRaw >>> 0,
        addr: (args[2] as number) >>> 0,
        size: (args[3] as number) >>> 0,
        value: (args[4] as number) >>> 0
      };
    }

    if (args.length >= 6 && typeof args[2] === 'number' && typeof args[4] === 'number' && typeof args[5] === 'number') {
      return {
        type: typeRaw >>> 0,
        addr: (args[2] as number) >>> 0,
        size: (args[4] as number) >>> 0,
        value: (args[5] as number) >>> 0
      };
    }

    return null;
  }

  private normalizeCommandValue(value: number, size: number, validValues?: number[]): number {
    const candidates = new Set<number>();
    const unsigned = value >>> 0;

    for (let i = 0; i < size; i++) {
      const shift = i * 8;
      candidates.add((unsigned >>> shift) & 0xff);
    }

    for (let i = 0; i < size; i++) {
      const shift = (size - 1 - i) * 8;
      candidates.add((unsigned >>> shift) & 0xff);
    }

    candidates.add(unsigned & 0xff);

    const candidateArray = Array.from(candidates);

    if (validValues && validValues.length > 0) {
      const match = candidateArray.find(byte => validValues.includes(byte));
      if (match !== undefined) {
        return match;
      }
    }

    const nonZero = candidateArray.find(byte => byte !== 0);
    if (nonZero !== undefined) {
      return nonZero;
    }

    return candidateArray[0] ?? (unsigned & 0xff);
  }

  // Note: we use a fixed 4KB code window starting at codeAddress

  stepExecution(): void {
    const pcReg = (this.arch === 'MIPS_R6')
      ? (this.uc.MIPS_REG_PC ?? (this.uc as unknown as Record<string, number>).MIPS_REG_PC)!
      : this.uc.ARM_REG_PC;
    const pc = this.unicorn.reg_read_i32(pcReg);
    const endAddress = this.config.codeAddress + 4096;
    this.unicorn.emu_start(pc, endAddress, 0, 1);
  }

  stepDebugExecution(): StepResult {
    // Get state before execution
    const pcReg = (this.arch === 'MIPS_R6')
      ? (this.uc.MIPS_REG_PC ?? (this.uc as unknown as Record<string, number>).MIPS_REG_PC)!
      : this.uc.ARM_REG_PC;
    const pcBefore = this.unicorn.reg_read_i32(pcReg);
    const registersBefore = this.memoryManager.getAllRegisters();
    let memWriteEvent: { address: number; value: number; size: number } | undefined;
    const executedAddresses: number[] = [];
    
    // Read the instruction at current PC
    let instructionBytes: number[] = [];
    let instructionHex = '';
    let isLiteralPool = false;
    
    try {
      instructionBytes = Array.from(this.unicorn.mem_read(pcBefore, 4));
      instructionHex = instructionBytes.map(b => b.toString(16).padStart(2, '0')).join(' ');
      // Only apply literal-pool detection for ARM. MIPS has no literal pool in our usage
      // and ARM-specific heuristics can misclassify valid MIPS instructions.
      isLiteralPool = this.arch === 'ARM' ? this.literalPoolDetector.isLikelyLiteralPool(instructionBytes) : false;
    } catch {
      instructionHex = 'INVALID';
    }
    
    
    let pcAfter: number;
    let stepMessage = 'Step executed successfully';
    
    if (isLiteralPool) {
      const instruction = (instructionBytes[3] << 24) | (instructionBytes[2] << 16) | 
                         (instructionBytes[1] << 8) | instructionBytes[0];
      
      if (instruction === 0x00000000) {
        // Reached end of code (all zeros padding)
        return {
          success: true,
          message: 'Execution completed - reached end of code',
          pc: pcBefore,
          instruction: {
            address: pcBefore,
            bytes: instructionBytes,
            hex: instructionHex.toUpperCase() + ' (END OF CODE)'
          },
          registers: undefined,
          executedAddresses: [pcBefore >>> 0]
        };
      } else {
        // Skip over literal pool instead of executing it
        pcAfter = this.literalPoolDetector.findNextInstruction(pcBefore, this.unicorn);
        
        // Check if we found a valid next instruction
        if (pcAfter >= this.config.codeAddress + 4096) {
          return {
            success: true,
            message: 'Execution completed - no more instructions',
            pc: pcBefore,
            instruction: {
              address: pcBefore,
              bytes: instructionBytes,
              hex: instructionHex.toUpperCase() + ' (LITERAL POOL - END)'
            },
            registers: undefined,
            executedAddresses: [pcBefore >>> 0]
          };
        }

        this.unicorn.reg_write_i32(pcReg, pcAfter);
        stepMessage = 'Skipped literal pool data';
      }
    } else {
      // Register a temporary memory-write hook for the command byte address
      let hookHandle: unknown | undefined;
      const cb = (...hookArgs: unknown[]) => {
        const event = this.extractMemoryHookEvent(hookArgs);
        if (!event) {
          return;
        }
        const { type, addr, size, value } = event;
        if (type !== this.uc.MEM_WRITE) return;
        if (addr < this.config.dataAddress || addr >= this.config.dataAddress + 4) return;
        const normalizedValue = this.normalizeCommandValue(value, size);
        memWriteEvent = { address: this.config.dataAddress, value: normalizedValue, size };
      };

      try {
        const begin = this.config.dataAddress >>> 0;
        const end = (this.config.dataAddress + 4) >>> 0;
        hookHandle = (this.unicorn as unknown as {
          hook_add: (
            type: number,
            cb: (...args: unknown[]) => unknown,
            user_data: unknown,
            begin: number,
            end: number
          ) => unknown
        }).hook_add(
          this.uc.HOOK_MEM_WRITE,
          cb as unknown as (...args: unknown[]) => unknown,
          undefined,
          begin,
          end
        );
      } catch {}

      const endAddress = this.config.codeAddress + 4096;

      // Record the primary instruction address
      executedAddresses.push(pcBefore >>> 0);

      // For ARM: Use simple single-instruction execution
      const isMipsR6 = this.arch === 'MIPS_R6';

      if (this.arch === 'ARM' || isMipsR6) {
        try {
          this.unicorn.emu_start(pcBefore, endAddress, 0, 1);
        } catch {}
        pcAfter = this.unicorn.reg_read_i32(pcReg);
      } else {
        // For MIPS: Use HOOK_CODE counting to handle delay slots correctly
        let desiredCount = 1;
        try {
          const ins = this.decodeInstr32(instructionBytes);
          if (this.isMipsBranchOrJump(ins)) {
            desiredCount = 2; // include delay slot
          }
        } catch {}

        let executed = 0;
        const targetHookCount = (desiredCount >>> 0) + 1; // HOOK_CODE fires before exec; stop on (executed >= desired+1)
        let codeHook: unknown | undefined;
        try {
          // Listen for all code addresses to avoid missing callbacks due to range mismatch
          const begin = 1 >>> 0;
          const end = 0 >>> 0; // special meaning in wrapper: full-range
          codeHook = (this.unicorn as unknown as {
            hook_add: (
              type: number,
              cb: (...args: unknown[]) => unknown,
              user_data: unknown,
              begin: number,
              end: number
            ) => unknown
          }).hook_add(
            this.uc.HOOK_CODE,
            (() => {
              executed++;
              if (executed >= targetHookCount) {
                try { this.unicorn.emu_stop(); } catch {}
              }
            }) as unknown as (...args: unknown[]) => unknown,
            undefined,
            begin,
            end
          );
        } catch {}

        try {
          // Large budget; hook will stop us after desired instructions
          const maxCount = 0x7fffffff;
          this.unicorn.emu_start(pcBefore, endAddress, 0, maxCount);
        } catch {}
        finally {
          try { if (codeHook) (this.unicorn as unknown as { hook_del: (h: unknown) => void }).hook_del(codeHook); } catch {}
        }

        pcAfter = this.unicorn.reg_read_i32(pcReg);
        if (desiredCount > 1) {
          executedAddresses.push((pcBefore + 4) >>> 0);
        }
      }

      // Remove hook if present
      try { if (hookHandle) (this.unicorn as unknown as { hook_del: (handle: unknown) => void }).hook_del(hookHandle); } catch {}
    }
    
    // Get state after execution
    const registersAfter = this.memoryManager.getAllRegisters();
    
    // Find changed registers
    const changedRegisters = registersAfter.filter((regAfter, index) => {
      const regBefore = registersBefore[index];
      return regAfter.value !== regBefore.value;
    });

    return {
      success: true,
      message: stepMessage,
      pc: pcAfter,
      instruction: {
        address: pcBefore,
        bytes: instructionBytes,
        hex: instructionHex.toUpperCase() + (isLiteralPool ? ' (LITERAL POOL)' : '')
      },
      registers: changedRegisters.length > 0 ? changedRegisters : undefined,
      memWriteEvent,
      executedAddresses: executedAddresses.length > 0 ? executedAddresses : undefined
    };
  }

  runExecution(instructionCount?: number): { message: string; executedInstructions: number } {
    const maxInstructions = instructionCount || 1000;
    let executedInstructions = 0;

    // Safe execution loop - check each instruction before executing
    while (executedInstructions < maxInstructions) {
      const pcReg = (this.arch === 'MIPS_R6')
        ? (this.uc.MIPS_REG_PC ?? (this.uc as unknown as Record<string, number>).MIPS_REG_PC)!
        : this.uc.ARM_REG_PC;
      const pc = this.unicorn.reg_read_i32(pcReg);
      
      // Check if we've reached the end of code space
      if (pc >= this.config.codeAddress + 4096) {
        break;
      }
      
      // Read the instruction at current PC
      let instructionBytes: number[] = [];
      let isLiteralPool = false;
      
      try {
        instructionBytes = Array.from(this.unicorn.mem_read(pc, 4));
        isLiteralPool = this.arch === 'ARM' ? this.literalPoolDetector.isLikelyLiteralPool(instructionBytes) : false;
      } catch {
        break;
      }
      
      if (isLiteralPool) {
        const instruction = (instructionBytes[3] << 24) | (instructionBytes[2] << 16) | 
                           (instructionBytes[1] << 8) | instructionBytes[0];
        
        if (instruction === 0x00000000) {
          // Reached end of code (padding)
          break;
        } else {
          // Skip literal pool
          const nextPc = this.literalPoolDetector.findNextInstruction(pc, this.unicorn);
          if (nextPc >= this.config.codeAddress + 4096) {
            break;
          }
          
          this.unicorn.reg_write_i32(pcReg, nextPc);
          continue; // Don't count this as an executed instruction
      }
    } else {
      // Execute one instruction normally
        const endAddress = this.config.codeAddress + 4096;
        this.unicorn.emu_start(pc, endAddress, 0, 1);
        executedInstructions++;
        
        const newPc = this.unicorn.reg_read_i32(pcReg);
       
        // If PC didn't change, we might be stuck
        if (newPc === pc) {
          break;
        }
      }
    }

    return {
      message: `Execution completed. Instructions executed: ${executedInstructions}`,
      executedInstructions
    };
  }

  // Continuous run until a specific memory address is written by emulated code.
  // Uses Unicorn's HOOK_MEM_WRITE and a single emu_start call with timeout.
  runUntilMemoryWrite(
    untilAddress: number,
    validValues: number[] = [1, 2, 3, 4],
    timeoutUs: number = EMULATOR_RUN_TIMEOUT_US
  ): { message: string; executedInstructions: number; stopReason: 'mem-write' | 'end-of-code' | 'timeout' | 'unknown'; memEvent?: { address: number; value: number } } {
    const endAddress = this.config.codeAddress + 4096;
    const pcReg = (this.arch === 'MIPS_R6')
      ? (this.uc.MIPS_REG_PC ?? (this.uc as unknown as Record<string, number>).MIPS_REG_PC)!
      : this.uc.ARM_REG_PC;
    const pc = this.unicorn.reg_read_i32(pcReg);

    let memEventInfo: { address: number; value: number; storePc: number; nextPc?: number } | undefined;
    let lastExecutedPc: number | undefined;
    let stopPending = false;
    const shouldUseCodeHook = this.arch !== 'MIPS_R6';
    let codeHookRegistered = false;

    const cb = (...hookArgs: unknown[]) => {
      // Debug: Log all arguments for MIPS_R6
      if (this.arch === 'MIPS_R6') {
        const debugInfo = {
          arch: this.arch,
          argsLength: hookArgs.length,
          args: hookArgs.map((arg, i) => ({
            index: i,
            type: typeof arg,
            value: typeof arg === 'number' ? `0x${(arg >>> 0).toString(16)}` : typeof arg === 'bigint' ? `0x${arg.toString(16)}` : String(arg),
            raw: arg
          }))
        };
        (self as unknown as { postMessage: (msg: unknown) => void }).postMessage({
          type: 'debug',
          message: 'MIPS_R6 hook callback args',
          data: debugInfo
        });
      }

      const event = this.extractMemoryHookEvent(hookArgs);
      if (!event) {
        if (this.arch === 'MIPS_R6') {
          (self as unknown as { postMessage: (msg: unknown) => void }).postMessage({
            type: 'debug',
            message: 'Failed to extract memory event'
          });
        }
        return;
      }
      const { type, addr, size, value } = event;

      if (this.arch === 'MIPS_R6') {
        (self as unknown as { postMessage: (msg: unknown) => void }).postMessage({
          type: 'debug',
          message: 'Extracted event',
          data: { type: `0x${type.toString(16)}`, addr: `0x${addr.toString(16)}`, size, value: `0x${value.toString(16)}` }
        });
      }

      if (type !== this.uc.MEM_WRITE) return;
      if (addr < untilAddress || addr >= untilAddress + 4) return;
      const normalizedValue = this.normalizeCommandValue(value, size, validValues);

      if (this.arch === 'MIPS_R6') {
        (self as unknown as { postMessage: (msg: unknown) => void }).postMessage({
          type: 'debug',
          message: 'Normalized value',
          data: { normalizedValue, validValues }
        });
      }

      if (!validValues.includes(normalizedValue)) return;

      let storePc = lastExecutedPc ?? 0;
      let nextPc: number | undefined;

      if (codeHookRegistered && shouldUseCodeHook) {
        stopPending = true;
        if (storePc === 0) {
          const rawPc = this.unicorn.reg_read_i32(pcReg) >>> 0;
          storePc = rawPc >= 4 ? ((rawPc - 4) >>> 0) : rawPc;
          nextPc = rawPc;
        }
      } else {
        const rawPc = this.unicorn.reg_read_i32(pcReg) >>> 0;
        // For MIPS_R6, when memory write hook fires, the store instruction has already executed
        // and PC points to the next instruction. We need to calculate where the store was.
        storePc = rawPc >= 4 ? ((rawPc - 4) >>> 0) : rawPc;
        nextPc = rawPc;

        if (this.arch === 'MIPS_R6') {
          (self as unknown as { postMessage: (msg: unknown) => void }).postMessage({
            type: 'debug',
            message: 'MIPS_R6 memory write detected in hook',
            data: {
              rawPc: `0x${rawPc.toString(16)}`,
              storePc: `0x${storePc.toString(16)}`,
              value: normalizedValue
            }
          });
        }

        try { this.unicorn.emu_stop(); } catch {}
      }

      memEventInfo = { address: untilAddress, value: normalizedValue, storePc, nextPc };
    };

    // Register hook only for the data command byte address range
    let hookHandle: unknown | undefined;
    let codeTraceHandle: unknown | undefined;
    try {
      // Only register for the single command byte address: [0x30000, 0x30001)
      const begin = untilAddress >>> 0;
      const end = (untilAddress + 4) >>> 0;
      hookHandle = (this.unicorn as unknown as {
        hook_add: (
          type: number,
          cb: (...args: unknown[]) => unknown,
          user_data: unknown,
          begin: number,
          end: number
        ) => unknown
      }).hook_add(
        this.uc.HOOK_MEM_WRITE,
        cb as unknown as (...args: unknown[]) => unknown,
        undefined,
        begin,
        end
      );
    } catch (e) {
      return {
        message: `Failed to register memory hook: ${String(e)}`,
        executedInstructions: 0,
        stopReason: 'unknown'
      };
    }

    if (shouldUseCodeHook) {
      try {
        // Track the most recently executed instruction so we know which PC produced the write
        codeTraceHandle = (this.unicorn as unknown as {
          hook_add: (
            type: number,
            cb: (...args: unknown[]) => unknown,
            user_data: unknown,
            begin: number,
            end: number
          ) => unknown
        }).hook_add(
          this.uc.HOOK_CODE,
          ((...args: unknown[]) => {
            const addr = typeof args[1] === 'number' ? args[1] : 0;
            lastExecutedPc = addr >>> 0;

            if (stopPending) {
              stopPending = false;
              try { this.unicorn.emu_stop(); } catch {}
            }
          }) as unknown as (...args: unknown[]) => unknown,
          undefined,
          1 >>> 0,
          0 >>> 0
        );
        codeHookRegistered = true;
      } catch (e) {
        return {
          message: `Failed to register code hook: ${String(e)}`,
          executedInstructions: 0,
          stopReason: 'unknown'
        };
      }
    }

    // Run with instruction count limit as timeout mechanism. timeoutUs is in microseconds,
    // so convert to seconds first and then estimate roughly 1M instructions per second.
    const estimatedInstructionsPerSecond = 1_000_000;
    const timeoutSeconds = timeoutUs / 1_000_000;
    const maxInstructions = Math.max(
      1,
      Math.ceil(timeoutSeconds * estimatedInstructionsPerSecond)
    );

    if (this.arch === 'MIPS_R6') {
      (self as unknown as { postMessage: (msg: unknown) => void }).postMessage({
        type: 'debug',
        message: 'MIPS_R6 starting execution',
        data: { pc: `0x${pc.toString(16)}`, endAddress: `0x${endAddress.toString(16)}` }
      });
    }

    try {
      this.unicorn.emu_start(pc, endAddress, 0, maxInstructions);
    } catch {
      // Emulation stopped (reached instruction limit or other reason)
    } finally {
      try {
        if (hookHandle) (this.unicorn as unknown as { hook_del: (handle: unknown) => void }).hook_del(hookHandle);
      } catch {}
      try {
        if (codeTraceHandle) (this.unicorn as unknown as { hook_del: (handle: unknown) => void }).hook_del(codeTraceHandle);
      } catch {}
    }

    let pcAfter = this.unicorn.reg_read_i32(pcReg) >>> 0;

    if (memEventInfo) {
      const { storePc } = memEventInfo;
      // ARM: Pre-advance PC before any potential re-run
      // MIPS: Adjust PC only if it still points to the store instruction
      if (this.arch === 'ARM') {
        const sequentialPc = (storePc + 4) >>> 0;
        try { this.unicorn.reg_write_i32(pcReg, sequentialPc); } catch {}
        pcAfter = sequentialPc;
      } else if (this.arch === 'MIPS_R6') {
        // For MIPS_R6, we need to advance PC to avoid re-executing the same instruction
        // The hook fires during/after the store, but we need to ensure we don't re-run it
        const advancePc = (pcAfter + 4) >>> 0;
        try { this.unicorn.reg_write_i32(pcReg, advancePc); } catch {}

        (self as unknown as { postMessage: (msg: unknown) => void }).postMessage({
          type: 'debug',
          message: 'MIPS_R6 PC after memory write',
          data: {
            pcBefore: `0x${pcAfter.toString(16)}`,
            pcAfter: `0x${advancePc.toString(16)}`,
            storePc: `0x${storePc.toString(16)}`,
            action: 'advanced PC by 4'
          }
        });

        pcAfter = advancePc;
      } else if (pcAfter === storePc) {
        // For MIPS, only advance if PC still points to store instruction
        const sequentialPc = (storePc + 4) >>> 0;
        try { this.unicorn.reg_write_i32(pcReg, sequentialPc); } catch {}
        pcAfter = sequentialPc;
      }
    }

    let stopReason: 'mem-write' | 'end-of-code' | 'timeout' | 'unknown' = 'unknown';
    const memEvent = memEventInfo ? { address: memEventInfo.address, value: memEventInfo.value } : undefined;
    if (memEvent) {
      stopReason = 'mem-write';
    } else if (pcAfter >= endAddress) {
      stopReason = 'end-of-code';
    } else {
      // If stopped without mem-write or reaching end, it must be timeout (instruction limit reached)
      stopReason = 'timeout';
    }

    return {
      message: `Run stopped: ${stopReason}${memEvent ? ` @0x${memEvent.address.toString(16)}=${memEvent.value}` : ''}`,
      executedInstructions: 0,
      stopReason,
      memEvent
    };
  }
}
