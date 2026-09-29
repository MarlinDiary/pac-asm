// Execution engine for ARM and MIPS R6 instructions

import { EMULATOR_RUN_TIMEOUT_US, formatRuntimeError } from './errors';
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
  private analyzedCode?: readonly number[];
  private needsMipsBoundaryHook = false;

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
    // R6 retains delayed branches alongside compact branches. Opcodes 6/7
    // are delayed BLEZ/BGTZ only when rt is zero; other encodings are compact.
    const op = instruction >>> 26;
    const rt = (instruction >>> 16) & 0x1f;
    if (op === 2 || op === 3 || op === 4 || op === 5) return true;
    if (op === 6 || op === 7) return rt === 0;
    if (op === 1) return rt === 0 || rt === 1 || rt === 0x11;
    if (op === 0) return (instruction & 0x3f) === 9; // JALR (including JR alias)
    if (op === 0x11 || op === 0x12) {
      const rs = (instruction >>> 21) & 0x1f;
      return rs === 9 || rs === 13; // BC1/2EQZ, BC1/2NEZ
    }
    return false;
  }

  private hasMipsStoreInBranchSlot(): boolean {
    // Most R6 programs can retain the fast memory-hook-only path. A store
    // in a delayed/forbidden slot needs a code hook to stop at a completed
    // instruction boundary, after Unicorn has resolved the branch state.
    const code = this.memoryManager.getLoadedCode();
    if (this.analyzedCode === code) return this.needsMipsBoundaryHook;
    this.analyzedCode = code;
    this.needsMipsBoundaryHook = false;
    for (let i = 4; i + 3 < code.length; i += 4) {
      const op = code[i] >>> 2;
      // Include integer, FP and SPECIAL3 (R6 SC) stores conservatively.
      if (op !== 0x1f && op !== 0x28 && op !== 0x29 && op !== 0x2a &&
          op !== 0x2b && op !== 0x2e && op !== 0x38 && op !== 0x39 && op !== 0x3d) continue;
      const previous = this.decodeInstr32(Array.from(code.slice(i - 4, i)));
      const prevOp = previous >>> 26;
      if (this.isMipsBranchOrJump(previous) || prevOp === 6 || prevOp === 7 ||
          prevOp === 8 || prevOp === 0x18 || prevOp === 0x16 || prevOp === 0x17 ||
          prevOp === 0x36 || prevOp === 0x3e) {
        this.needsMipsBoundaryHook = true;
        break;
      }
    }
    return this.needsMipsBoundaryHook;
  }

  private isMipsCompactBranch(word: number): boolean {
    const op = word >>> 26;
    const rt = (word >>> 16) & 31;
    return ((op === 6 || op === 7) && rt !== 0) ||
      [8, 0x18, 0x16, 0x17, 0x32, 0x3a, 0x36, 0x3e].includes(op);
  }

  private mipsCompactFallsThrough(word: number): boolean {
    // Latch the condition BEFORE executing a slot that may change its operands.
    // This selects a completed pause boundary; Unicorn still executes the CPU.
    const op = word >>> 26, rs = (word >>> 21) & 31, rt = (word >>> 16) & 31;
    if (op === 0x32 || op === 0x3a || ((op === 0x36 || op === 0x3e) && rs === 0)) return false;
    const names = 'zero at v0 v1 a0 a1 a2 a3 t0 t1 t2 t3 t4 t5 t6 t7 s0 s1 s2 s3 s4 s5 s6 s7 t8 t9 k0 k1 gp sp fp ra'.split(' ');
    const a = this.memoryManager.getRegister(names[rs]).value >>> 0;
    const b = this.memoryManager.getRegister(names[rt]).value >>> 0;
    let taken: boolean;
    if (op === 8 || op === 0x18) {
      if (rs >= rt) {
        const sum = (a | 0) + (b | 0);
        const overflow = sum < -0x80000000 || sum > 0x7fffffff;
        taken = op === 8 ? overflow : !overflow;
      } else taken = op === 8 ? a === b : a !== b;
    } else if (op === 6 || op === 0x16) {
      taken = rs === 0 ? (b | 0) <= 0 : rs === rt ? (b | 0) >= 0 :
        op === 6 ? a >= b : (a | 0) >= (b | 0);
    } else if (op === 7 || op === 0x17) {
      taken = rs === 0 ? (b | 0) > 0 : rs === rt ? (b | 0) < 0 :
        op === 7 ? a < b : (a | 0) < (b | 0);
    } else if (op === 0x36 || op === 0x3e) {
      taken = op === 0x36 ? a === 0 : a !== 0;
    } else return false;
    return !taken;
  }

  private executeInstructionBoundary(pc: number, endAddress: number, word: number): void {
    const delayed = this.arch === 'MIPS_R6' && this.isMipsBranchOrJump(word);
    const compact = this.arch === 'MIPS_R6' && this.isMipsCompactBranch(word);
    if (!delayed && !compact) {
      this.unicorn.emu_start(pc, endAddress, 0, 1);
      return;
    }
    // This WASM can complete a delay/forbidden slot even when emu_stop is
    // requested by its code hook. Stopping there can skip later memory hooks.
    // Latch the compact branch condition before its slot changes registers,
    // and stop at the first boundary after the complete branch operation.
    const hasSlot = delayed || (compact && this.mipsCompactFallsThrough(word));
    const stopAt = hasSlot ? 3 : 2;
    let visited = 0;
    const hook = this.unicorn.hook_add(this.uc.HOOK_CODE, () => {
      if (++visited === stopAt) this.unicorn.emu_stop();
    }, undefined, 1, 0);
    try {
      this.unicorn.emu_start(pc, endAddress, 0, 0);
    } finally {
      this.unicorn.hook_del(hook);
    }
  }

  private extractMemoryHookEvent(args: unknown[]): { type: number; addr: number; size: number; value: number } | null {
    if (!Array.isArray(args)) {
      args = Array.from(args as IArguments)
    }
    if (args.length < 4) {
      return null
    }

    const typeRaw = args[1]
    let typeNum: number
    if (typeof typeRaw === 'number') {
      typeNum = typeRaw >>> 0
    } else if (typeof typeRaw === 'bigint') {
      typeNum = Number((typeRaw as bigint) & BigInt(0xffffffff)) >>> 0
    } else {
      return null
    }

    if (
      args.length >= 5 &&
      typeof args[2] === 'number' &&
      typeof args[3] === 'number' &&
      typeof args[4] === 'number' &&
      typeof args[5] !== 'number'
    ) {
      return {
        type: typeNum,
        addr: (args[2] as number) >>> 0,
        size: (args[3] as number) >>> 0,
        value: (args[4] as number) >>> 0
      }
    }

    // WASM builds (ARM & MIPS) surface addr/value as BigInt via emscripten
    if (
      args.length >= 5 &&
      typeof args[2] === 'bigint' &&
      typeof args[3] === 'number' &&
      typeof args[4] === 'bigint'
    ) {
      return {
        type: typeNum,
        addr: Number((args[2] as bigint) & BigInt(0xffffffff)),
        size: (args[3] as number) >>> 0,
        value: Number((args[4] as bigint) & BigInt(0xffffffff))
      }
    }

    if (
      args.length >= 6 &&
      typeof args[2] === 'number' &&
      typeof args[4] === 'number' &&
      typeof args[5] === 'number'
    ) {
      return {
        type: typeNum,
        addr: (args[2] as number) >>> 0,
        size: (args[4] as number) >>> 0,
        value: (args[5] as number) >>> 0
      }
    }

    return null
  }

  private normalizeCommandValue(value: number, size: number, validValues?: number[]): number {
    const candidates = new Set<number>()
    const unsigned = value >>> 0

    for (let i = 0; i < size; i++) {
      const shift = i * 8
      candidates.add((unsigned >>> shift) & 0xff)
    }

    for (let i = 0; i < size; i++) {
      const shift = (size - 1 - i) * 8
      candidates.add((unsigned >>> shift) & 0xff)
    }

    candidates.add(unsigned & 0xff)

    const candidateArray = Array.from(candidates)

    if (validValues && validValues.length > 0) {
      const match = candidateArray.find(byte => validValues.includes(byte))
      if (match !== undefined) {
        return match
      }
    }

    const nonZero = candidateArray.find(byte => byte !== 0)
    if (nonZero !== undefined) {
      return nonZero
    }

    return candidateArray[0] ?? (unsigned & 0xff)
  }

  // Note: we use a fixed code window starting at codeAddress

  stepExecution(): void {
    const pcReg = (this.arch === 'MIPS_R6')
      ? (this.uc.MIPS_REG_PC ?? (this.uc as unknown as Record<string, number>).MIPS_REG_PC)!
      : this.uc.ARM_REG_PC;
    const pc = this.unicorn.reg_read_i32(pcReg);
    const endAddress = this.config.codeAddress + this.config.codeSize;
    const word = this.arch === 'MIPS_R6' ? this.decodeInstr32(Array.from(this.unicorn.mem_read(pc, 4))) : 0;
    this.executeInstructionBoundary(pc, endAddress, word);
  }

  stepDebugExecution(): StepResult {
    const pcReg = (this.arch === 'MIPS_R6')
      ? (this.uc.MIPS_REG_PC ?? (this.uc as unknown as Record<string, number>).MIPS_REG_PC)!
      : this.uc.ARM_REG_PC
    const pcBefore = this.unicorn.reg_read_i32(pcReg)
    const registersBefore = this.memoryManager.getAllRegisters()
    let memWriteEvent: { address: number; value: number; size: number } | undefined
    const executedAddresses: number[] = []

    let instructionBytes: number[] = []
    let instructionHex = ''
    let isLiteralPool = false

    try {
      instructionBytes = Array.from(this.unicorn.mem_read(pcBefore, 4))
      instructionHex = instructionBytes.map(b => b.toString(16).padStart(2, '0')).join(' ')
      isLiteralPool = this.arch === 'ARM' ? this.literalPoolDetector.isLikelyLiteralPool(instructionBytes) : false
    } catch {
      instructionHex = 'INVALID'
    }

    let pcAfter: number
    let stepMessage = 'Step executed successfully'

    if (isLiteralPool) {
      const instruction = (instructionBytes[3] << 24) | (instructionBytes[2] << 16) |
        (instructionBytes[1] << 8) | instructionBytes[0]

      if (instruction === 0x00000000) {
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
        }
      }

      pcAfter = this.literalPoolDetector.findNextInstruction(pcBefore, this.unicorn)
      if (pcAfter >= this.config.codeAddress + this.config.codeSize) {
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
        }
      }

      this.unicorn.reg_write_i32(pcReg, pcAfter)
      stepMessage = 'Skipped literal pool data'
    } else {
      let hookHandle: unknown | undefined
      const cb = (...hookArgs: unknown[]) => {
        const event = this.extractMemoryHookEvent(hookArgs)
        if (!event) {
          return
        }
        const { type, addr, size, value } = event
        if (type !== this.uc.MEM_WRITE) return
        if (addr < this.config.dataAddress || addr >= this.config.dataAddress + 4) return
        const normalizedValue = this.normalizeCommandValue(value, size)
        memWriteEvent = { address: this.config.dataAddress, value: normalizedValue, size }
      }

      try {
        const begin = this.config.dataAddress >>> 0
        const end = (this.config.dataAddress + 4) >>> 0
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
        )
      } catch {}

      const endAddress = this.config.codeAddress + this.config.codeSize
      executedAddresses.push(pcBefore >>> 0)

      const word = this.decodeInstr32(instructionBytes);
      const hasSlot = this.arch === 'MIPS_R6' && (this.isMipsBranchOrJump(word) ||
        (this.isMipsCompactBranch(word) && this.mipsCompactFallsThrough(word)));
      try {
        this.executeInstructionBoundary(pcBefore, endAddress, word);
        if (hasSlot) executedAddresses.push((pcBefore + 4) >>> 0);
      } catch (error) {
        try { if (hookHandle) this.unicorn.hook_del(hookHandle); } catch {}
        throw new Error(formatRuntimeError('Instruction execution failed', String(error)));
      }
      pcAfter = this.unicorn.reg_read_i32(pcReg);

      try {
        if (hookHandle) (this.unicorn as unknown as { hook_del: (handle: unknown) => void }).hook_del(hookHandle)
      } catch {}
    }

    const registersAfter = this.memoryManager.getAllRegisters()
    const changedRegisters = registersAfter.filter((regAfter, index) => {
      const regBefore = registersBefore[index]
      return regAfter.value !== regBefore.value
    })

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
    }
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
      if (pc >= this.config.codeAddress + this.config.codeSize) {
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
          if (nextPc >= this.config.codeAddress + this.config.codeSize) {
            break;
          }
          
          this.unicorn.reg_write_i32(pcReg, nextPc);
          continue; // Don't count this as an executed instruction
      }
    } else {
      // Execute one instruction normally
        const endAddress = this.config.codeAddress + this.config.codeSize;
        this.executeInstructionBoundary(pc, endAddress, this.decodeInstr32(instructionBytes));
        executedInstructions++;
        
        // A self-branch can do real work in its slot. The instruction budget,
        // not an unchanged PC, bounds this loop.
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
    const endAddress = this.config.codeAddress + this.config.codeSize
    const pcReg = (this.arch === 'MIPS_R6')
      ? (this.uc.MIPS_REG_PC ?? (this.uc as unknown as Record<string, number>).MIPS_REG_PC)!
      : this.uc.ARM_REG_PC
    const pc = this.unicorn.reg_read_i32(pcReg)

    let memEventInfo: { address: number; value: number; storePc: number; nextPc?: number } | undefined
    let lastExecutedPc: number | undefined
    let stopPending = false
    let codeHookRegistered = false
    const shouldUseCodeHook = this.arch !== 'MIPS_R6' || this.hasMipsStoreInBranchSlot()

    const cb = (...hookArgs: unknown[]) => {
      const event = this.extractMemoryHookEvent(hookArgs)
      if (!event) {
        return
      }
      const { type, addr, size, value } = event

      if (type !== this.uc.MEM_WRITE) return
      if (addr < untilAddress || addr >= untilAddress + 4) return
      const normalizedValue = this.normalizeCommandValue(value, size, validValues)
      if (!validValues.includes(normalizedValue)) return

      let storePc = lastExecutedPc ?? 0
      let nextPc: number | undefined

      if (codeHookRegistered && shouldUseCodeHook) {
        stopPending = true
        const rawPc = this.unicorn.reg_read_i32(pcReg) >>> 0
        if (storePc === 0) {
          storePc = rawPc >= 4 ? ((rawPc - 4) >>> 0) : rawPc
        }
        nextPc = rawPc
      } else {
        // For an ordinary store, this WASM exposes the store's own PC.
        const rawPc = this.unicorn.reg_read_i32(pcReg) >>> 0;
        storePc = rawPc;
        nextPc = rawPc;
      }

      memEventInfo = { address: untilAddress, value: normalizedValue, storePc, nextPc }
      if (this.arch !== 'MIPS_R6' || !codeHookRegistered) {
        this.unicorn.emu_stop();
      }
    }

    let hookHandle: unknown | undefined
    let codeTraceHandle: unknown | undefined

    try {
      const begin = untilAddress >>> 0
      const end = (untilAddress + 4) >>> 0
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
      )
    } catch (e) {
      return {
        message: `Failed to register memory hook: ${String(e)}`,
        executedInstructions: 0,
        stopReason: 'unknown'
      }
    }

    if (shouldUseCodeHook) {
      try {
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
            let addr = 0
            if (typeof args[1] === 'number') {
              addr = args[1]
            } else if (typeof args[1] === 'bigint') {
              addr = Number((args[1] as bigint) & BigInt(0xffffffff))
            }
            lastExecutedPc = addr >>> 0

            if (stopPending) {
              stopPending = false
              try { this.unicorn.emu_stop() } catch {}
            }
          }) as unknown as (...args: unknown[]) => unknown,
          undefined,
          1 >>> 0,
          0 >>> 0
        )
        codeHookRegistered = true
      } catch (e) {
        return {
          message: `Failed to register code hook: ${String(e)}`,
          executedInstructions: 0,
          stopReason: 'unknown'
        }
      }
    }

    try {
      this.unicorn.emu_start(pc, endAddress, 0, 0)
    } catch (error) {
      throw new Error(formatRuntimeError('Emulation failed', String(error)));
    } finally {
      try {
        if (hookHandle) (this.unicorn as unknown as { hook_del: (handle: unknown) => void }).hook_del(hookHandle)
      } catch {}
      try {
        if (codeTraceHandle) (this.unicorn as unknown as { hook_del: (handle: unknown) => void }).hook_del(codeTraceHandle)
      } catch {}
    }

    let pcAfter = this.unicorn.reg_read_i32(pcReg) >>> 0

    if (memEventInfo) {
      const { storePc, nextPc } = memEventInfo
      if (this.arch === 'ARM') {
        const basePc = nextPc ?? storePc
        const sequentialPc = (basePc + 4) >>> 0
        try { this.unicorn.reg_write_i32(pcReg, sequentialPc) } catch {}
        pcAfter = sequentialPc
      } else if (this.arch === 'MIPS_R6' && !codeHookRegistered) {
        const advancePc = (pcAfter + 4) >>> 0
        try { this.unicorn.reg_write_i32(pcReg, advancePc) } catch {}
        pcAfter = advancePc
      } else if (this.arch !== 'MIPS_R6' && pcAfter === storePc) {
        const sequentialPc = ((nextPc ?? storePc) + 4) >>> 0
        try { this.unicorn.reg_write_i32(pcReg, sequentialPc) } catch {}
        pcAfter = sequentialPc
      }
    }

    let stopReason: 'mem-write' | 'end-of-code' | 'timeout' | 'unknown' = 'unknown'
    const memEvent = memEventInfo ? { address: memEventInfo.address, value: memEventInfo.value } : undefined
    if (memEvent) {
      stopReason = 'mem-write'
    } else if (pcAfter >= endAddress) {
      stopReason = 'end-of-code'
    } else {
      stopReason = 'timeout'
    }

    return {
      message: `Run stopped: ${stopReason}${memEvent ? ` @0x${memEvent.address.toString(16)}=${memEvent.value}` : ''}`,
      executedInstructions: 0,
      stopReason,
      memEvent
    }
  }
}
