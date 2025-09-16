// Code highlighter for single-step debugging using DWARF debug information
// Uses GNU Assembler DWARF line mappings for accurate highlighting

import { ARMAssembler, GASTarget } from './assembler';

interface AddressMapping {
  address: number;
  lineNumber: number;
  instruction: string;
  sourceContent: string;
}

export interface HighlightInfo {
  lineNumber: number;
  address: number;
  instruction: string;
  isActive: boolean;
}

export class CodeHighlighter {
  private addressMap: Map<number, AddressMapping> = new Map();
  private baseAddress: number;
  private lastHighlightInfo: HighlightInfo | null = null;
  private target: GASTarget;

  constructor(options: { baseAddress?: number; target?: GASTarget } = {}) {
    this.baseAddress = options.baseAddress || 0x10000;
    this.target = options.target || 'armv7-linux-gnueabihf';
  }

  /**
   * Initialize the highlighter by processing source code with GAS and DWARF
   */
  async initialize(sourceCode: string): Promise<void> {
    const assembler = new ARMAssembler({ baseAddress: this.baseAddress, target: this.target });
    
    try {
      await assembler.initialize();
      await assembler.assemble(sourceCode);
      const lineMappingInfo = await assembler.getLineMappingInfo(sourceCode);

      // Create address mapping from DWARF line mapping info
      this.createAddressMappingFromDWARF(sourceCode, lineMappingInfo);

    } catch (error) {
      console.error('[CodeHighlighter] Failed to initialize:', error);
      throw error;
    } finally {
      assembler.destroy();
    }
  }

  /**
   * Create address mapping from DWARF line mapping information
   */
  private createAddressMappingFromDWARF(sourceCode: string, lineMappingInfo: Array<{ address: number; lineNumber: number }>): void {
    const sourceLines = sourceCode.split('\n');

    lineMappingInfo.forEach((debugLine) => {
      const sourceContent = sourceLines[debugLine.lineNumber - 1] || '';
      const instruction = this.extractInstructionFromSource(sourceContent);
      
      const mapping: AddressMapping = {
        address: debugLine.address,
        lineNumber: debugLine.lineNumber,
        instruction,
        sourceContent: sourceContent.trim()
      };
      
      this.addressMap.set(debugLine.address, mapping);
    });
  }

  /**
   * Extract instruction name from source code line
   */
  private extractInstructionFromSource(sourceLine: string): string {
    const trimmed = sourceLine.trim();
    if (!trimmed) return 'nop';
    
    // Extract first word (instruction mnemonic)
    const match = trimmed.match(/^\s*([a-zA-Z][a-zA-Z0-9]*)/);
    return match ? match[1] : 'unknown';
  }

  /**
   * Get the line number that should be highlighted for a given PC address
   */
  getHighlightLine(pcAddress: number): HighlightInfo | null {
    const mapping = this.addressMap.get(pcAddress);
    if (mapping) {
      // Found mapping - update and return new highlight info
      this.lastHighlightInfo = {
        lineNumber: mapping.lineNumber,
        address: mapping.address,
        instruction: mapping.instruction,
        isActive: true
      };
      return this.lastHighlightInfo;
    }
    
    // No mapping found - return the last highlight info to keep previous line highlighted
    return this.lastHighlightInfo;
  }

  /**
   * Get all address mappings
   */
  getAllMappings(): AddressMapping[] {
    return Array.from(this.addressMap.values()).sort((a, b) => a.address - b.address);
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.addressMap.clear();
    this.lastHighlightInfo = null;
  }
}

// Factory function for backward compatibility
export const createHighlighter = (options?: { baseAddress?: number; target?: GASTarget }): CodeHighlighter => {
  return new CodeHighlighter(options);
};

// Utility function to get highlight info from step result
export const getHighlightFromStepResult = (
  stepResult: { pc?: number; instruction?: { address: number } },
  highlighter: CodeHighlighter
): HighlightInfo | null => {
  // Highlight the instruction that was just executed (pcBefore)
  const addr = stepResult.instruction?.address;
  if (typeof addr !== 'number') return null;
  return highlighter.getHighlightLine(addr);
};
