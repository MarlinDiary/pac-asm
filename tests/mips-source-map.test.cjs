const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { sourceRoot, loadSource } = require('./helpers/emulator-runtime.cjs');
const { resolveMipsDelaySlotRows: resolve } = loadSource(path.join(sourceRoot, 'frontend/src/lib/mips-source-map.ts'));
const base = 0x10000;
const bytes = words => words.flatMap(w => [w >>> 24, (w >>> 16) & 255, (w >>> 8) & 255, w & 255]);
const rows = [{ address: base, lineNumber: 1 }, { address: base, lineNumber: 2 }];

for (const [name, word] of [
  ['ordinary ORI', 0x34080001], ['compact BC', 0xc8000000], ['compact BEQC', 0x214b0000],
  ['compact opcode 6', 0x192c0000], ['compact opcode 7', 0x1d2c0000],
  ['removed JR encoding', 0x03e00008], ['removed likely branch', 0x514b0000],
]) test(`${name} never causes row relocation even when DWARF addresses collide`, () => {
  // Deliberately inconsistent source ensures the actual bytes, not the text,
  // decide whether a delay slot exists.
  assert.deepEqual(resolve('sw $t0,0($t1)\nj main\n', rows, bytes([word, 0xad280000]), base), rows);
});

for (const [name, words, source] of [
  ['truncated branch', [0x08004000], 'sw $t0,0($t1)\nj main\n'],
  ['raw branch word', [0x08004000, 0xad280000], 'sw $t0,0($t1)\n.word 0x08004000\n'],
  ['explicit inline location', [0x08004000, 0xad280000], 'sw $t0,0($t1)\nj main; .loc 1 2\n'],
]) test(`${name} preserves supplied rows`, () => {
  assert.deepEqual(resolve(source, rows, bytes(words), base), rows);
});

test('mapping corrections do not mutate instruction bytes or DWARF rows', () => {
  const input = Object.freeze(rows.map(row => Object.freeze({ ...row })));
  const code = Object.freeze(bytes([0x08004000, 0xad280000]));
  const result = resolve('sw $t0,0($t1)\nj main\n', input, code, base);
  assert.deepEqual(result.map(row => row.address), [base + 4, base]);
  assert.deepEqual(input, rows);
  assert.deepEqual(code, bytes([0x08004000, 0xad280000]));
});

test('three coincident rows are ambiguous and are not guessed into one slot', () => {
  const input = [...rows, { address: base, lineNumber: 3 }];
  assert.deepEqual(resolve('sw $t0,0($t1)\nnop\nj main\n', input, bytes([0x08004000, 0xad280000]), base), input);
});

test('an unrelated ORI destination is not accepted as a LI continuation', () => {
  const input = [{ address: base, lineNumber: 1 }, { address: base + 4, lineNumber: 2 }];
  assert.deepEqual(resolve('li $t0,0x12345678\nj main\n', input, bytes([0x3c081234, 0x08004000, 0x35295678]), base), input);
});
