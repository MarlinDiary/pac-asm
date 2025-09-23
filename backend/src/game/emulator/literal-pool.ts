// Literal pool detection and handling utilities

import { UnicornInstance, EmulatorConfig } from './types';

export class LiteralPoolDetector {
  constructor(private config: EmulatorConfig) {}

  // Check if an instruction looks like data (likely literal pool)
  isLikelyLiteralPool(instructionBytes: number[]): boolean {
    if (instructionBytes.length !== 4) return false;
    
    const instruction = (instructionBytes[3] << 24) | (instructionBytes[2] << 16) | 
                       (instructionBytes[1] << 8) | instructionBytes[0];
    
    // Check for all zeros (padding/end of code)
    if (instruction === 0x00000000) {
      return true; // Treat as literal pool to stop execution
    }
    
    // Check if it looks like an address in our memory ranges
    if ((instruction >= this.config.codeAddress && instruction < this.config.codeAddress + 4096) ||
        (instruction >= this.config.stackAddress && instruction < this.config.stackAddress + this.config.stackSize) ||
        (instruction >= this.config.dataAddress && instruction < this.config.dataAddress + this.config.dataSize)) {
      return true;
    }
    
    // Check for invalid instruction patterns
    // ARM instructions have specific bit patterns in certain positions
    const condition = (instruction >>> 28) & 0xF;
    const opcode = (instruction >>> 21) & 0xF;
    
    // If condition field is invalid (0xF is reserved in many contexts)
    // and it doesn't look like a valid instruction pattern
    if (condition === 0xF && (opcode > 0xF || (instruction & 0x0FFFFFFF) > 0x0FFFFFFF)) {
      return true;
    }
    
    return false;
  }

  // Find next valid instruction address by skipping literal pool
  findNextInstruction(currentPc: number, unicorn: UnicornInstance): number {
    const nextPc = currentPc + 4; // Start from next 4-byte aligned address
    const maxSkip = 16; // Maximum bytes to skip (4 words)
    
    for (let offset = 0; offset <= maxSkip; offset += 4) {
      try {
        const testAddress = nextPc + offset;
        const testBytes = Array.from(unicorn.mem_read(testAddress, 4));
        
        if (!this.isLikelyLiteralPool(testBytes)) {
          return testAddress;
        }
      } catch {
        break;
      }
    }
    
    return this.config.codeAddress + 4096; // Return end address to stop execution
  }
}