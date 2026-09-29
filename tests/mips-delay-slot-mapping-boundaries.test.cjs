const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { sourceRoot, loadSource, loadRuntime } = require('./helpers/emulator-runtime.cjs');
const { createHighlighter, getHighlightFromStepResult } = loadSource(path.join(sourceRoot, 'frontend/src/lib/highlighter.ts'));

const options = { target: 'mips-linux-gnu', variant: 'mips-r6' };
const wordsOf = code => Array.from({ length: code.length / 4 }, (_, i) => Buffer.from(code.slice(i * 4, i * 4 + 4)).readUInt32BE());

test('duplicate explicit DWARF rows do not invent a delay slot for an ordinary instruction', async () => {
  const source = '.file 1 "in.s"\n.loc 1 4\n.loc 1 5\nori $t0,$zero,1\nori $t1,$zero,2\n.loc 1 7\nori $t2,$zero,3\n';
  const h = createHighlighter(options);
  const code = await h.initialize(source);
  assert.equal(wordsOf(code)[0], 0x34080001); // ORI, not a branch.
  assert.deepEqual(h.getAddressesForLine(5), [0x10000]);
  assert.ok(!h.getAllMappings().some(row => row.address === 0x10004), 'no source row may be shifted to the next ORI');
});

test('explicit DWARF rows remain authoritative even at a delayed branch', async () => {
  const source = '.file 1 "in.s"\n.set noreorder\n.loc 1 5\n.loc 1 6\nj target\nnop\n.loc 1 9\ntarget:\nori $t0,$zero,1\n';
  const h = createHighlighter(options);
  await h.initialize(source);
  assert.ok(!h.getAllMappings().some(row => row.address === 0x10004));
  assert.deepEqual(h.getAddressesForLine(6), [0x10000]);
});

for (const [name, instruction, expectedPrefix, slotWord] of [
  ['li', 'li $t0,0x12345678', [0x3c081234], 0x35085678],
  ['la-symbol', 'la $t0,main', [0x3c080001], 0x25080000],
  ['la-large-offset', 'la $t0,0x12345678($t1)', [0x3c081234, 0x35085678], 0x01094021],
]) {
  for (const branch of ['j main', 'jal main', 'beq $t2,$t3,main', 'bne $t2,$t3,main', 'jr $ra']) {
    test(`${name} split across ${branch}: preserve the prefix and map the real slot`, async () => {
      const source = `main:\n${instruction}\n${branch}\n`;
      const h = createHighlighter(options);
      const code = await h.initialize(source);
      const words = wordsOf(code);
      assert.deepEqual(words.slice(0, expectedPrefix.length), expectedPrefix);
      const branchAddress = 0x10000 + expectedPrefix.length * 4;
      const slotAddress = branchAddress + 4;
      assert.equal(words[expectedPrefix.length + 1], slotWord, 'GAS moved only the final expansion instruction');
      assert.deepEqual(h.getAddressesForLine(2), [...expectedPrefix.map((_, i) => 0x10000 + i * 4), slotAddress]);
      assert.deepEqual(h.getAddressesForLine(3), [branchAddress]);
      assert.deepEqual(h.getHighlightForAddresses([branchAddress, slotAddress]).lineNumbers, [3, 2]);
    });
  }
}

test('real stepping and source breakpoints on a partially moved LI retain the correct register value', async () => {
  const source = 'main:\nli $t0,0x12345678\nj main\n';
  const h = createHighlighter(options);
  const words = wordsOf(await h.initialize(source));
  const { create } = await loadRuntime('frontend', 'MIPS_R6');
  const r = create(words);
  try {
    const first = r.engine.stepDebugExecution();
    assert.deepEqual(getHighlightFromStepResult(first, h).lineNumbers, [2]);
    assert.equal(r.mm.getRegister('t0').value, 0x12340000);
    const second = r.engine.stepDebugExecution();
    assert.deepEqual(getHighlightFromStepResult(second, h).lineNumbers, [3, 2]);
    assert.equal(r.mm.getRegister('t0').value, 0x12345678);
    assert.equal(second.pc, 0x10000);
    const breakpoints = h.getAddressesForLine(2);
    const a = r.engine.runUntilMemoryWrite(0x30000, [1, 2, 3, 4], 5000000, breakpoints);
    assert.equal(a.breakpoint.address, 0x10000);
    const b = r.engine.runUntilMemoryWrite(0x30000, [1, 2, 3, 4], 5000000, breakpoints);
    assert.equal(b.breakpoint.address, 0x10008);
    assert.equal(b.pc, 0x10000);
    assert.equal(r.mm.getRegister('t0').value, 0x12345678);
  } finally { r.close(); }
});

for (const [name, source, expected] of [
  ['explicit-slot', '.set noreorder\nmain:\nli $t0,0x12345678\nj main\nori $t2,$zero,7\n', [[3, [0x10000, 0x10004]], [4, [0x10008]], [5, [0x1000c]]]],
  ['compact-bc', 'main:\nli $t0,0x12345678\nbc main\n', [[2, [0x10000, 0x10004]], [3, [0x10008]]]],
  ['compact-beqc', 'main:\nli $t0,0x12345678\nbeqc $t2,$t3,main\n', [[2, [0x10000, 0x10004]], [3, [0x10008]]]],
  ['inserted-nop', 'main:\nli $t0,0x12345678\nbeq $t0,$t1,main\n', [[2, [0x10000, 0x10004]], [3, [0x10008]]]],
  ['label-on-pseudo', 'main: li $t0,0x12345678\nj main\n', [[1, [0x10000, 0x10008]], [2, [0x10004]]]],
]) test(`${name}: no wrong ownership or phantom slot`, async () => {
  const h = createHighlighter(options);
  await h.initialize(source);
  for (const [line, addresses] of expected) assert.deepEqual(h.getAddressesForLine(line), addresses);
});

test('an instruction assembled from a raw word is not inferred to belong to a preceding LI', async () => {
  const source = '.set noreorder\nmain:\nli $t0,0x12345678\nj main\n.word 0x35085678\n';
  const h = createHighlighter(options);
  await h.initialize(source);
  assert.deepEqual(h.getAddressesForLine(3), [0x10000, 0x10004]);
});

test('ARM mappings keep their existing behavior', async () => {
  const h = createHighlighter({ target: 'armv7-linux-gnueabihf' });
  const code = await h.initialize('mov r0, #1\nadd r1, r0, #2\n');
  assert.equal(code.length, 8);
  assert.deepEqual(h.getAddressesForLine(1), [0x10000]);
  assert.deepEqual(h.getAddressesForLine(2), [0x10004]);
});

for (const [name, source, line, addresses] of [
  ['numeric-register', 'main:\nli $8,0x12345678\nj main\n', 2, [0x10000, 0x10008]],
  ['aliased-base-register', 'main:\nla $t0,0x12345678($t0)\nj main\n', 2, [0x10000, 0x10004, 0x1000c]],
  ['restore-reorder', '.set push\n.set noreorder\nnop\n.set pop\nmain:\nli $t0,0x12345678\nj main\n', 6, [0x10004, 0x1000c]],
]) test(`${name}: register aliases and restored assembler mode`, async () => {
  const h = createHighlighter(options);
  await h.initialize(source);
  assert.deepEqual(h.getAddressesForLine(line), addresses);
});

test('non-default load address keeps slot addresses relative to the emitted code', async () => {
  const h = createHighlighter({ ...options, baseAddress: 0x24000 });
  await h.initialize('main:\nli $t0,0x12345678\nj main\n');
  assert.deepEqual(h.getAddressesForLine(2), [0x24000, 0x24008]);
});
