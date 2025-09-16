// Execution engine for ARM/MIPS instructions

import { UnicornInstance, UnicornGlobal, StepResult, EmulatorConfig, Architecture } from './types';
import { LiteralPoolDetector } from './literal-pool';
import { MemoryManager } from './memory-manager';

export class ExecutionEngine {
  private unicorn: UnicornInstance;
  private uc: UnicornGlobal;
  private config: EmulatorConfig;
  private literalPoolDetector: LiteralPoolDetector;
  private memoryManager: MemoryManager;
  private literalPoolAddresses: Set<number> = new Set();
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
    if (this.arch === 'MIPS') {
      // MIPS32 big-endian in our configuration
      return (((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0);
    }
    // ARM little-endian (ARM state, 32-bit)
    return (((bytes[3] << 24) | (bytes[2] << 16) | (bytes[1] << 8) | bytes[0]) >>> 0);
  }

  // Note: we use a fixed 4KB code window starting at codeAddress

  stepExecution(): void {
    const pcReg = this.arch === 'MIPS' ? (this.uc.MIPS_REG_PC ?? (this.uc as unknown as Record<string, number>).MIPS_REG_PC)! : this.uc.ARM_REG_PC;
    const pc = this.unicorn.reg_read_i32(pcReg);
    const endAddress = this.config.codeAddress + 4096;
    this.unicorn.emu_start(pc, endAddress, 0, 1);
  }

  stepDebugExecution(): StepResult {
    // Get state before execution
    const pcReg = this.arch === 'MIPS' ? (this.uc.MIPS_REG_PC ?? (this.uc as unknown as Record<string, number>).MIPS_REG_PC)! : this.uc.ARM_REG_PC;
    const pcBefore = this.unicorn.reg_read_i32(pcReg);
    const registersBefore = this.memoryManager.getAllRegisters();
    let memWriteEvent: { address: number; value: number; size: number } | undefined;
    
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
    } catch (e) {
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
          registers: undefined
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
            registers: undefined
          };
        }
        
        this.unicorn.reg_write_i32(pcReg, pcAfter);
        stepMessage = 'Skipped literal pool data';
        
        // Mark this address as literal pool for future reference
        this.literalPoolAddresses.add(pcBefore);
      }
    } else {
      // Register a temporary memory-write hook for the command byte address
      let hookHandle: unknown | undefined;
      const cb = (
        _handle: unknown,
        type: number,
        addr_lo: number,
        _addr_hi: number,
        size: number,
        value_lo: number,
        _value_hi: number
      ) => {
        if (type !== this.uc.MEM_WRITE) return;
        const addr = addr_lo >>> 0;
        if (addr !== this.config.dataAddress) return; // 0x30000
        const written = (value_lo >>> 0) & (size >= 1 ? 0xff : 0xffffffff);
        const value = size === 1 ? written : (written & 0xff);
        memWriteEvent = { address: addr, value, size };
      };

      try {
        const begin = this.config.dataAddress >>> 0;
        const end = (this.config.dataAddress + 1) >>> 0;
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
      } catch (e) {}

      const endAddress = this.config.codeAddress + 4096;

      // For ARM: Use simple single-instruction execution
      if (this.arch === 'ARM') {
        try {
          this.unicorn.emu_start(pcBefore, endAddress, 0, 1);
        } catch (e) {}
        pcAfter = this.unicorn.reg_read_i32(pcReg);
      } else {
        // For MIPS: Use HOOK_CODE counting to handle delay slots correctly
        let desiredCount = 1;
        try {
          const ins = this.decodeInstr32(instructionBytes);
          const op = (ins >>> 26) & 0x3f;
          const isRegImm = op === 0x01; // BLTZ/BGEZ and variants
          const isJ = op === 0x02 || op === 0x03; // J, JAL
          const isBranch = op === 0x04 || op === 0x05 || op === 0x06 || op === 0x07 ||
                           op === 0x14 || op === 0x15 || op === 0x16 || op === 0x17 || isRegImm; // BEQ/BNE/BLEZ/BGTZ and likely variants
          const isRType = op === 0x00;
          const funct = ins & 0x3f;
          const isJR = isRType && (funct === 0x08 || funct === 0x09); // JR/JALR
          if (isJ || isBranch || isJR) {
            desiredCount = 2; // include delay slot
          }
        } catch (e) {}

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
            ((...args: unknown[]) => {
              executed++;
              if (executed >= targetHookCount) {
                try { this.unicorn.emu_stop(); } catch {}
              }
            }) as unknown as (...args: unknown[]) => unknown,
            undefined,
            begin,
            end
          );
        } catch (e) {}

        try {
          // Large budget; hook will stop us after desired instructions
          const maxCount = 0x7fffffff;
          this.unicorn.emu_start(pcBefore, endAddress, 0, maxCount);
        } catch (e) {}
        finally {
          try { if (codeHook) (this.unicorn as unknown as { hook_del: (h: unknown) => void }).hook_del(codeHook); } catch {}
        }

        pcAfter = this.unicorn.reg_read_i32(pcReg);
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
      memWriteEvent
    };
  }

  runExecution(instructionCount?: number): { message: string; executedInstructions: number } {
    const maxInstructions = instructionCount || 1000;
    let executedInstructions = 0;

    // Safe execution loop - check each instruction before executing
    while (executedInstructions < maxInstructions) {
      const pcReg = this.arch === 'MIPS' ? (this.uc.MIPS_REG_PC ?? (this.uc as unknown as Record<string, number>).MIPS_REG_PC)! : this.uc.ARM_REG_PC;
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
    timeoutUs: number = 3_000_000
  ): { message: string; executedInstructions: number; stopReason: 'mem-write' | 'end-of-code' | 'timeout' | 'unknown'; memEvent?: { address: number; value: number } } {
    const endAddress = this.config.codeAddress + 4096;
    const pcReg = this.arch === 'MIPS' ? (this.uc.MIPS_REG_PC ?? (this.uc as unknown as Record<string, number>).MIPS_REG_PC)! : this.uc.ARM_REG_PC;
    const pc = this.unicorn.reg_read_i32(pcReg);

    let memEvent: { address: number; value: number } | undefined;

    const cb = (
      _handle: unknown,
      type: number,
      addr_lo: number,
      _addr_hi: number,
      size: number,
      value_lo: number,
      _value_hi: number
    ) => {
      // Only care about write events (use MEM_WRITE, not HOOK flag)
      if (type !== this.uc.MEM_WRITE) return;
      const addr = addr_lo >>> 0;
      if (addr !== untilAddress) return;
      // Extract the written value (for 1-byte writes use LSB)
      const written = (value_lo >>> 0) & (size >= 1 ? 0xff : 0xffffffff);
      const value = size === 1 ? written : (written & 0xff);
      if (!validValues.includes(value)) return;
      memEvent = { address: addr, value };
      // Advance PC to next instruction to avoid re-executing the same STR on resume (ARM state = 4 bytes)
      try {
        const pcNow = this.unicorn.reg_read_i32(pcReg);
        // MIPS and ARM both use 4-byte fixed length (MIPS32 and ARM state), so add 4
        this.unicorn.reg_write_i32(pcReg, (pcNow + 4) >>> 0);
      } catch {}
      // Stop emulation immediately
      try { this.unicorn.emu_stop(); } catch {}
    };

    // Register hook only for the data command byte address range
    let hookHandle: unknown | undefined;
    try {
      // Only register for the single command byte address: [0x30000, 0x30001)
      const begin = untilAddress >>> 0;
      const end = (untilAddress + 1) >>> 0;
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
      // If hook registration fails, fallback to immediate stop to avoid deadlock
      return {
        message: `Failed to register memory hook: ${String(e)}`,
        executedInstructions: 0,
        stopReason: 'unknown'
      };
    }

    // Run with instruction count limit as timeout mechanism. timeoutUs is in microseconds,
    // so convert to seconds first and then estimate roughly 1M instructions per second.
    const estimatedInstructionsPerSecond = 1_000_000;
    const timeoutSeconds = timeoutUs / 1_000_000;
    const maxInstructions = Math.max(
      1,
      Math.ceil(timeoutSeconds * estimatedInstructionsPerSecond)
    );

    try {
      this.unicorn.emu_start(pc, endAddress, 0, maxInstructions);
    } catch (_e) {
      // Emulation stopped (reached instruction limit or other reason)
    } finally {
      try { if (hookHandle) (this.unicorn as unknown as { hook_del: (handle: unknown) => void }).hook_del(hookHandle); } catch {}
    }

    const pcAfter = this.unicorn.reg_read_i32(pcReg);
    let stopReason: 'mem-write' | 'end-of-code' | 'timeout' | 'unknown' = 'unknown';
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
