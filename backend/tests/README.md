# Backend judge regression checks

Build first, then run the real-WASM isolation and failure tests:

```sh
cd backend
npm run build
node --test tests/judge-isolation.test.cjs tests/runtime-errors.test.cjs
```

These checks use local workers only. They do not contact Railway, GitHub or MongoDB,
create submissions, or modify the frontend. Two timeout cases each deliberately
exercise the existing five-second execution limit.

`JUDGE_BUILD_ROOT=/absolute/path/to/another/backend` selects a separately built
backend for before/after checks. The duplicate-reset regression intentionally
fails against the old backend (five explicit MIPS resets instead of one).

## Deterministic local performance comparison

From the repository root, after building the selected backend:

```sh
node backend/scripts/benchmark-judge.cjs "$PWD/backend" /tmp/judge-single.json single
node backend/scripts/benchmark-judge.cjs "$PWD/backend" /tmp/judge-queue.json queue 3
```

Use an absolute output path. `single` runs the starter programs for Levels 1–4 in
both architectures and a dot-seeking Challenge fixture adapted from Level 3.
Level 4 retains all 2,000 attempts and Challenge retains all 100. `queue` submits
30 synthetic MIPS Challenge jobs through the same AsyncTaskQueue implementation;
its last argument selects local concurrency. It does not change the deployed
queue configuration. Challenge fixtures include replay recording, as /submit does.

The script uses a separate deterministic random stream per job, real compiler
and emulator workers, and reports full results, result hashes, queue wait,
judging duration, emulator/assembler phase times, CPU usage, sampled peak RSS and
event-loop delay. It changes Math.random only inside this short-lived benchmark
process. Run variants serially, with no other builds or benchmarks competing for
CPU. Compare complete results and random-call counts, not just pass/fail or speed.

These are local judging measurements, not production end-to-end latency: browser
network, GitHub verification, MongoDB persistence and frontend polling are excluded.
Local concurrency results do not justify changing Railway concurrency or capacity
without measurements on the actual deployment hardware.

## Reset contract protected by the tests

The MIPS backend's `loadCode` already rebuilds the complete runtime. Later judging
attempts therefore skip the redundant explicit reset immediately before loading
code. ARM still explicitly resets; first-attempt initialization and error recovery
are unchanged. Do not remove the MIPS rebuild without updating and rerunning the
isolation tests. The tests cover registers, stack, game memory, user memory near
its beginning/middle/end, stale code, per-attempt cycle deltas, early failure,
Challenge attempt counts, compiler errors, map-write failure recovery and timeout
cleanup. The worker's raw cycle counter is cumulative, not reset to zero.
