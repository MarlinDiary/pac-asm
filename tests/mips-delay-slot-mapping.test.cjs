const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { repo, loadSource, loadRuntime } = require('./helpers/emulator-runtime.cjs');

// GAS assembles MIPS in `.set reorder` mode and moves the instruction written
// before a delayed branch into its delay slot. Stepping and breakpoints must
// still resolve that source line.
test('frontend highlighter maps a GAS-displaced delay-slot instruction to its real address', async () => {
  const { createHighlighter } = loadSource(path.join(repo, 'frontend/src/lib/highlighter.ts'));
  const source = 'main:\nori $t0, $zero, 4\nlui $t1, 0x3\nsw $t0, 0($t1)\nj main\n';
  const highlighter = createHighlighter({ target: 'mips-linux-gnu', variant: 'mips-r6' });
  const code = await highlighter.initialize(source);
  const words = [];
  for (let i = 0; i < code.length; i += 4) words.push(((code[i] << 24) | (code[i + 1] << 16) | (code[i + 2] << 8) | code[i + 3]) >>> 0);
  assert.deepEqual(words, [0x34080004, 0x3c090003, 0x08004000, 0xad280000], 'GAS swapped the store into the delay slot');
  assert.deepEqual(highlighter.getAddressesForLine(5), [0x10008], 'j main keeps the branch address');
  assert.deepEqual(highlighter.getAddressesForLine(4), [0x1000c], 'sw gets the delay-slot address');
  assert.deepEqual(highlighter.getHighlightForAddresses([0x10008, 0x1000c]).lineNumbers, [5, 4]);
  const { create } = await loadRuntime('frontend', 'MIPS_R6');
  const r = create(words);
  try {
    // Only the 'sw' line breakpoint: run stops after the slot, at the jump target, with the command.
    const stop = r.engine.runUntilMemoryWrite(0x30000, [1, 2, 3, 4], 5000000, [0x1000c]);
    assert.equal(stop.stopReason, 'breakpoint');
    assert.equal(stop.breakpoint.address, 0x1000c);
    assert.equal(stop.memEvent.value, 4);
    assert.equal(stop.pc, 0x10000);
  } finally { r.close(); }
});

for (const layer of ['frontend', 'backend']) test(`${layer}: stepping a delayed branch reports the delay slot address`, async () => {
  const { C, create } = await loadRuntime(layer, 'MIPS_R6');
  // beq $t4,$s2 (taken) with addiu in the slot, then a compact bc.
  const delayed = create([0x11920004, 0x25ad0001, 0, 0, 0, 0, 0x34130002, 0], { t4: 1, s2: 1 });
  try {
    const step = delayed.engine.stepDebugExecution();
    assert.deepEqual(step.executedAddresses, [C.CODE_BASE, C.CODE_BASE + 4]);
    assert.equal(step.pc >>> 0, C.CODE_BASE + 20);
    assert.equal(delayed.mm.getRegister('t5').value, 1);
  } finally { delayed.close(); }
  const compact = create([0xc8000002, 0, 0, 0x34130002, 0]);
  try {
    const step = compact.engine.stepDebugExecution();
    assert.deepEqual(step.executedAddresses, [C.CODE_BASE]);
    assert.equal(step.pc >>> 0, C.CODE_BASE + 12);
  } finally { compact.close(); }
});
