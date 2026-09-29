const test = require('node:test');
const assert = require('node:assert/strict');
const fixtures = require('./fixtures/emulator-control-flow.json');
const { loadRuntime } = require('./helpers/emulator-runtime.cjs');

for (const layer of ['frontend', 'backend']) for (const arch of ['MIPS_R6', 'ARM']) {
  test(`${layer} ${arch}: real-WASM execution and pause/resume contracts`, async t => {
    const { uc, C, create } = await loadRuntime(layer, arch);
    const inputs = fixtures[arch].map(f => ({ ...f }));
    if (arch === 'MIPS_R6') {
      // A jump can target its own slot. That store executes twice legitimately.
      inputs.push({ name: 'jump-target-is-its-command-slot', words: [0x08004001, 0xad2e0000, 0x34130002, 0xad330000, 0],
        registers: { t1: C.DATA_BASE, t6: 3 }, expected: { s3: 2, t5: 0, ra: 0, commands: [3, 3, 2] }, breaks: { control: 0, slot: 4, target: 8 } });
      inputs.push({ name: 'jump-target-is-its-increment-slot', words: [0x08004001, 0x25ad0001, 0x34130002, 0xad330000, 0],
        registers: { t1: C.DATA_BASE }, expected: { s3: 2, t5: 2, ra: 0, commands: [2] }, breaks: { control: 0, slot: 4, target: 8 } });
      inputs.push({ name: 'backward-branch-loop', words: [0x25ad0001, 0x15aefffe, 0, 0x34130002, 0xad330000, 0],
        registers: { t1: C.DATA_BASE, t6: 3 }, expected: { s3: 2, t5: 3, ra: 0, commands: [2] }, breaks: { control: 4, slot: 8, target: 0 } });
      inputs.push({ name: 'branch-to-self-with-slot-increment', words: [0x15aeffff, 0x25ad0001, 0x34130002, 0xad330000, 0],
        registers: { t1: C.DATA_BASE, t6: 2 }, expected: { s3: 2, t5: 3, ra: 0, commands: [2] }, breaks: { control: 0, slot: 4, target: 8 } });
      // Compact BEQC (no delay slot) has a forbidden slot on the untaken path.
      for (const taken of [true, false]) inputs.push({ name: `compact-beqc-command-slot-${taken}`,
        words: [0x21920004, 0xad2e0000, 0x34130001, 0x08004006, 0, 0x34130002, 0xad330000, 0],
        registers: { t4: 1, s2: taken ? 1 : 2, t1: C.DATA_BASE, t6: 3 },
        expected: { s3: taken ? 2 : 1, t5: 0, ra: 0, commands: taken ? [2] : [3, 1] }, breaks: { control: 0, slot: 4, target: 20 } });
      for (const [name, store] of [['sb', 0xa12e0003], ['sh', 0xa52e0002]]) inputs.push({
        name: `${name}-in-delay-slot`, words: [0x11920004, store, 0x34130001, 0x08004006, 0, 0x34130002, 0xad330000, 0],
        registers: { t4: 1, s2: 2, t1: C.DATA_BASE, t6: 3 }, expected: { s3: 1, t5: 0, ra: 0, commands: [3, 1] }, breaks: { control: 0, slot: 4, target: 20 } });
    }
    const modes = ['native', 'run', 'single', 'step-all'];
    if (layer === 'frontend') modes.push('break-control', 'break-slot', 'break-target', 'break-all');
    for (const fixture of inputs) for (const mode of modes) {
      await t.test(`${fixture.name} / ${mode}`, t => {
        const r = create(fixture.words, fixture.registers); const commands = [];
        try {
          if (mode === 'native') {
            const hook = r.u.hook_add(uc.HOOK_MEM_WRITE, (...args) => {
              const e = r.engine.extractMemoryHookEvent(args);
              if (e && e.addr >= C.DATA_BASE && e.addr < C.DATA_BASE + 4) commands.push(r.engine.normalizeCommandValue(e.value, e.size, [1, 2, 3, 4]));
            }, undefined, C.DATA_BASE, C.DATA_BASE + 4);
            try { r.u.emu_start(C.CODE_BASE, C.CODE_BASE + r.bytes.length, 0, 0); } finally { r.u.hook_del(hook); }
          } else {
            if (mode === 'single') {
              const result = r.engine.stepDebugExecution();
              if (result.memWriteEvent) commands.push(result.memWriteEvent.value);
            }
            let calls = 0;
            while (r.pc() < C.CODE_BASE + r.bytes.length && calls < 32) {
              const bps = mode === 'break-all' ? fixture.words.map((_, i) => C.CODE_BASE + i * 4)
                : calls === 0 && mode.startsWith('break-') ? [C.CODE_BASE + fixture.breaks[mode.slice(6)]] : [];
              const result = mode === 'step-all' ? r.engine.stepDebugExecution()
                : r.engine.runUntilMemoryWrite(C.DATA_BASE, [1, 2, 3, 4], 5000000, bps);
              const event = result.memEvent || result.memWriteEvent;
              if (event) commands.push(event.value);
              assert.notEqual(result.stopReason, 'timeout'); assert.notEqual(result.stopReason, 'unknown');
              assert.equal(r.activeHooks.size, 0, 'temporary hooks must be released at every pause');
              calls++;
            }
            assert.ok(calls < 32, 'execution must make progress');
          }
          const actual = {};
          for (const register of Object.keys(fixture.expected).filter(k => k !== 'commands')) actual[register] = r.mm.getRegister(register).value >>> 0;
          actual.commands = commands;
          assert.deepEqual(actual, fixture.expected);
          assert.equal(r.activeHooks.size, 0);
          if (arch === 'MIPS_R6' && mode === 'run' && fixture.name === 'ordinary-increment') assert.equal(r.codeHookCount(), 0, 'ordinary programs retain the memory-hook fast path');
        } finally { r.close(); }
      });
    }
    for (const method of ['runUntilMemoryWrite', 'stepDebugExecution']) await t.test(`CPU faults propagate and release hooks / ${method}`, () => {
      const r = create([arch === 'MIPS_R6' ? 0x0000000d : 0xe7f000f0]);
      try {
        assert.throws(() => r.engine[method](C.DATA_BASE, [1, 2, 3, 4], 5000000), /RUNTIME_ERROR:.*uc_emu_start/);
        assert.equal(r.activeHooks.size, 0);
      } finally { r.close(); }
    });
  });
}
