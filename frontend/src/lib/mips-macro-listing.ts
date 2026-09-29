/** A possible scheduled source instruction, identified by GAS's active listing. */
export interface MipsMacroSlotCandidate {
  branchAddress: number;
  branchLineNumber: number;
  ownerLineNumber: number;
}

/** Source control flow makes a textual .set scan unreliable. */
export function needsMipsSchedulingListing(source: string): boolean {
  return /(?:^|;)\s*(?:[\w.$]+:\s*)*\.(?:macro|rept|irp|irpc|if\w*)\b/im.test(source);
}

/**
 * Read -almcn output, not the user's macro language. GAS has already expanded
 * parameters, nesting, repetitions and conditionals. The code/DWARF consumer
 * still validates the actual delayed-branch bytes and source-row ownership.
 */
export function collectMipsMacroSlotCandidates(listing: string, baseAddress: number): MipsMacroSlotCandidate[] {
  const candidates: MipsMacroSlotCandidate[] = [];
  const macros = new Set<string>();
  let definitionDepth = 0;
  let repetitionTemplateDepth = 0;
  let reorder = true;
  const modes: boolean[] = [];
  let previous: { lineNumber: number } | undefined;

  for (const row of listing.split('\n')) {
    const tab = row.indexOf('\t');
    if (tab < 0) continue; // Headers and machine-byte continuation rows.
    const fields = row.slice(0, tab).trim().split(/\s+/);
    if (!/^\d+$/.test(fields[0])) continue;
    const lineNumber = Number(fields[0]);
    const address = fields.length === 3 && /^[\da-f]+$/i.test(fields[1]) && /^[\da-f]{8}$/i.test(fields[2])
      ? baseAddress + parseInt(fields[1], 16) : undefined;
    let source = row.slice(tab + 1).trim();
    const expanded = source.startsWith('>');
    source = source.replace(/^>+\s*/, '').replace(/#.*$/, '').replace(/^\s*(?:[\w.$]+:\s*)+/, '').trim();
    const macro = /^\.macro\s+([\w.$]+)/i.exec(source);
    if (macro) { macros.add(macro[1]); definitionDepth++; continue; }
    if (/^\.endm\b/i.test(source)) { definitionDepth = Math.max(0, definitionDepth - 1); continue; }
    if (definitionDepth || !source) continue;
    // GAS prints an unexpanded .rept/.irp/.irpc template even when it executes
    // zero times. Only its later '>' expansion rows are active instructions.
    if (!expanded && /^\.(?:rept|irp|irpc)\b/i.test(source)) { repetitionTemplateDepth++; continue; }
    if (!expanded && /^\.endr\b/i.test(source)) { repetitionTemplateDepth = Math.max(0, repetitionTemplateDepth - 1); continue; }
    if (repetitionTemplateDepth && !expanded) continue;

    if (source.startsWith('.')) {
      const purged = /^\.purgem\s+([\w.$]+)/i.exec(source)?.[1];
      if (purged) macros.delete(purged);
      const setting = /^\.set\s+(push|pop|noreorder|reorder)\b/i.exec(source)?.[1].toLowerCase();
      if (setting === 'push') modes.push(reorder);
      if (setting === 'pop') reorder = modes.pop() ?? reorder;
      if (setting === 'noreorder') reorder = false;
      if (setting === 'reorder') reorder = true;
      // Data, alignment, section and unknown directives are provenance barriers.
      // .loc is also a barrier; the resolver separately preserves explicit .loc.
      if (!/^\.(?:set|if|ifdef|ifndef|ifc|ifnc|else|elseif|endif|rept|endr|irp|irpc)\b/i.test(source)) previous = undefined;
      continue;
    }
    const mnemonic = /^(\S+)/.exec(source)?.[1];
    if (mnemonic && macros.has(mnemonic)) continue; // Parent invocation, not a leaf instruction.
    if (reorder && address !== undefined && previous && previous.lineNumber !== lineNumber) {
      candidates.push({ branchAddress: address, branchLineNumber: lineNumber, ownerLineNumber: previous.lineNumber });
    }
    previous = { lineNumber };
  }
  return candidates;
}
