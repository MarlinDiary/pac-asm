# Exact-build MIPS memory-hook branch-state repair

This is a small repair to the **existing custom WASM**, not a replacement engine.
The original build project is unavailable. The patch is pinned to the original
SHA-256 `06a848ef41f87e05b1c1fd15f9a9f989ac7c665f909774ad83bf4deadd38e2e8`;
other inputs fail before any output is written. Keep the existing wrapper and
ARM binary. Do not apply these offsets to another Unicorn build.

## Cause

On a valid memory access, Unicorn synchronizes the callback PC using
`cpu_restore_state`. In MIPS this also restores delay/forbidden-slot branch bits
in `env->hflags`. Those bits can then leak back into the running translated block,
whose `saved_hflags` optimization assumes they have not changed. Consequences
include an extra load/store when a jump targets its own slot, **and an extra
execution of the instruction after an ordinary slot**. This is real execution,
not merely a repeated JS notification.

Relevant upstream 2.1.4 code (used to identify behavior, not claimed as the custom
build's full source):
- [load_helper/store_helper](https://github.com/unicorn-engine/unicorn/blob/2.1.4/qemu/accel/tcg/cputlb.c)
- [save_cpu_state/clear_branch_hflags](https://github.com/unicorn-engine/unicorn/blob/2.1.4/qemu/target/mips/translate.c)

## Repair and compatibility boundary

Only native function bodies 82 (load helper) and 118 (store helper) change.
The conceptual C change is:

```c
CPUArchState *saved_env = env;
uint32_t saved_branch = env->hflags & MIPS_HFLAG_BMASK;
bool did_sync = false;
target_ulong sync_pc = 0;
// After each existing cpu_restore_state in this helper:
did_sync = true;
sync_pc = saved_env->active_tc.PC;
// At the existing normal return, after all callbacks and the memory operation:
if (did_sync && uc->invalid_error == UC_ERR_OK && !uc->stop_request &&
    saved_env->active_tc.PC == sync_pc) {
    saved_env->hflags = (saved_env->hflags & ~MIPS_HFLAG_BMASK) | saved_branch;
}
```

Offsets proven against this exact binary: `env.hflags=11156`, `env.PC=128`,
`uc.invalid_error=816`, `uc.stop_request=785`, branch mask `0x87f800`.
Four local variables are appended; existing local/function indices are retained.
Memory callbacks still see synchronized PC/branch state. Faults, stop requests,
and callback PC redirects do not run this restoration. Only branch bookkeeping
bits are restored; other CPU flags, data, registers and memory are untouched.

No TCG operations are added. An earlier experiment unconditionally clearing
translator branch flags fixed the symptom but changed existing cycle scores;
that experiment was rejected. The custom cycle-counter body and interpreter are
unchanged. Non-code sections and all other native function bodies are byte-identical.
The new binary is 252 bytes larger. Known faulty programs may correctly execute
fewer operations after repair; their previously inflated counts are not retained.

This is not a claim that all upstream Unicorn APIs/instructions have been audited.
In particular, retain the application's completed-boundary pause/resume handling:
stopping in a memory callback inside a delay slot is not an architectural boundary.
Do not replace that logic with immediate hook stops.

## Reproduction, checks, reversal

No Python, compiler or WABT installation is needed:

```sh
node scripts/mips-memory-hook-state/patch.cjs --check
node scripts/mips-memory-hook-state/patch.cjs --apply /absolute/original.wasm /absolute/new.wasm
node scripts/mips-memory-hook-state/patch.cjs --reverse /absolute/new.wasm /absolute/restored.wasm
node --test tests/mips-native-memory-hooks.test.cjs tests/mips-native-patch.test.cjs tests/emulator-control-flow.test.cjs
node --test tests/probes/mips-own-slot-native.cjs
```

Input and output must differ; outputs must not already exist. `--check` verifies
both distributed copies, WebAssembly validity, byte-exact reverse/reapply, the
changed-function set, and unchanged non-code sections. `patch.json` contains
function-relative edits, before/after hashes, and exact-build metadata. The native
regressions assert actual hook multiplicity plus independent register, memory,
PC-at-explicit-stop and instruction-trace results, on both shipped copies. Run
all regressions, both production builds and deterministic full-judge comparisons
before changing this patch or removing the completed-boundary application handling.
