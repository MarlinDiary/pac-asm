const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { sourceRoot } = require('./helpers/emulator-runtime.cjs');
const { transform, verify } = require('../scripts/mips-memory-hook-state/patch.cjs');
for (const file of ['frontend/public/arm/unicorn_wasm_mips.wasm', 'backend/vendor/unicorn/unicorn_wasm_mips.wasm']) {
  test(`${file}: reproducible native patch, exact rollback, no cycle/interpreter changes`, () => {
    const bytes = fs.readFileSync(path.join(sourceRoot, file));
    assert.deepEqual(verify(bytes).changedFunctions, [82, 118]);
    const original = transform(bytes, true);
    assert.ok(WebAssembly.validate(original));
    assert.deepEqual(transform(original), bytes);
    original[original.length - 1] ^= 1;
    assert.throws(() => transform(original), /Unrecognized WASM/);
  });
}
test('frontend and backend distribute identical MIPS CPU bytes', () => {
  assert.deepEqual(fs.readFileSync(path.join(sourceRoot, 'frontend/public/arm/unicorn_wasm_mips.wasm')),
    fs.readFileSync(path.join(sourceRoot, 'backend/vendor/unicorn/unicorn_wasm_mips.wasm')));
});
