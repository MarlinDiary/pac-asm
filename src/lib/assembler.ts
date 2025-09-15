// ARM Assembly wrapper using GNU Assembler (GAS) via binutils-wasm
// Combines ELF parsing, GAS assembler, and high-level interface in one file

// ============================================================================
// ELF Parser
// ============================================================================

export interface ELFParseResult {
  machineCode: Uint8Array;
  textSectionOffset: number;
  textSectionSize: number;
}

export function extractMachineCode(elfData: Uint8Array): ELFParseResult {
  // Verify ELF magic
  if (elfData.length < 52 || 
      elfData[0] !== 0x7F || elfData[1] !== 0x45 || 
      elfData[2] !== 0x4C || elfData[3] !== 0x46) {
    throw new Error('Invalid ELF file');
  }
  
  const view = new DataView(elfData.buffer, elfData.byteOffset);
  const is32bit = elfData[4] === 1;
  const isLittleEndian = elfData[5] === 1;
  
  if (!is32bit) {
    throw new Error('Only 32-bit ELF supported');
  }
  
  // Get section header info from ELF header
  const shoff = view.getUint32(32, isLittleEndian);
  const shentsize = view.getUint16(46, isLittleEndian);
  const shnum = view.getUint16(48, isLittleEndian);
  const shstrndx = view.getUint16(50, isLittleEndian);
  
  // Get string table
  let stringTableOffset = 0;
  if (shstrndx < shnum) {
    const strTabHeaderOffset = shoff + shstrndx * shentsize;
    stringTableOffset = view.getUint32(strTabHeaderOffset + 16, isLittleEndian);
  }
  
  // Find .text section
  for (let i = 0; i < shnum; i++) {
    const headerOffset = shoff + i * shentsize;
    const nameOffset = view.getUint32(headerOffset, isLittleEndian);
    
    // Get section name
    let name = '';
    if (stringTableOffset > 0) {
      let nameAddr = stringTableOffset + nameOffset;
      while (nameAddr < elfData.length && elfData[nameAddr] !== 0) {
        name += String.fromCharCode(elfData[nameAddr]);
        nameAddr++;
      }
    }
    
    if (name === '.text') {
      const offset = view.getUint32(headerOffset + 16, isLittleEndian);
      const size = view.getUint32(headerOffset + 20, isLittleEndian);
      
      // Extract machine code
      const machineCode = new Uint8Array(size);
      for (let j = 0; j < size; j++) {
        machineCode[j] = elfData[offset + j];
      }
      
      return {
        machineCode,
        textSectionOffset: offset,
        textSectionSize: size
      };
    }
  }
  
  throw new Error('.text section not found in ELF');
}

// ============================================================================
// GNU Assembler Implementation
// ============================================================================

export type GASTarget = 'armv7-linux-gnueabihf' | 'mips-linux-gnu';

export interface GASAssemblerOptions {
  target?: GASTarget;
  baseAddress?: number;
}

export interface GASAssemblyResult {
  objectFile: Uint8Array;
  machineCode?: Uint8Array;
  debugInfo?: unknown;
  size: number;
}

export interface DebugLineInfo {
  address: number;
  lineNumber: number;
  fileName: string;
  isStmt?: boolean;
  discr?: number;
}

export class GASAssembler {
  private target: GASTarget;
  private baseAddress: number;
  private isInitialized = false;
  private gasInstance: unknown = null;
  private lastObjectFile: Uint8Array | null = null;

  constructor(options: GASAssemblerOptions = {}) {
    this.target = options.target || 'armv7-linux-gnueabihf';
    this.baseAddress = options.baseAddress || 0x10000;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Load GAS in browser
    const gasLoader = await import('@binutils-wasm/gas');
    this.gasInstance = await gasLoader.default(this.target);

    this.isInitialized = true;
  }

  async assemble(assembly: string): Promise<GASAssemblyResult> {
    if (!this.isInitialized) {
      throw new Error('Assembler not initialized. Call initialize() first');
    }

    try {
      let objectFile: Uint8Array | null = null;
      let errorOutput = '';

      // Assemble with debug info (-g)
      // Note: 'as' doesn't support '-c' (that's a gcc/ld option), so we omit it.
      // For MIPS, we need to specify --gdwarf-2 to generate DWARF debug info
      const args = this.target === 'mips-linux-gnu'
        ? ['-g', '--gdwarf-2', '-o', 'out.o', 'in.s']
        : ['-g', '-o', 'out.o', 'in.s'];
      if (this.baseAddress && this.baseAddress !== 0) {
        args.push('--defsym', `BASE_ADDR=0x${this.baseAddress.toString(16)}`);
      }

      await (this.gasInstance as CallableFunction)({
        arguments: args,
        preRun: [(module: unknown) => {
          (module as { FS: { writeFile: (name: string, content: string) => void } }).FS.writeFile('in.s', assembly);
        }],
        postRun: [(module: unknown) => {
          try {
            const fileData = (module as { FS: { readFile: (name: string) => ArrayBuffer } }).FS.readFile('out.o');
            objectFile = new Uint8Array(fileData);
          } catch (e) {
            // Failed to read object file - error will be handled by throwing below
          }
        }],
        print: () => {},
        printErr: (text: string) => { errorOutput += text + '\n'; }
      });

      if (errorOutput && !objectFile) {
        throw new Error(errorOutput.trim());
      }

      if (!objectFile) {
        throw new Error('No object file generated');
      }

      // Extract machine code from ELF .text section
      let machineCode: Uint8Array;
      try {
        const elfResult = extractMachineCode(objectFile);
        machineCode = elfResult.machineCode;
      } catch (error) {
        // If .text section is not found (e.g., empty input), return empty machine code
        machineCode = new Uint8Array(0);
      }

      // Store object file for DWARF parsing
      this.lastObjectFile = objectFile;

      return {
        objectFile,
        machineCode,
        debugInfo: null, // Will be populated by getLineMappingInfo
        size: machineCode.length
      };

    } catch (error) {
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  /**
   * Get line mapping information using objdump --dwarf=decodedline 
   */
  async getLineMappingInfo(assembly: string): Promise<DebugLineInfo[]> {
    if (!this.lastObjectFile) {
      throw new Error('No object file available. Call assemble() first.');
    }

    try {
      // Use objdump --dwarf=decodedline on frontend
      const binutilsLoader = await import('@binutils-wasm/binutils');
      const objdump = await binutilsLoader.default("objdump");
      
      let decoded = '';
      await (objdump as CallableFunction)({
        arguments: ['--dwarf=decodedline', 'output.o'],
        preRun: [(module: unknown) => {
          (module as { FS: { writeFile: (name: string, data: Uint8Array) => void } }).FS.writeFile('output.o', this.lastObjectFile!);
        }],
        print: (s: string) => { decoded += s + '\n'; },
        printErr: () => {} // Silently ignore objdump errors
      });

      // Parse objdump decodedline output
      type LineRow = { 
        off: number; 
        file: string; 
        line: number; 
        isStmt?: boolean; 
        discr?: number; 
      };
      
      const rows: LineRow[] = [];
      for (const line of decoded.split('\n')) {
        // Parse objdump table format: "in.s                                       1                   0               x"
        const m = line.match(/^([^\s]+)\s+(\d+)\s+(\d+|0x[0-9a-f]+)\s+(.*)$/i);
        
        if (m) {
          const [, file, ln, hex, tail] = m;
          rows.push({
            off: hex.startsWith('0x') ? parseInt(hex, 16) : parseInt(hex, 10),
            file: file.trim(),
            line: parseInt(ln, 10),
            isStmt: /x/.test(tail || ''), // 'x' means is_stmt in this format
            discr: undefined,
          });
        }
      }

      // Map to actual addresses with base address
      const sourceLineCount = assembly.split('\n').length;
      const lineTable = rows
        .filter(r => r.line > 0 && r.line <= sourceLineCount)
        .map(r => ({
          address: this.baseAddress + r.off,
          lineNumber: r.line,
          fileName: r.file,
          isStmt: r.isStmt,
          discr: r.discr,
        }))
        .sort((a, b) => a.address - b.address);

      return lineTable;

    } catch (error) {
      // objdump failed - return empty array, error handling is done at higher level
      return [];
    }
  }

  destroy(): void {
    this.isInitialized = false;
    this.lastObjectFile = null;
  }
}

// ============================================================================
// High-level ARM Assembler Interface
// ============================================================================

export interface AssemblerOptions {
  baseAddress?: number;
  target?: GASTarget;
}

export interface AssemblyResult {
  mc: Uint8Array;
  count: number;
  size: number;
  debugInfo?: unknown;
}

export class ARMAssembler {
  private gasAssembler: GASAssembler;
  private isInitialized = false;
  private options: Required<AssemblerOptions>;

  constructor(options: AssemblerOptions = {}) {
    this.options = {
      baseAddress: options.baseAddress || 0x10000,
      target: options.target || 'armv7-linux-gnueabihf',
    };
    
    this.gasAssembler = new GASAssembler({
      target: this.options.target,
      baseAddress: this.options.baseAddress,
    });
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      await this.gasAssembler.initialize();
      this.isInitialized = true;
    } catch (error) {
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  async assemble(assembly: string): Promise<AssemblyResult> {
    if (!this.isInitialized) {
      throw new Error('Assembler not initialized. Call initialize() first');
    }

    try {
      const result = await this.gasAssembler.assemble(assembly);
      
      // Use extracted machine code if available, otherwise fallback to object file
      const machineCode = result.machineCode || result.objectFile;
      
      // Convert GAS result to expected format
      const assemblyResult: AssemblyResult = {
        mc: machineCode, // Now this is actual machine code!
        count: Math.floor(machineCode.length / 4), // ARM = 4 bytes per instruction
        size: machineCode.length,
        debugInfo: result.debugInfo
      };

      return assemblyResult;

    } catch (error) {
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  /**
   * Get line mapping information for debugging
   */
  async getLineMappingInfo(assembly: string): Promise<DebugLineInfo[]> {
    if (!this.isInitialized) {
      throw new Error('Assembler not initialized');
    }

    try {
      // We need to assemble first to get the line mappings
      await this.gasAssembler.assemble(assembly);
      const mappingInfo = await this.gasAssembler.getLineMappingInfo(assembly);
      return mappingInfo;
    } catch (error) {
      throw error;
    }
  }

  destroy(): void {
    this.gasAssembler.destroy();
    this.isInitialized = false;
  }
}
