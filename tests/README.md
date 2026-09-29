# Emulator control-flow regression tests

From the repository root, with frontend/backend dependencies installed:

```sh
node --test tests/*.test.cjs
```

These tests transpile the current TypeScript and execute each layer's checked-in
Unicorn WASM. No CPU mocks, external services, accounts, or submitted student
programs are used. `EMULATOR_SOURCE_ROOT=/absolute/source/snapshot` runs the exact
same inputs against a saved source/assets snapshot for baseline-red checks.

Coverage includes MIPS delayed and compact branches, taken/untaken and backward
branches, jumps/calls, non-NOP slots, command writes in delay/forbidden slots,
byte/halfword/word stores, consecutive commands/breakpoints, full stepping,
CPU-error propagation and hook cleanup. ARM is checked as a separate control.
Tests assert architectural register results and the exact ordered movement events.
An ordinary MIPS program must retain its memory-hook-only fast path.

## Native memory-hook branch-state regression

The two previously TODO native-reference cases are now required passes. The
existing custom MIPS WASM has a narrowly pinned native memory-helper repair;
see `scripts/mips-memory-hook-state/README.md` for cause, source references,
reproduction and byte-exact reversal. ARM and the custom cycle counter are
unchanged. Keep completed-boundary application pausing/stepping: an immediate
stop inside a delayed memory instruction is still not a complete boundary.

`tests/r6-assembler-contract.test.cjs` also compiles real source using the current
`-mips32r6` assembler and checks delayed/compact branch behavior in both layers.

`tests/mips-delay-slot-mapping.test.cjs` covers GAS `.set reorder` moving the
instruction before a delayed branch into its delay slot: the displaced source line
must keep a real address for stepping and breakpoints, and a step over a delayed
branch reports the slot address.

`tests/mips-delay-slot-mapping-boundaries.test.cjs` uses real GAS output to check
explicit `.loc` rows, partial `li`/`la` expansions moved into slots, source
breakpoints, compact branches, `.set noreorder`/push/pop, register aliases and
ARM controls. `tests/mips-source-map.test.cjs` checks machine-code guards and
non-mutation. Mapping repair reads the exact emitted bytes; it does not
reassemble, disable scheduling or modify instructions. Explicit `.loc` mappings
are left authoritative. Ambiguous rows and unsupported expansion patterns are
left unchanged instead of guessing a new breakpoint address.

Also run the existing frontend tests, both production builds, and the real-worker
judge isolation tests documented in `backend/tests/README.md`. For grading and
performance comparisons use the deterministic benchmark there; compare complete
results, cycle counts and random-call counts, not only pass/fail.

## Source-mapping and productive-loop edge regressions

`mips-edge-contracts.test.cjs` checks many-to-many source mappings through compiler
serialization, exact (non-contiguous, more than two) editor highlights, stale map
clearing, and bounded RUN loops whose PC stays fixed while their slot does work.
`mips-expanded-source-map.test.cjs` checks pseudo-instruction interiors, scalar
macro aliases, nested/multi-instruction macro extents, foreign `.loc` files and
data/padding exclusion. Extents come from the same ELF's DWARF sequence ends;
assembler flags and emitted code are unchanged. Existing LI/LA assertions now
require every real prefix instruction, not just the first and the displaced tail.
Explicit `.loc` point mappings remain authoritative; unsupported directives and
ambiguous macro bodies are not reinterpreted as scalar aliases.

### Strict native regression (now required to pass)

```sh
node --test tests/probes/mips-own-slot-native.cjs
node scripts/mips-memory-hook-state/patch.cjs --check
```

The strict probe attaches an observational hook and counts **actual** stores,
including ordinary data stores and ignored command values. Earlier movement-only
tests could hide duplicate callbacks by overwriting a single event field. The
probe used to fail against both original binaries; it must now pass without any
callback filtering or changed expected counts.

`mips-native-memory-hooks.test.cjs` independently checks raw loads/stores of all
three integer widths, read-after hooks, multiple simultaneous observers, delayed
direct/indirect/link/conditional branches, taken/untaken paths, own-slot targets,
ordinary targets, cross-page delay slots, repaired unmapped pages, CPU faults,
register effects and exact code traces. `mips-native-patch.test.cjs` checks the two
binary copies, byte-exact reversal/reapplication and fail-closed input hashing.
The native `until` parameter does not itself guarantee eager PC synchronization;
PC assertions use an explicit code-hook stop, while no-code-hook tests assert
real register/memory effects and access multiplicity.


## Seeded MIPS boundary and display checks

`mips-model-stress.test.cjs` compares the shipped front/back engines against an
independent AST interpreter: all 32 GPRs, all 128 data bytes, ordered reads and
writes, movement events, final PC and temporary-hook cleanup. Default: 64 seeds.
Frontend modes: raw native run, movement run, debug step, breakpoints, bounded
RUN and bare STEP. Backend has no breakpoint API and excludes that mode.

```sh
MIPS_STRESS_CASES=512 MIPS_STRESS_ASSEMBLE_ALL=1 node --test tests/mips-model-stress.test.cjs
MIPS_STRESS_CASES=512 MIPS_STRESS_OBSERVE=0 node --test tests/mips-model-stress.test.cjs
node --test tests/mips-compact-boundaries.test.cjs tests/register-hex.test.cjs
```

The first command checks every generated program against real GAS and enables
observational memory/code hooks. The second checks public application APIs with
no extra hooks, excluding raw native execution (its end-address PC is stale in
this build). `MIPS_STRESS_FIRST`, `MIPS_STRESS_MODES`, `MIPS_STRESS_LAYERS`,
`MIPS_STRESS_FAILURE_DIR` and `EMULATOR_SOURCE_ROOT` allow exact replay.

The compact matrix covers 24 mnemonic families, signed/unsigned/overflow cases,
taken/untaken paths, a target equal to the next instruction, forbidden control
transfers, changing operands in the slot and link registers. Register display
checks retain signed decimal values while rendering their 32-bit hex bit pattern.

These are bounded regression tests, not exhaustive ISA conformance.

## Macro expansion provenance

`mips-macro-source-map.test.cjs` covers multi-instruction, conditional, nested,
repeated, dotted-name and semicolon macro expansions, source breakpoints on moved
tails, repeated stepping, mode/operand hazards, raw data and explicit `.loc`.

GAS's active macro listing is obtained lazily from a separate diagnostic assembly.
The primary ELF/DWARF is unchanged, because this build of GAS alters DWARF rows
when macro listings are enabled. Both raw text bytes and relocated executable
bytes must match before listing provenance is used. Original DWARF must also
confirm the invocation owner and actual bytes must prove a delayed non-NOP slot.
The test compares original ELF and executable bytes with the backend assembler,
checks metadata caching/reset and rejects deliberately mismatched diagnostic code.
No JavaScript macro interpreter or altered student machine code is involved.

```sh
node --test tests/mips-macro-source-map.test.cjs
```

## Relocations and active assembler modes

`mips-relocation-regressions.test.cjs` preserves the four follow-up audit failures.
`mips-relocation-boundaries.test.cjs` checks signed branch expression addends
against explicit labels across forward/backward placement, symbol binding and
load bases; executable `.text` address tables; REL/RELA, range/alignment errors,
unsupported relocation rejection, empty programs and compilation recovery.
The RELA fixtures transform real GAS objects while retaining their symbol table.

`mips-active-modes.test.cjs` checks inactive conditionals, unused macros, zero
repetitions, active parameterized mode changes, source breakpoints, raw-data
guards and unchanged primary ELF/DWARF. Complex sources use only byte-checked
GAS listing provenance for scheduled ownership; inactive source directives and
unexpanded repetition templates do not determine the active mode.

Unsupported data-section relocations now surface as LINK_ERROR, not successful
empty code. This change does not add a general multi-section ELF loader.
