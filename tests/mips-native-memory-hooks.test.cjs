const test = require('node:test');
const assert = require('node:assert/strict');
const { loadRuntime } = require('./helpers/emulator-runtime.cjs');

// These are raw CPU tests, not application-event de-duplication tests.
// Native hooks must be observational: they must not change instruction count,
// branch outcome, architectural registers, or store/load multiplicity.
for (const layer of ['frontend', 'backend']) test(`${layer}: native MIPS memory-hook state`, async t => {
  const { uc, C, create } = await loadRuntime(layer, 'MIPS_R6');
  const operations = [
    ['sw', 0xad2e0010, 4, 'write'], ['sh', 0xa52e0010, 2, 'write'], ['sb', 0xa12e0010, 1, 'write'],
    ['lw', 0x8d2e0010, 4, 'read'], ['lhu', 0x952e0010, 2, 'read'], ['lbu', 0x912e0010, 1, 'read'],
  ];
  const branches = target => [
    ['j', (0x08000000 | target >>> 2) >>> 0, {}, true, false],
    ['jal', (0x0c000000 | target >>> 2) >>> 0, {}, true, true],
    ['jalr', 0x0100f809, { t0: target }, true, true],
    ['jr-r6', 0x01000009, { t0: target }, true, false],
    ['beq-taken', (0x11920000 | (target - C.CODE_BASE - 4) / 4) >>> 0, { t4: 1, s2: 1 }, true, false],
    ['beq-untaken', (0x11920000 | (target - C.CODE_BASE - 4) / 4) >>> 0, { t4: 1, s2: 2 }, false, false],
    ['bne-taken', (0x15920000 | (target - C.CODE_BASE - 4) / 4) >>> 0, { t4: 1, s2: 2 }, true, false],
    ['bne-untaken', (0x15920000 | (target - C.CODE_BASE - 4) / 4) >>> 0, { t4: 1, s2: 1 }, false, false],
  ];
  for (const targetOffset of [4, 8]) for (const [branch, word, regs, taken, link] of branches(C.CODE_BASE + targetOffset)) {
    for (const [op, memoryWord, size, kind] of operations) for (const codeHook of [false, true]) {
      await t.test(`${branch} target+${targetOffset} ${op} codeHook=${codeHook}`, () => {
        const r = create([word, memoryWord, 0x25ad0001, 0], { t1: C.DATA_BASE, t6: 3, ...regs });
        const observed = [[], []], after = [], pcs = [], handles = [];
        r.u.mem_write(C.DATA_BASE + 16, [3, 3, 3, 3]);
        try {
          for (const events of observed) handles.push(r.u.hook_add(kind === 'write' ? uc.HOOK_MEM_WRITE : uc.HOOK_MEM_READ,
            (_, type, addr, bytes, value) => events.push({ pc: r.pc(), addr: Number(addr), size: bytes, value: Number(value) }),
            undefined, C.DATA_BASE + 16, C.DATA_BASE + 19));
          if (kind === 'read') handles.push(r.u.hook_add(uc.HOOK_MEM_READ_AFTER,
            (_, type, addr, bytes, value) => after.push(Number(value)), undefined, C.DATA_BASE + 16, C.DATA_BASE + 19));
          if (codeHook) handles.push(r.u.hook_add(uc.HOOK_CODE, (_, addr) => { pcs.push(Number(addr)); if (Number(addr) === C.CODE_BASE + 12) r.u.emu_stop(); }, undefined, 1, 0));
          r.u.emu_start(C.CODE_BASE, C.CODE_BASE + r.bytes.length, 0, 0);
          const visits = targetOffset === 4 && taken ? 2 : 1;
          for (const events of observed) {
            assert.equal(events.length, visits, 'exact architectural memory access count');
            assert.deepEqual(events.map(e => [e.pc, e.addr, e.size]), Array.from({ length: visits }, () => [C.CODE_BASE + 4, C.DATA_BASE + 16, size]));
          }
          assert.equal(r.mm.getRegister('t5').value, 1, 'instruction after the slot executes exactly once');
          assert.equal(r.mm.getRegister('ra').value, link ? C.CODE_BASE + 8 : 0);
          // Native `until` uses a lazy PC; assert PC at an explicit code-hook stop.
          if (codeHook) assert.equal(r.pc(), C.CODE_BASE + 12);
          if (kind === 'read') {
            const value = size === 4 ? 0x03030303 : size === 2 ? 0x0303 : 3;
            assert.deepEqual(after, Array(visits).fill(value));
            assert.equal(r.mm.getRegister('t6').value, value);
          } else {
            assert.deepEqual(observed[0].map(e => e.value), Array(visits).fill(3));
            assert.deepEqual(Array.from(r.u.mem_read(C.DATA_BASE + 16, size)), size === 4 ? [0, 0, 0, 3] : size === 2 ? [0, 3] : [3]);
          }
          if (codeHook) assert.deepEqual(pcs, [C.CODE_BASE, ...Array(visits).fill(C.CODE_BASE + 4), C.CODE_BASE + 8, C.CODE_BASE + 12]);
        } finally { for (const handle of handles) r.u.hook_del(handle); assert.equal(r.activeHooks.size, 0); r.close(); }
      });
    }
  }
  for (const [op, memoryWord, size, kind] of operations) {
    await t.test(`${op}: delay slot and target across a code-page boundary`, () => {
      const target = C.CODE_BASE + 4096;
      const words = [...Array(1023).fill(0), (0x08000000 | target >>> 2) >>> 0, memoryWord, 0x25ad0001, 0];
      const r = create(words, { t1: C.DATA_BASE, t6: 3 });
      r.u.mem_write(C.DATA_BASE + 16, [3, 3, 3, 3]);
      const events = [];
      const hook = r.u.hook_add(kind === 'write' ? uc.HOOK_MEM_WRITE : uc.HOOK_MEM_READ,
        () => events.push(r.pc()), undefined, C.DATA_BASE + 16, C.DATA_BASE + 19);
      try {
        r.u.emu_start(target - 4, C.CODE_BASE + r.bytes.length, 0, 0);
        assert.deepEqual(events, [target, target]);
        assert.equal(r.mm.getRegister('t5').value, 1);
      } finally { r.u.hook_del(hook); r.close(); }
    });
    await t.test(`${op}: mapping an unmapped data page inside an error hook`, () => {
      const data = 0x50000000;
      const r = create([0x08004001, memoryWord, 0x25ad0001, 0], { t1: data, t6: 3 });
      let repaired = 0; const events = [];
      const hook = r.u.hook_add(kind === 'write' ? uc.HOOK_MEM_WRITE : uc.HOOK_MEM_READ,
        () => events.push(r.pc()), undefined, data + 16, data + 19);
      const invalid = r.u.hook_add(kind === 'write' ? uc.HOOK_MEM_WRITE | uc.HOOK_MEM_WRITE_UNMAPPED : uc.HOOK_MEM_READ | uc.HOOK_MEM_READ_UNMAPPED,
        (_, type) => { if (type !== uc.MEM_WRITE_UNMAPPED && type !== uc.MEM_READ_UNMAPPED) return false; repaired++; r.u.mem_map(data, 4096, uc.PROT_ALL); r.u.mem_write(data + 16, [3, 3, 3, 3]); return true; }, undefined, 1, 0);
      try {
        r.u.emu_start(C.CODE_BASE, C.CODE_BASE + r.bytes.length, 0, 0);
        assert.equal(repaired, 1); assert.deepEqual(events, [C.CODE_BASE + 4, C.CODE_BASE + 4]);
        assert.equal(r.mm.getRegister('t5').value, 1);
      } finally { r.u.hook_del(hook); r.u.hook_del(invalid); r.close(); }
    });
  }
  for (const [op, memoryWord, size, kind] of operations) for (const protection of ['unmapped', 'protected']) {
    await t.test(`${op}: ${protection} delay-slot fault remains a CPU error`, () => {
      const r = create([0x08004001, memoryWord, 0x25ad0001, 0], { t1: protection === 'unmapped' ? 0x50000000 : C.DATA_BASE, t6: 3 });
      const hook = r.u.hook_add(kind === 'write' ? uc.HOOK_MEM_WRITE : uc.HOOK_MEM_READ, () => {}, undefined, 1, 0);
      try {
        if (protection === 'protected') r.u.mem_protect(C.DATA_BASE, C.DATA_SIZE, kind === 'write' ? uc.PROT_READ : uc.PROT_WRITE);
        assert.throws(() => r.u.emu_start(C.CODE_BASE, C.CODE_BASE + r.bytes.length, 0, 0), /uc_emu_start/);
        assert.equal(r.mm.getRegister('t5').value, 0);
        assert.equal(r.pc(), C.CODE_BASE + 4);
      } finally { r.u.hook_del(hook); r.close(); }
    });
  }
});
