import { needsMipsSchedulingListing, type MipsMacroSlotCandidate } from './mips-macro-listing';

interface LineRow {
  address: number;
  lineNumber: number;
  endAddress?: number;
}

// This is the R6 delayed-branch encoding, not a mnemonic guess. In particular,
// the rt != 0 forms of opcodes 6/7 are compact branches with no delay slot.
function hasDelaySlot(word: number): boolean {
  const op = word >>> 26;
  const rt = (word >>> 16) & 31;
  if (op === 2 || op === 3 || op === 4 || op === 5) return true;
  if (op === 6 || op === 7) return rt === 0;
  if (op === 1) return rt === 0 || rt === 1 || rt === 0x11;
  if (op === 0) return (word & 63) === 9;
  const rs = (word >>> 21) & 31;
  return (op === 0x11 || op === 0x12) && (rs === 9 || rs === 13);
}

function statement(line: string): string {
  // A label may share a line with an instruction or directive.
  return line.replace(/#.*$/, '').replace(/^\s*(?:[\w.$]+:\s*)+/, '').trim();
}

function registerNumber(name: string): number | undefined {
  if (/^\d+$/.test(name)) {
    const number = Number(name);
    return number < 32 ? number : undefined;
  }
  if (name === 's8') return 30;
  const names = 'zero at v0 v1 a0 a1 a2 a3 t0 t1 t2 t3 t4 t5 t6 t7 s0 s1 s2 s3 s4 s5 s6 s7 t8 t9 k0 k1 gp sp fp ra'.split(' ');
  const number = names.indexOf(name);
  return number >= 0 ? number : undefined;
}

// Only a scalar instruction alias is substituted here, never a macro program.
// GAS remains responsible for expansion and machine code. Bounded recursion
// handles nested aliases without interpreting .if, .rept or mode directives.
function instructionAlias(source: string): (line: string) => string {
  if (/(?:^|;)\s*\.(?:purgem|altmacro|if|ifdef|ifndef|ifc|ifnc|irp|irpc|rept)\b/m.test(source)) return line => line;
  const macros = new Map<string, { parameters: string[]; body: string }>();
  const lines = source.split('\n').map(statement);
  for (let i = 0; i < lines.length; i++) {
    const header = /^\.macro\s+(\w+)\s*(.*)$/i.exec(lines[i]);
    if (!header) continue;
    const body: string[] = [];
    while (++i < lines.length && !/^\.endm\b/i.test(lines[i])) if (lines[i]) body.push(lines[i]);
    const parameters = header[2].split(/[\s,]+/).filter(Boolean);
    if (body.length === 1 && !body[0].startsWith('.') && parameters.every(p => /^\w+$/.test(p))) {
      macros.set(header[1], { parameters, body: body[0] });
    }
  }
  return line => {
    const seen = new Set<string>();
    for (let depth = 0; depth < 16; depth++) {
      const call = /^(\w+)\s*(.*)$/.exec(line);
      const macro = call && macros.get(call[1]);
      if (!call || !macro || seen.has(call[1])) break;
      const args = call[2].split(/[\s,]+/).filter(Boolean);
      if (args.length !== macro.parameters.length) break;
      seen.add(call[1]);
      line = macro.body.replace(/\\(\w+)(?:\\\(\))?/g, (token, name: string) => {
        const index = macro.parameters.indexOf(name);
        return index < 0 ? token : args[index];
      });
    }
    return line;
  };
}

/** Repair only proven GAS R6 scheduling patterns; never change emitted code. */
export function resolveMipsDelaySlotRows<T extends LineRow>(
  source: string, rows: T[], bytes: ArrayLike<number>, baseAddress: number,
  macroSlots: MipsMacroSlotCandidate[] = []
): T[] {
  const alias = instructionAlias(source);
  const requiresListing = needsMipsSchedulingListing(source);
  const lines = source.split('\n').map(statement).map(alias);
  // Explicit .loc rows can legitimately share an address even without a branch.
  // Their ownership is supplied by the author, not inferred from GAS scheduling.
  if (lines.some(line => line.split(';').some(part => /^\.loc\b/i.test(statement(part))))) return rows;

  let reorder = true;
  const stack: boolean[] = [];
  const reordered = lines.map(line => {
    for (const part of line.split(';')) {
      const setting = /^\.set\s+(push|pop|noreorder|reorder)\b/i.exec(statement(part))?.[1].toLowerCase();
      if (setting === 'push') stack.push(reorder);
      if (setting === 'pop') reorder = stack.pop() ?? reorder;
      if (setting === 'noreorder') reorder = false;
      if (setting === 'reorder') reorder = true;
    }
    return reorder;
  });
  const readWord = (address: number): number | undefined => {
    const offset = address - baseAddress;
    if (offset < 0 || offset % 4 !== 0 || offset + 4 > bytes.length) return undefined;
    return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
  };
  const groups = new Map<number, T[]>();
  for (const row of rows) {
    const group = groups.get(row.address);
    if (group) group.push(row);
    else groups.set(row.address, [row]);
  }
  const addresses = [...groups.keys()].sort((a, b) => a - b);
  const replacements = new Map<T, T>();
  const additions: T[] = [];
  const macroSlotsByAddress = new Map(macroSlots.map(slot => [slot.branchAddress, slot]));

  for (let index = 0; index < addresses.length; index++) {
    const address = addresses[index];
    const group = groups.get(address)!;
    const branchRow = group[group.length - 1];
    const word = readWord(address);
    const slotAddress = address + 4;
    const slot = readWord(slotAddress);
    if (word === undefined || !hasDelaySlot(word) || slot === undefined || groups.has(slotAddress)) continue;
    const macroSlot = macroSlotsByAddress.get(address);
    if (macroSlot && slot !== 0 && branchRow.lineNumber === macroSlot.branchLineNumber) {
      // In reorder mode, a non-NOP slot after an explicit delayed branch comes
      // from the preceding scheduled instruction. GAS identifies the expanded
      // leaf's invocation line; DWARF must independently confirm that owner.
      const coincident = group.filter(row => row.lineNumber === macroSlot.ownerLineNumber);
      const previous = index > 0 ? groups.get(addresses[index - 1])! : [];
      const prefix = previous.filter(row => row.lineNumber === macroSlot.ownerLineNumber);
      if (coincident.length === 1 && group.length === 2) {
        replacements.set(coincident[0], { ...coincident[0], address: slotAddress, endAddress: slotAddress + 4 });
        continue;
      }
      if (group.length === 1 && previous.length === 1 && prefix.length === 1) {
        additions.push({ ...prefix[0], address: slotAddress, endAddress: slotAddress + 4 });
        continue;
      }
    }
    // Definitions and inactive conditional bodies are not executed .set directives.
    // For such sources use only byte-checked, active GAS listing provenance above;
    // a failed/ambiguous diagnostic must not fall back to guessing macro semantics.
    if (requiresListing) continue;
    if (!reordered[branchRow.lineNumber - 1]) continue;
    // Do not reinterpret macro/internal branches or raw .word data as a source
    // branch. Ambiguous rows stay unchanged rather than inventing breakpoints.
    const branchSource = lines[branchRow.lineNumber - 1] ?? '';
    if (branchSource.includes(';') || !/^(?:j|jal|jr|jalr|b|bal|beq|bne|beqz|bnez|blez|bgtz|bltz|bgez|bc[12](?:eqz|nez))\s/i.test(branchSource)) continue;

    if (group.length === 2) {
      const moved = group[0];
      if (reordered[moved.lineNumber - 1]) replacements.set(moved, { ...moved, address: slotAddress, endAddress: slotAddress + 4 });
      continue;
    }
    if (group.length !== 1 || index === 0 || slot === 0) continue;
    const previous = groups.get(addresses[index - 1])!;
    if (previous.length !== 1) continue;
    const owner = previous[0];
    const pseudo = /^(li|la)\s+\$(\w+)\s*,\s*(.+)$/i.exec(lines[owner.lineNumber - 1] ?? '');
    if (!pseudo || pseudo[3].includes(';') || !reordered[owner.lineNumber - 1]) continue;
    const destination = registerNumber(pseudo[2].toLowerCase());
    const prefixLength = (address - owner.address) / 4;
    const first = readWord(owner.address);
    if (destination === undefined || first === undefined || first >>> 26 !== 0x0f ||
        (prefixLength !== 1 && prefixLength !== 2)) continue;
    const temporary = (first >>> 16) & 31;
    const buildsImmediate = (instruction: number): boolean =>
      (instruction >>> 26 === 0x0d || (pseudo[1].toLowerCase() === 'la' && instruction >>> 26 === 9)) &&
      ((instruction >>> 21) & 31) === temporary && ((instruction >>> 16) & 31) === temporary;

    let completesPseudo = prefixLength === 1 && temporary === destination && buildsImmediate(slot);
    if (prefixLength === 2 && pseudo[1].toLowerCase() === 'la') {
      const middle = readWord(owner.address + 4)!;
      const baseName = /\(\s*\$(\w+)\s*\)\s*$/.exec(pseudo[3])?.[1];
      const base = baseName === undefined ? undefined : registerNumber(baseName.toLowerCase());
      const rs = (slot >>> 21) & 31;
      const rt = (slot >>> 16) & 31;
      completesPseudo = buildsImmediate(middle) && base !== undefined &&
        slot >>> 26 === 0 && (slot & 0x7ff) === 0x21 && ((slot >>> 11) & 31) === destination &&
        ((rs === temporary && rt === base) || (rt === temporary && rs === base));
    }
    // Keep the original prefix mapping; the final ORI/ADDIU/ADDU belongs to
    // the same LI/LA source line, even though GAS placed it after the branch.
    if (completesPseudo) additions.push({ ...owner, address: slotAddress, endAddress: slotAddress + 4 });
  }
  return [...rows.map(row => replacements.get(row) ?? row), ...additions];
}

/** Expand instruction intervals only where source and DWARF prove their extent. */
export function expandMipsInstructionRows<T extends LineRow>(source: string, rows: T[], bytes: ArrayLike<number>, baseAddress: number): T[] {
  const lines = source.split('\n').map(statement);
  // Data-emitting/unknown directives can sit inside a DWARF interval. Do not
  // turn those bytes into source breakpoints. Numeric LI prefixes below can
  // still be proven directly from their encoding and full immediate value.
  const macroNames = new Set(lines.flatMap(line => /^\.macro\s+([\w.$]+)/i.exec(line)?.[1] ?? []));
  const onlyInstructions = lines.every(line => line.split(';').every(part => {
    const text = statement(part);
    // An instruction-name parameter can expand to a data directive; do not
    // infer its contents from the unexpanded macro definition.
    if (text.startsWith('\\')) return false;
    const directive = /^\.([\w.$]+)/.exec(text);
    return !directive || macroNames.has('.' + directive[1]) ||
      /^(?:text|set|macro|endm|rept|endr|if|ifdef|ifndef|ifc|ifnc|else|elseif|endif|irp|irpc|equ|equiv|eqv|globl|global|ent|end|type|size|file)$/.test(directive[1]);
  }));
  const wordAt = (address: number) => {
    const offset = address - baseAddress;
    return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
  };
  const alias = instructionAlias(source);
  const result = [...rows];
  const firstLineAtAddress = new Map<number, number>();
  for (const row of rows) firstLineAtAddress.set(row.address,
    Math.min(firstLineAtAddress.get(row.address) ?? row.lineNumber, row.lineNumber));
  const mapped = new Set(rows.map(row => row.address));
  for (const row of rows) {
    const offset = row.address - baseAddress;
    if (offset < 0 || offset % 4 || offset + 4 > bytes.length || row.endAddress === undefined) continue;
    const word = wordAt(row.address);
    if (hasDelaySlot(word) || [6, 7, 8, 0x18, 0x16, 0x17, 0x32, 0x3a, 0x36, 0x3e].includes(word >>> 26)) continue;
    // Delayed and compact branch listings may include inserted slot NOPs.
    let end = Math.min(row.endAddress, baseAddress + bytes.length);
    // A later data table does not make an earlier, source-adjacent LA pair
    // ambiguous. Require a direct builtin LA, a real following DWARF row with
    // no intervening statements, and matching LUI + ADDIU/ORI register fields.
    // Never extend across .word, a macro call, an alignment or an inline ';'.
    const sourceLine = lines[row.lineNumber - 1] ?? '';
    const la = /^la\s+\$(\w+)\s*,\s*[^;]+$/i.exec(sourceLine);
    const nextLine = firstLineAtAddress.get(row.endAddress);
    const nextWord = row.address + 8 <= end ? wordAt(row.address + 4) : 0;
    const laRegister = la ? registerNumber(la[1].toLowerCase()) : undefined;
    const provenLaPair = la && !macroNames.has('la') && laRegister !== undefined &&
      nextLine !== undefined && nextLine > row.lineNumber &&
      lines.slice(row.lineNumber, nextLine - 1).every(line => !line) &&
      word >>> 26 === 15 && ((word >>> 16) & 31) === laRegister &&
      (nextWord >>> 26 === 9 || nextWord >>> 26 === 13) &&
      ((nextWord >>> 21) & 31) === laRegister && ((nextWord >>> 16) & 31) === laRegister;
    if (!onlyInstructions && provenLaPair) {
      end = Math.min(end, row.address + 8);
    } else if (!onlyInstructions) {
      const pseudo = /^li\s+\$(\w+)\s*,\s*([+-]?(?:0x[\da-f]+|\d+))\s*$/i.exec(alias(lines[row.lineNumber - 1] ?? ''));
      if (!pseudo) continue;
      const value = Number(pseudo[2]);
      const immediate = value >>> 0;
      const register = registerNumber(pseudo[1].toLowerCase());
      if (!Number.isSafeInteger(value) || (immediate & 0xffff) === 0 ||
          word >>> 26 !== 15 || ((word >>> 16) & 31) !== register || (word & 0xffff) !== (immediate >>> 16)) continue;
      const next = wordAt(row.address + 4);
      if (next >>> 26 !== 13 || ((next >>> 21) & 31) !== register ||
          ((next >>> 16) & 31) !== register || (next & 0xffff) !== (immediate & 0xffff)) continue;
      end = Math.min(end, row.address + 8);
    }
    for (let address = row.address + 4; address + 4 <= end; address += 4) {
      if (!mapped.has(address)) { result.push({ ...row, address, endAddress: address + 4 }); mapped.add(address); }
    }
  }
  return result;
}
