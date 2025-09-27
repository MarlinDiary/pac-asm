// Memory and register management

import { UnicornInstance, UnicornGlobal, RegisterInfo, EmulatorConfig, Architecture } from './types';

export class MemoryManager {
  private unicorn: UnicornInstance;
  private uc: UnicornGlobal;
  private config: EmulatorConfig;
  private arch: Architecture;

  constructor(unicorn: UnicornInstance, uc: UnicornGlobal, config: EmulatorConfig, arch: Architecture) {
    this.unicorn = unicorn;
    this.uc = uc;
    this.config = config;
    this.arch = arch;
  }

  initializeMemory(): void {
    // Map memory regions
    this.unicorn.mem_map(this.config.codeAddress, 4096, this.uc.PROT_ALL);
    this.unicorn.mem_map(this.config.stackAddress, this.config.stackSize, this.uc.PROT_READ | this.uc.PROT_WRITE);
    this.unicorn.mem_map(this.config.dataAddress, this.config.dataSize, this.uc.PROT_READ | this.uc.PROT_WRITE);
  }

  initializeRegisters(): void {
    if (this.arch === 'MIPS_R6') {
      // Initialize SP
      const sp = (this.uc.MIPS_REG_SP ?? (this.uc as unknown as Record<string, number>).MIPS_REG_SP)!;
      this.unicorn.reg_write_i32(sp, this.config.stackAddress + this.config.stackSize - 4);
      // Zero-out key registers (zero is read-only)
      const regs: number[] = [
        this.uc.MIPS_REG_AT!, this.uc.MIPS_REG_V0!, this.uc.MIPS_REG_V1!,
        this.uc.MIPS_REG_A0!, this.uc.MIPS_REG_A1!, this.uc.MIPS_REG_A2!, this.uc.MIPS_REG_A3!,
        this.uc.MIPS_REG_T0!, this.uc.MIPS_REG_T1!, this.uc.MIPS_REG_T2!, this.uc.MIPS_REG_T3!,
        this.uc.MIPS_REG_T4!, this.uc.MIPS_REG_T5!, this.uc.MIPS_REG_T6!, this.uc.MIPS_REG_T7!,
        this.uc.MIPS_REG_S0!, this.uc.MIPS_REG_S1!, this.uc.MIPS_REG_S2!, this.uc.MIPS_REG_S3!,
        this.uc.MIPS_REG_S4!, this.uc.MIPS_REG_S5!, this.uc.MIPS_REG_S6!, this.uc.MIPS_REG_S7!,
        this.uc.MIPS_REG_T8!, this.uc.MIPS_REG_T9!, this.uc.MIPS_REG_K0!, this.uc.MIPS_REG_K1!,
        this.uc.MIPS_REG_GP!, this.uc.MIPS_REG_FP!, this.uc.MIPS_REG_RA!,
        this.uc.MIPS_REG_HI!, this.uc.MIPS_REG_LO!
      ].filter(Boolean as unknown as <T>(x: T) => x is T);
      regs.forEach(r => { try { this.unicorn.reg_write_i32(r, 0); } catch {} });
    } else {
      // ARM
      this.unicorn.reg_write_i32(this.uc.ARM_REG_SP, this.config.stackAddress + this.config.stackSize - 4);
      const gpRegisters = [
        this.uc.ARM_REG_R0, this.uc.ARM_REG_R1, this.uc.ARM_REG_R2, this.uc.ARM_REG_R3,
        this.uc.ARM_REG_R4, this.uc.ARM_REG_R5, this.uc.ARM_REG_R6, this.uc.ARM_REG_R7,
        this.uc.ARM_REG_R8, this.uc.ARM_REG_R9, this.uc.ARM_REG_R10, this.uc.ARM_REG_R11,
        this.uc.ARM_REG_R12, this.uc.ARM_REG_LR
      ];
      gpRegisters.forEach(reg => { this.unicorn.reg_write_i32(reg, 0); });
    }
  }

  loadCode(machineCode: number[]): void {
    this.unicorn.mem_write(this.config.codeAddress, machineCode);
    const pcReg = (this.arch === 'MIPS_R6')
      ? (this.uc.MIPS_REG_PC ?? (this.uc as unknown as Record<string, number>).MIPS_REG_PC)!
      : this.uc.ARM_REG_PC;
    this.unicorn.reg_write_i32(pcReg, this.config.codeAddress);
  }

  setRegister(register: string, value: number): void {
    const arch = this.arch;
    let regMap: { [key: string]: number };
    if (arch === 'MIPS_R6') {
      regMap = {
        'zero': this.uc.MIPS_REG_ZERO!,
        'at': this.uc.MIPS_REG_AT!,
        'v0': this.uc.MIPS_REG_V0!, 'v1': this.uc.MIPS_REG_V1!,
        'a0': this.uc.MIPS_REG_A0!, 'a1': this.uc.MIPS_REG_A1!, 'a2': this.uc.MIPS_REG_A2!, 'a3': this.uc.MIPS_REG_A3!,
        't0': this.uc.MIPS_REG_T0!, 't1': this.uc.MIPS_REG_T1!, 't2': this.uc.MIPS_REG_T2!, 't3': this.uc.MIPS_REG_T3!,
        't4': this.uc.MIPS_REG_T4!, 't5': this.uc.MIPS_REG_T5!, 't6': this.uc.MIPS_REG_T6!, 't7': this.uc.MIPS_REG_T7!,
        's0': this.uc.MIPS_REG_S0!, 's1': this.uc.MIPS_REG_S1!, 's2': this.uc.MIPS_REG_S2!, 's3': this.uc.MIPS_REG_S3!,
        's4': this.uc.MIPS_REG_S4!, 's5': this.uc.MIPS_REG_S5!, 's6': this.uc.MIPS_REG_S6!, 's7': this.uc.MIPS_REG_S7!,
        't8': this.uc.MIPS_REG_T8!, 't9': this.uc.MIPS_REG_T9!,
        'k0': this.uc.MIPS_REG_K0!, 'k1': this.uc.MIPS_REG_K1!,
        'gp': this.uc.MIPS_REG_GP!, 'sp': this.uc.MIPS_REG_SP!, 'fp': this.uc.MIPS_REG_FP!, 'ra': this.uc.MIPS_REG_RA!,
        'pc': this.uc.MIPS_REG_PC!, 'hi': this.uc.MIPS_REG_HI!, 'lo': this.uc.MIPS_REG_LO!
      };
    } else {
      regMap = {
        'r0': this.uc.ARM_REG_R0, 'r1': this.uc.ARM_REG_R1, 'r2': this.uc.ARM_REG_R2, 'r3': this.uc.ARM_REG_R3,
        'r4': this.uc.ARM_REG_R4, 'r5': this.uc.ARM_REG_R5, 'r6': this.uc.ARM_REG_R6, 'r7': this.uc.ARM_REG_R7,
        'r8': this.uc.ARM_REG_R8, 'r9': this.uc.ARM_REG_R9, 'r10': this.uc.ARM_REG_R10, 'r11': this.uc.ARM_REG_R11,
        'r12': this.uc.ARM_REG_R12, 'sp': this.uc.ARM_REG_SP, 'lr': this.uc.ARM_REG_LR, 'pc': this.uc.ARM_REG_PC,
        'cpsr': this.uc.ARM_REG_CPSR,
      };
    }

    const regId = regMap[register.toLowerCase()];
    if (regId === undefined) {
      throw new Error('Unknown register');
    }

    this.unicorn.reg_write_i32(regId, value);
  }

  getRegister(register: string): RegisterInfo {
    let regMap: { [key: string]: number };
    if (this.arch === 'MIPS_R6') {
      regMap = {
        'zero': this.uc.MIPS_REG_ZERO!, 'at': this.uc.MIPS_REG_AT!,
        'v0': this.uc.MIPS_REG_V0!, 'v1': this.uc.MIPS_REG_V1!,
        'a0': this.uc.MIPS_REG_A0!, 'a1': this.uc.MIPS_REG_A1!, 'a2': this.uc.MIPS_REG_A2!, 'a3': this.uc.MIPS_REG_A3!,
        't0': this.uc.MIPS_REG_T0!, 't1': this.uc.MIPS_REG_T1!, 't2': this.uc.MIPS_REG_T2!, 't3': this.uc.MIPS_REG_T3!,
        't4': this.uc.MIPS_REG_T4!, 't5': this.uc.MIPS_REG_T5!, 't6': this.uc.MIPS_REG_T6!, 't7': this.uc.MIPS_REG_T7!,
        's0': this.uc.MIPS_REG_S0!, 's1': this.uc.MIPS_REG_S1!, 's2': this.uc.MIPS_REG_S2!, 's3': this.uc.MIPS_REG_S3!,
        's4': this.uc.MIPS_REG_S4!, 's5': this.uc.MIPS_REG_S5!, 's6': this.uc.MIPS_REG_S6!, 's7': this.uc.MIPS_REG_S7!,
        't8': this.uc.MIPS_REG_T8!, 't9': this.uc.MIPS_REG_T9!, 'k0': this.uc.MIPS_REG_K0!, 'k1': this.uc.MIPS_REG_K1!,
        'gp': this.uc.MIPS_REG_GP!, 'sp': this.uc.MIPS_REG_SP!, 'fp': this.uc.MIPS_REG_FP!, 'ra': this.uc.MIPS_REG_RA!,
        'pc': this.uc.MIPS_REG_PC!, 'hi': this.uc.MIPS_REG_HI!, 'lo': this.uc.MIPS_REG_LO!
      };
    } else {
      regMap = {
        'r0': this.uc.ARM_REG_R0, 'r1': this.uc.ARM_REG_R1, 'r2': this.uc.ARM_REG_R2, 'r3': this.uc.ARM_REG_R3,
        'r4': this.uc.ARM_REG_R4, 'r5': this.uc.ARM_REG_R5, 'r6': this.uc.ARM_REG_R6, 'r7': this.uc.ARM_REG_R7,
        'r8': this.uc.ARM_REG_R8, 'r9': this.uc.ARM_REG_R9, 'r10': this.uc.ARM_REG_R10, 'r11': this.uc.ARM_REG_R11,
        'r12': this.uc.ARM_REG_R12, 'sp': this.uc.ARM_REG_SP, 'lr': this.uc.ARM_REG_LR, 'pc': this.uc.ARM_REG_PC,
        'cpsr': this.uc.ARM_REG_CPSR,
      };
    }

    const regId = regMap[register.toLowerCase()];
    if (regId === undefined) {
      throw new Error('Unknown register');
    }

    const value = this.unicorn.reg_read_i32(regId);
    return {
      register,
      value,
      hex: `0x${value.toString(16).padStart(8, '0')}`
    };
  }

  getAllRegisters(): RegisterInfo[] {
    if (this.arch === 'MIPS_R6') {
      const regs = [
        { name: 'zero', id: this.uc.MIPS_REG_ZERO! },
        { name: 'at', id: this.uc.MIPS_REG_AT! },
        { name: 'v0', id: this.uc.MIPS_REG_V0! }, { name: 'v1', id: this.uc.MIPS_REG_V1! },
        { name: 'a0', id: this.uc.MIPS_REG_A0! }, { name: 'a1', id: this.uc.MIPS_REG_A1! }, { name: 'a2', id: this.uc.MIPS_REG_A2! }, { name: 'a3', id: this.uc.MIPS_REG_A3! },
        { name: 't0', id: this.uc.MIPS_REG_T0! }, { name: 't1', id: this.uc.MIPS_REG_T1! }, { name: 't2', id: this.uc.MIPS_REG_T2! }, { name: 't3', id: this.uc.MIPS_REG_T3! },
        { name: 't4', id: this.uc.MIPS_REG_T4! }, { name: 't5', id: this.uc.MIPS_REG_T5! }, { name: 't6', id: this.uc.MIPS_REG_T6! }, { name: 't7', id: this.uc.MIPS_REG_T7! },
        { name: 's0', id: this.uc.MIPS_REG_S0! }, { name: 's1', id: this.uc.MIPS_REG_S1! }, { name: 's2', id: this.uc.MIPS_REG_S2! }, { name: 's3', id: this.uc.MIPS_REG_S3! },
        { name: 's4', id: this.uc.MIPS_REG_S4! }, { name: 's5', id: this.uc.MIPS_REG_S5! }, { name: 's6', id: this.uc.MIPS_REG_S6! }, { name: 's7', id: this.uc.MIPS_REG_S7! },
        { name: 't8', id: this.uc.MIPS_REG_T8! }, { name: 't9', id: this.uc.MIPS_REG_T9! },
        { name: 'k0', id: this.uc.MIPS_REG_K0! }, { name: 'k1', id: this.uc.MIPS_REG_K1! },
        { name: 'gp', id: this.uc.MIPS_REG_GP! }, { name: 'sp', id: this.uc.MIPS_REG_SP! }, { name: 'fp', id: this.uc.MIPS_REG_FP! }, { name: 'ra', id: this.uc.MIPS_REG_RA! },
        { name: 'hi', id: this.uc.MIPS_REG_HI! }, { name: 'lo', id: this.uc.MIPS_REG_LO! },
        { name: 'pc', id: this.uc.MIPS_REG_PC! },
      ].filter(r => r.id !== undefined);

      return regs.map(reg => ({
        register: reg.name,
        value: this.unicorn.reg_read_i32(reg.id),
        hex: `0x${this.unicorn.reg_read_i32(reg.id).toString(16).padStart(8, '0')}`
      }));
    }

    const registers = [
      { name: 'r0', id: this.uc.ARM_REG_R0 }, { name: 'r1', id: this.uc.ARM_REG_R1 },
      { name: 'r2', id: this.uc.ARM_REG_R2 }, { name: 'r3', id: this.uc.ARM_REG_R3 },
      { name: 'r4', id: this.uc.ARM_REG_R4 }, { name: 'r5', id: this.uc.ARM_REG_R5 },
      { name: 'r6', id: this.uc.ARM_REG_R6 }, { name: 'r7', id: this.uc.ARM_REG_R7 },
      { name: 'r8', id: this.uc.ARM_REG_R8 }, { name: 'r9', id: this.uc.ARM_REG_R9 },
      { name: 'r10', id: this.uc.ARM_REG_R10 }, { name: 'r11', id: this.uc.ARM_REG_R11 },
      { name: 'r12', id: this.uc.ARM_REG_R12 }, { name: 'sp', id: this.uc.ARM_REG_SP },
      { name: 'lr', id: this.uc.ARM_REG_LR }, { name: 'pc', id: this.uc.ARM_REG_PC },
      { name: 'cpsr', id: this.uc.ARM_REG_CPSR }
    ];

    return registers.map(reg => ({
      register: reg.name,
      value: this.unicorn.reg_read_i32(reg.id),
      hex: `0x${this.unicorn.reg_read_i32(reg.id).toString(16).padStart(8, '0')}`
    }));
  }

  readMemory(address: number, size: number): { address: number; size: number; data: number[]; hex: string } {
    const data = this.unicorn.mem_read(address, size);
    return {
      address,
      size,
      data: Array.from(data),
      hex: Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' ')
    };
  }

  writeMemory(address: number, data: number[]): void {
    this.unicorn.mem_write(address, data);
  }

  resetRegisters(): void {
    if (this.arch === 'MIPS_R6') {
      const regs: number[] = [
        this.uc.MIPS_REG_AT!, this.uc.MIPS_REG_V0!, this.uc.MIPS_REG_V1!,
        this.uc.MIPS_REG_A0!, this.uc.MIPS_REG_A1!, this.uc.MIPS_REG_A2!, this.uc.MIPS_REG_A3!,
        this.uc.MIPS_REG_T0!, this.uc.MIPS_REG_T1!, this.uc.MIPS_REG_T2!, this.uc.MIPS_REG_T3!,
        this.uc.MIPS_REG_T4!, this.uc.MIPS_REG_T5!, this.uc.MIPS_REG_T6!, this.uc.MIPS_REG_T7!,
        this.uc.MIPS_REG_S0!, this.uc.MIPS_REG_S1!, this.uc.MIPS_REG_S2!, this.uc.MIPS_REG_S3!,
        this.uc.MIPS_REG_S4!, this.uc.MIPS_REG_S5!, this.uc.MIPS_REG_S6!, this.uc.MIPS_REG_S7!,
        this.uc.MIPS_REG_T8!, this.uc.MIPS_REG_T9!, this.uc.MIPS_REG_K0!, this.uc.MIPS_REG_K1!,
        this.uc.MIPS_REG_GP!, this.uc.MIPS_REG_FP!, this.uc.MIPS_REG_RA!,
        this.uc.MIPS_REG_HI!, this.uc.MIPS_REG_LO!
      ].filter(Boolean as unknown as <T>(x: T) => x is T);
      regs.forEach(r => { try { this.unicorn.reg_write_i32(r, 0); } catch {} });
      this.unicorn.reg_write_i32((this.uc.MIPS_REG_PC ?? (this.uc as unknown as Record<string, number>).MIPS_REG_PC)!, this.config.codeAddress);
      this.unicorn.reg_write_i32((this.uc.MIPS_REG_SP ?? (this.uc as unknown as Record<string, number>).MIPS_REG_SP)!, this.config.stackAddress + this.config.stackSize - 4);
    } else {
      const gpRegisters = [
        this.uc.ARM_REG_R0, this.uc.ARM_REG_R1, this.uc.ARM_REG_R2, this.uc.ARM_REG_R3,
        this.uc.ARM_REG_R4, this.uc.ARM_REG_R5, this.uc.ARM_REG_R6, this.uc.ARM_REG_R7,
        this.uc.ARM_REG_R8, this.uc.ARM_REG_R9, this.uc.ARM_REG_R10, this.uc.ARM_REG_R11,
        this.uc.ARM_REG_R12, this.uc.ARM_REG_LR
      ];
      gpRegisters.forEach(reg => { this.unicorn.reg_write_i32(reg, 0); });
      this.unicorn.reg_write_i32(this.uc.ARM_REG_PC, this.config.codeAddress);
      this.unicorn.reg_write_i32(this.uc.ARM_REG_SP, this.config.stackAddress + this.config.stackSize - 4);
    }
  }
}
