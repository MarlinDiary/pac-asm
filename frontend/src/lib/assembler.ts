import { collectMipsMacroSlotCandidates, needsMipsSchedulingListing, type MipsMacroSlotCandidate } from './mips-macro-listing';

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

const SHT_SYMTAB = 2;
const SHT_RELA = 4;
const SHT_REL = 9;
const SHN_UNDEF = 0;
const SHN_ABS = 0xfff1;
const R_MIPS_NONE = 0;
const R_MIPS_32 = 2;
const R_MIPS_26 = 4;
const R_MIPS_HI16 = 5;
const R_MIPS_LO16 = 6;
const R_MIPS_GPREL16 = 7;
const R_MIPS_PC16 = 10;
const R_MIPS_PC21_S2 = 60;
const R_MIPS_PC26_S2 = 61;

const signExtend16 = (value: number): number => ((value << 16) >> 16);

// GAS treats missing trailing newline as part of the last instruction, so we
// always append a blank line to the assembly passed to the worker.
const ensureTrailingBlankLine = (text: string): string => {
  const normalized = text.endsWith('\n') ? text : `${text}\n`;
  return normalized.endsWith('\n\n') ? normalized : `${normalized}\n`;
};

const formatAssemblerErrorOutput = (raw: string): string => {
  const lines = raw
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .filter(line => !/^in\.s:\s*Assembler messages:?$/i.test(line))
    .map(line => line.replace(/^in\.s:/i, '').trimStart());

  return lines.length > 0 ? lines.join('\n') : raw.trim();
};

async function validateObjectFileHasNoUndefinedSymbols(objectFile: Uint8Array) {
  const binutilsLoader = await import('@binutils-wasm/binutils');
  const nm = await binutilsLoader.default('nm');

  let stdout = '';
  let stderr = '';

  try {
    await nm({
      arguments: ['-u', 'input.o'],
      preRun: [(module: { FS: { writeFile: (name: string, data: Uint8Array) => void } }) => {
        module.FS.writeFile('input.o', objectFile);
      }],
      print: (text: string) => { stdout += text + '\n'; },
      printErr: (text: string) => { stderr += text + '\n'; }
    });
  } catch (error) {
    if (!stderr) {
      stderr = error instanceof Error ? error.message : String(error);
    }
  }

  const undefinedSymbols = stdout
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => line.split(/\s+/).pop() || line);

  if (undefinedSymbols.length > 0) {
    const description = undefinedSymbols.length === 1
      ? `Undefined symbol detected: ${undefinedSymbols[0]}`
      : `Undefined symbols detected: ${undefinedSymbols.join(', ')}`;
    throw new Error(`LINK_ERROR: ${description}`);
  }

  if (stderr.trim().length > 0) {
    throw new Error(stderr.trim());
  }
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

function readNullTerminatedString(bytes: Uint8Array, offset: number): string {
  if (offset >= bytes.length) {
    return '';
  }
  let end = offset;
  while (end < bytes.length && bytes[end] !== 0) {
    end++;
  }
  let str = '';
  for (let i = offset; i < end; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  return str;
}

interface ParsedSection {
  name: string;
  type: number;
  offset: number;
  size: number;
  link: number;
  info: number;
  entsize: number;
}

interface ParsedSymbol {
  value: number;
  shndx: number;
  name: string;
}

function parseSections(elfData: Uint8Array): { sections: ParsedSection[]; isLittleEndian: boolean } {
  if (elfData.length < 52) {
    return { sections: [], isLittleEndian: true };
  }
  const isLittleEndian = elfData[5] === 1;
  const view = new DataView(elfData.buffer, elfData.byteOffset, elfData.byteLength);
  const shoff = view.getUint32(32, isLittleEndian);
  const shentsize = view.getUint16(46, isLittleEndian);
  const shnum = view.getUint16(48, isLittleEndian);
  const shstrndx = view.getUint16(50, isLittleEndian);

  if (shoff === 0 || shnum === 0 || shstrndx >= shnum) {
    return { sections: [], isLittleEndian };
  }

  const shstrHeaderOffset = shoff + shstrndx * shentsize;
  const shstrOffset = view.getUint32(shstrHeaderOffset + 16, isLittleEndian);
  const shstrSize = view.getUint32(shstrHeaderOffset + 20, isLittleEndian);
  const shstrBytes = elfData.subarray(shstrOffset, shstrOffset + shstrSize);

  const sections: ParsedSection[] = [];
  for (let i = 0; i < shnum; i++) {
    const headerOffset = shoff + i * shentsize;
    const nameOffset = view.getUint32(headerOffset, isLittleEndian);
    const name = readNullTerminatedString(shstrBytes, nameOffset);
    sections.push({
      name,
      type: view.getUint32(headerOffset + 4, isLittleEndian),
      offset: view.getUint32(headerOffset + 16, isLittleEndian),
      size: view.getUint32(headerOffset + 20, isLittleEndian),
      link: view.getUint32(headerOffset + 24, isLittleEndian),
      info: view.getUint32(headerOffset + 28, isLittleEndian),
      entsize: view.getUint32(headerOffset + 36, isLittleEndian),
    });
  }

  return { sections, isLittleEndian };
}

function parseSymbols(
  elfData: Uint8Array,
  sections: ParsedSection[],
  symbolSection: ParsedSection,
  isLittleEndian: boolean
): ParsedSymbol[] {
  if (symbolSection.type !== SHT_SYMTAB || symbolSection.entsize === 0) {
    return [];
  }

  const view = new DataView(elfData.buffer, elfData.byteOffset, elfData.byteLength);
  const linkedStrSection = sections[symbolSection.link];
  const strBytes = linkedStrSection
    ? elfData.subarray(linkedStrSection.offset, linkedStrSection.offset + linkedStrSection.size)
    : new Uint8Array(0);

  const count = Math.floor(symbolSection.size / symbolSection.entsize);
  const symbols: ParsedSymbol[] = [];
  for (let i = 0; i < count; i++) {
    const entryOffset = symbolSection.offset + i * symbolSection.entsize;
    const stName = view.getUint32(entryOffset, isLittleEndian);
    const stValue = view.getUint32(entryOffset + 4, isLittleEndian) >>> 0;
    const stShndx = view.getUint16(entryOffset + 14, isLittleEndian);
    const name = readNullTerminatedString(strBytes, stName);
    symbols.push({ value: stValue >>> 0, shndx: stShndx, name });
  }

  return symbols;
}

function applyMipsRelocations(
  elfData: Uint8Array,
  textSectionOffset: number,
  machineCode: Uint8Array,
  baseAddress: number
): Uint8Array {
  const { sections, isLittleEndian } = parseSections(elfData);
  if (sections.length === 0) {
    return machineCode;
  }

  const textSectionIndex = sections.findIndex(section => section.offset === textSectionOffset);
  if (textSectionIndex === -1) {
    return machineCode;
  }

  let patched: Uint8Array | null = null;
  let textView = new DataView(machineCode.buffer, machineCode.byteOffset, machineCode.byteLength);
  const elfView = new DataView(elfData.buffer, elfData.byteOffset, elfData.byteLength);

  const computeSymbolAddress = (symbol: ParsedSymbol): number => {
    if (symbol.shndx === SHN_UNDEF) {
      throw new Error(`Unresolved symbol '${symbol.name}' in relocation`);
    }
    if (symbol.shndx === SHN_ABS) {
      return symbol.value >>> 0;
    }
    if (symbol.shndx === textSectionIndex) {
      return (baseAddress + symbol.value) >>> 0;
    }
    throw new Error(`Unsupported relocation target section index ${symbol.shndx} for symbol '${symbol.name}'`);
  };

  const ensurePatchedView = () => {
    if (!patched) {
      patched = machineCode.slice();
      textView = new DataView(patched.buffer, patched.byteOffset, patched.byteLength);
    }
    return textView;
  };

  const pendingHiRelocs = new Map<number, Array<{ offset: number; symbolAddress: number; addend: number }>>();

  for (const relSection of sections) {
    if (relSection.info !== textSectionIndex) {
      continue;
    }
    if (relSection.type !== SHT_REL && relSection.type !== SHT_RELA) {
      continue;
    }
    if (relSection.entsize === 0) {
      continue;
    }

    const symbolSection = sections[relSection.link];
    if (!symbolSection || symbolSection.type !== SHT_SYMTAB) {
      continue;
    }

    const symbols = parseSymbols(elfData, sections, symbolSection, isLittleEndian);
    if (symbols.length === 0) {
      continue;
    }

    const count = Math.floor(relSection.size / relSection.entsize);
    for (let i = 0; i < count; i++) {
      const entryOffset = relSection.offset + i * relSection.entsize;
      const rOffset = elfView.getUint32(entryOffset, isLittleEndian) >>> 0;
      const rInfo = elfView.getUint32(entryOffset + 4, isLittleEndian) >>> 0;
      const rType = rInfo & 0xff;
      const symIndex = rInfo >>> 8;
      if (rType === R_MIPS_NONE) continue;

      let addend = 0;
      if (relSection.type === SHT_RELA) {
        addend = elfView.getInt32(entryOffset + 8, isLittleEndian);
      }

      const symbol = symbols[symIndex];
      if (!symbol) {
        continue;
      }

      const symbolAddress = computeSymbolAddress(symbol);

      switch (rType) {
        case R_MIPS_32: {
          if (rOffset + 4 > machineCode.length) {
            throw new Error('R_MIPS_32 relocation lies outside .text');
          }
          // REL carries the addend in the word; RELA carries it in the record.
          const wordAddend = relSection.type === SHT_RELA
            ? addend : textView.getUint32(rOffset, isLittleEndian);
          ensurePatchedView().setUint32(rOffset, (symbolAddress + wordAddend) >>> 0, isLittleEndian);
          break;
        }
        case R_MIPS_26: {
          if (rOffset + 4 > machineCode.length) {
            continue;
          }

          const currentInstr = textView.getUint32(rOffset, isLittleEndian);
          const existing = currentInstr & 0x03ffffff;
          const existingAddend = relSection.type === SHT_RELA ? addend : ((existing << 2) >>> 0);
          const relocatedValue = (symbolAddress + existingAddend) >>> 0;
          const newField = ((relocatedValue >>> 2) & 0x03ffffff) >>> 0;
          const updatedInstr = (currentInstr & 0xfc000000) | newField;

          const view = ensurePatchedView();
          view.setUint32(rOffset, updatedInstr >>> 0, isLittleEndian);
          break;
        }
        case R_MIPS_HI16: {
          if (rOffset + 4 > machineCode.length) {
            continue;
          }

          const currentInstr = textView.getUint32(rOffset, isLittleEndian);
          const hiImmediate = currentInstr & 0xffff;
          const hiAddend = relSection.type === SHT_RELA ? addend : ((signExtend16(hiImmediate) << 16) | 0);
          const queue = pendingHiRelocs.get(symIndex) ?? [];
          queue.push({ offset: rOffset, symbolAddress, addend: hiAddend | 0 });
          pendingHiRelocs.set(symIndex, queue);
          break;
        }
        case R_MIPS_LO16: {
          if (rOffset + 4 > machineCode.length) {
            continue;
          }

          const currentInstr = textView.getUint32(rOffset, isLittleEndian);
          const loImmediate = currentInstr & 0xffff;
          const loAddend = relSection.type === SHT_RELA ? addend : signExtend16(loImmediate);

          const queue = pendingHiRelocs.get(symIndex);
          const hiRecord = queue && queue.length > 0 ? queue.shift()! : undefined;
          if (queue && queue.length === 0) {
            pendingHiRelocs.delete(symIndex);
          }

          const baseAddressForValue = hiRecord ? hiRecord.symbolAddress : symbolAddress;
          const hiAddend = hiRecord ? hiRecord.addend : 0;
          const totalAddend = (hiAddend + loAddend) | 0;
          const totalValue = (baseAddressForValue + totalAddend) >>> 0;

          const view = ensurePatchedView();

          if (hiRecord) {
            const hiInstr = view.getUint32(hiRecord.offset, isLittleEndian);
            const newHi = ((totalValue + 0x8000) >>> 16) & 0xffff;
            const updatedHiInstr = ((hiInstr & 0xffff0000) | newHi) >>> 0;
            view.setUint32(hiRecord.offset, updatedHiInstr, isLittleEndian);
          }

          const viewLoInstr = view.getUint32(rOffset, isLittleEndian);
          const newLo = totalValue & 0xffff;
          const updatedLoInstr = ((viewLoInstr & 0xffff0000) | newLo) >>> 0;
          view.setUint32(rOffset, updatedLoInstr, isLittleEndian);
          break;
        }
        case R_MIPS_GPREL16: {
          throw new Error(`Unsupported relocation type ${rType} for symbol '${symbol.name}'`);
        }
        case R_MIPS_PC16: {
          if (rOffset + 4 > machineCode.length) {
            continue;
          }

          const view = ensurePatchedView();
          const currentInstr = view.getUint32(rOffset, isLittleEndian) >>> 0;
          const mask = 0xffff;
          // The signed REL field already includes GAS's PC+4 bias.
          // ELF relocation is S + A - P; subtracting P+4 again loses offsets.
          const relocationAddend = relSection.type === SHT_RELA ? addend : signExtend16(currentInstr & mask) * 4;

          const relocationPlace = (baseAddress + rOffset) >>> 0;
          const targetAddress = (symbolAddress + relocationAddend) >>> 0;
          const delta = (targetAddress - relocationPlace) | 0;
          if ((delta & 0x3) !== 0) {
            throw new Error(`PC16 relocation misaligned for symbol '${symbol.name}'`);
          }

          const offset = delta >> 2;
          if (offset < -0x8000 || offset > 0x7fff) {
            throw new Error(`PC16 relocation out of range for symbol '${symbol.name}'`);
          }

          const updatedInstr = ((currentInstr & 0xffff0000) | (offset & mask)) >>> 0;
          view.setUint32(rOffset, updatedInstr, isLittleEndian);
          break;
        }
        case R_MIPS_PC21_S2: {
          if (rOffset + 4 > machineCode.length) {
            continue;
          }

          const view = ensurePatchedView();
          const currentInstr = view.getUint32(rOffset, isLittleEndian) >>> 0;
          const mask = 0x001fffff;
          // The signed REL field already includes GAS's PC+4 bias.
          // ELF relocation is S + A - P; subtracting P+4 again loses offsets.
          const relocationAddend = relSection.type === SHT_RELA ? addend : ((currentInstr << 11) >> 11) * 4;

          const relocationPlace = (baseAddress + rOffset) >>> 0;
          const targetAddress = (symbolAddress + relocationAddend) >>> 0;
          const delta = (targetAddress - relocationPlace) | 0;
          if ((delta & 0x3) !== 0) {
            throw new Error(`PC21_S2 relocation misaligned for symbol '${symbol.name}'`);
          }

          const offset = delta >> 2;
          const min = -(1 << 20);
          const max = (1 << 20) - 1;
          if (offset < min || offset > max) {
            throw new Error(`PC21_S2 relocation out of range for symbol '${symbol.name}'`);
          }

          const updatedInstr = ((currentInstr & ~mask) | (offset & mask)) >>> 0;
          view.setUint32(rOffset, updatedInstr, isLittleEndian);
          break;
        }
        case R_MIPS_PC26_S2: {
          if (rOffset + 4 > machineCode.length) {
            continue;
          }

          const view = ensurePatchedView();
          const currentInstr = view.getUint32(rOffset, isLittleEndian) >>> 0;
          const mask = 0x03ffffff;
          // The signed REL field already includes GAS's PC+4 bias.
          // ELF relocation is S + A - P; subtracting P+4 again loses offsets.
          const relocationAddend = relSection.type === SHT_RELA ? addend : ((currentInstr << 6) >> 6) * 4;

          const relocationPlace = (baseAddress + rOffset) >>> 0;
          const targetAddress = (symbolAddress + relocationAddend) >>> 0;
          const delta = (targetAddress - relocationPlace) | 0;
          if ((delta & 0x3) !== 0) {
            throw new Error(`PC26_S2 relocation misaligned for symbol '${symbol.name}'`);
          }

          const offset = delta >> 2;
          const min = -(1 << 25);
          const max = (1 << 25) - 1;
          if (offset < min || offset > max) {
            throw new Error(`PC26_S2 relocation out of range for symbol '${symbol.name}'`);
          }

          const updatedInstr = ((currentInstr & ~mask) | (offset & mask)) >>> 0;
          view.setUint32(rOffset, updatedInstr, isLittleEndian);
          break;
        }
        default:
          throw new Error(`Unsupported relocation type ${rType} for symbol '${symbol.name}'`);
      }
    }
  }

  if (pendingHiRelocs.size > 0) {
    for (const [, queue] of pendingHiRelocs) {
      for (const hiRecord of queue) {
        const view = ensurePatchedView();
        const currentInstr = view.getUint32(hiRecord.offset, isLittleEndian);
        const value = (hiRecord.symbolAddress + hiRecord.addend) >>> 0;
        const newHi = ((value + 0x8000) >>> 16) & 0xffff;
        const updatedInstr = ((currentInstr & 0xffff0000) | newHi) >>> 0;
        view.setUint32(hiRecord.offset, updatedInstr, isLittleEndian);
      }
    }
  }

  return patched || machineCode;
}

// ============================================================================
// GNU Assembler Implementation
// ============================================================================

export type GASTarget = 'armv7-linux-gnueabihf' | 'mips-linux-gnu';
export type GASVariant = 'default' | 'mips-r6';

export interface GASAssemblerOptions {
  target?: GASTarget;
  baseAddress?: number;
  variant?: GASVariant;
}

export interface GASAssemblyResult {
  objectFile: Uint8Array;
  machineCode?: Uint8Array;
  debugInfo?: unknown;
  size: number;
}

export interface DebugLineInfo {
  endAddress?: number;
  address: number;
  lineNumber: number;
  fileName: string;
  isStmt?: boolean;
  discr?: number;
}

export class GASAssembler {
  private target: GASTarget;
  private baseAddress: number;
  private variant: GASVariant;
  private isInitialized = false;
  private gasInstance: unknown = null;
  private lastObjectFile: Uint8Array | null = null;
  private macroListingInput: { source: string; args: string[]; text: Uint8Array; code: Uint8Array } | null = null;
  private macroSlotPromise: Promise<MipsMacroSlotCandidate[]> | null = null;
  // If we preprocess input for target-specific adjustments, record line offset
  private preprocessedLineOffset: number = 0;

  constructor(options: GASAssemblerOptions = {}) {
    this.target = options.target || 'armv7-linux-gnueabihf';
    this.baseAddress = options.baseAddress || 0x10000;
    this.variant = options.variant ?? 'default';
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
      this.lastObjectFile = null;
      this.macroListingInput = null;
      this.macroSlotPromise = null;
      const needsMacroListing = this.target === 'mips-linux-gnu' && this.variant === 'mips-r6' &&
        needsMipsSchedulingListing(assembly);
      const processed = ensureTrailingBlankLine(assembly);
      this.preprocessedLineOffset = 0;

      // Assemble with debug info (-g)
      // Note: 'as' doesn't support '-c' (that's a gcc/ld option), so we omit it.
      // For MIPS R6, we need to specify --gdwarf-2 to generate DWARF debug info
      let args: string[];
      if (this.target === 'mips-linux-gnu') {
        args = ['-g', '--gdwarf-2'];
        if (this.variant === 'mips-r6') {
          args.push('-mips32r6', '-mabi=32', '-EB');
        }
        args.push('-o', 'out.o', 'in.s');
      } else {
        args = ['-g', '-o', 'out.o', 'in.s'];
      }
      if (this.baseAddress && this.baseAddress !== 0) {
        args.push('--defsym', `BASE_ADDR=0x${this.baseAddress.toString(16)}`);
      }

      await (this.gasInstance as CallableFunction)({
        arguments: [...args],
        preRun: [(module: unknown) => {
          (module as { FS: { writeFile: (name: string, content: string) => void } }).FS.writeFile('in.s', processed);
        }],
        postRun: [(module: unknown) => {
          try {
            const fileData = (module as { FS: { readFile: (name: string) => ArrayBuffer } }).FS.readFile('out.o');
            objectFile = new Uint8Array(fileData);
          } catch {
            // Failed to read object file - error will be handled by throwing below
          }
        }],
        print: () => {},
        printErr: (text: string) => { errorOutput += text + '\n'; }
      });

      if (errorOutput && !objectFile) {
        throw new Error(formatAssemblerErrorOutput(errorOutput));
      }

      if (!objectFile) {
        throw new Error('No object file generated');
      }

      await validateObjectFileHasNoUndefinedSymbols(objectFile);

      // Empty source may have no .text, but a link failure is never empty code.
      let elfResult: ELFParseResult | undefined;
      try {
        elfResult = extractMachineCode(objectFile);
      } catch (error) {
        if (!(error instanceof Error) || error.message !== '.text section not found in ELF') throw error;
      }
      let machineCode = elfResult?.machineCode ?? new Uint8Array(0);
      if (this.target === 'mips-linux-gnu' && elfResult && machineCode.length > 0) {
        try {
          machineCode = applyMipsRelocations(objectFile, elfResult.textSectionOffset, machineCode, this.baseAddress);
        } catch (error) {
          throw new Error(`LINK_ERROR: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // Store object file for DWARF parsing
      this.lastObjectFile = objectFile;
      if (needsMacroListing) {
        this.macroListingInput = { source: processed, args: [...args], text: extractMachineCode(objectFile).machineCode, code: machineCode };
      }

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
      const sequenceEnds: number[] = [];
      for (const line of decoded.split('\n')) {
        // Parse objdump table format: "in.s                                       1                   0               x"
        const m = line.match(/^([^\s]+)\s+(\d+|-)\s+(\d+|0x[0-9a-f]+)(?:\s+(.*))?$/i);
        
        if (m) {
          const [, file, ln, hex, tail] = m;
          if (ln === '-') { sequenceEnds.push(this.baseAddress + Number(hex)); continue; }
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
      let lineTable: DebugLineInfo[] = rows.map(r => ({
        address: this.baseAddress + r.off,
        lineNumber: r.line,
        fileName: r.file,
        isStmt: r.isStmt,
        discr: r.discr,
      }));

      // Adjust for any preprocessed prologue we may have inserted
      if (this.preprocessedLineOffset > 0) {
        lineTable = lineTable
          .map(entry => ({
            ...entry,
            lineNumber: Math.max(1, entry.lineNumber - this.preprocessedLineOffset),
          }))
          .filter(entry => entry.lineNumber >= 1 && entry.lineNumber <= sourceLineCount);
      } else {
        lineTable = lineTable
          .filter(entry => entry.lineNumber > 0 && entry.lineNumber <= sourceLineCount);
      }

      lineTable.sort((a, b) => a.address - b.address);
      if (this.target === 'mips-linux-gnu' && this.variant === 'mips-r6') {
        // Other files' .loc rows do not identify lines in this editor buffer.
        lineTable = lineTable.filter(row => row.fileName === 'in.s');
        if (!/(?:^|;)\s*(?:[\w.$]+:\s*)*\.loc\b/m.test(assembly)) {
          const boundaries = [...new Set([...lineTable.map(row => row.address), ...sequenceEnds])].sort((a, b) => a - b);
          const next = new Map(boundaries.slice(0, -1).map((address, i) => [address, boundaries[i + 1]]));
          lineTable = lineTable.map(row => ({ ...row, endAddress: next.get(row.address) }));
        }
      }

      return lineTable;

    } catch {
      // objdump failed - return empty array, error handling is done at higher level
      return [];
    }
  }

  async getMacroSlotCandidates(): Promise<MipsMacroSlotCandidate[]> {
    const input = this.macroListingInput;
    if (!input) return [];
    if (!this.macroSlotPromise) {
      // This GAS build changes its DWARF rows when macro listings are enabled.
      // Never use that diagnostic object for execution or normal line tables.
      this.macroSlotPromise = (async () => {
        let listing = '';
        let diagnosticObject: Uint8Array | null = null;
        try {
          await (this.gasInstance as CallableFunction)({
            arguments: [...input.args, '-almcn'],
            preRun: [(module: { FS: { writeFile: (name: string, data: string) => void } }) => {
              module.FS.writeFile('in.s', input.source);
            }],
            postRun: [(module: { FS: { readFile: (name: string) => Uint8Array } }) => {
              diagnosticObject = new Uint8Array(module.FS.readFile('out.o'));
            }],
            print: (text: string) => { listing += text + '\n'; },
            printErr: () => {},
          });
          if (!diagnosticObject) return [];
          const elf = extractMachineCode(diagnosticObject);
          const text = elf.machineCode;
          if (text.length !== input.text.length || text.some((byte, i) => byte !== input.text[i])) return [];
          const code = applyMipsRelocations(diagnosticObject, elf.textSectionOffset, text, this.baseAddress);
          if (code.length !== input.code.length || code.some((byte, i) => byte !== input.code[i])) return [];
          return collectMipsMacroSlotCandidates(listing, this.baseAddress);
        } catch { return []; }
      })();
    }
    return (await this.macroSlotPromise).map(candidate => ({ ...candidate }));
  }

  destroy(): void {
    this.macroListingInput = null;
    this.macroSlotPromise = null;
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
  variant?: GASVariant;
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
  private lastAssembly: string | null = null;
  private options: Required<AssemblerOptions>;

  constructor(options: AssemblerOptions = {}) {
    this.options = {
      baseAddress: options.baseAddress || 0x10000,
      target: options.target || 'armv7-linux-gnueabihf',
      variant: options.variant ?? 'default',
    };
    
    this.gasAssembler = new GASAssembler({
      target: this.options.target,
      baseAddress: this.options.baseAddress,
      variant: this.options.variant,
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

    // A failed attempt must not leave an older object eligible for reuse.
    this.lastAssembly = null;
    try {
      const result = await this.gasAssembler.assemble(assembly);
      this.lastAssembly = assembly;
      
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
      // Reuse the exact object that produced the machine code. A different
      // source (or a failed previous attempt) still requires assembly.
      if (this.lastAssembly !== assembly) {
        await this.assemble(assembly);
      }
      const mappingInfo = await this.gasAssembler.getLineMappingInfo(assembly);
      return mappingInfo;
    } catch (error) {
      throw error;
    }
  }

  getMacroSlotCandidates(): Promise<MipsMacroSlotCandidate[]> {
    return this.gasAssembler.getMacroSlotCandidates();
  }

  destroy(): void {
    this.gasAssembler.destroy();
    this.isInitialized = false;
    this.lastAssembly = null;
  }
}
