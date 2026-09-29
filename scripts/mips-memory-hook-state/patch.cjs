#!/usr/bin/env node
'use strict';
// Reproducible, exact-build-only repair. Never guesses offsets in a new build.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const manifest = require('./patch.json');
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
function readULEB(bytes, start) {
  let value = 0, shift = 0, pos = start;
  do { const byte = bytes[pos++]; assert.ok(byte !== undefined && shift < 35); value += (byte & 127) * 2 ** shift; shift += 7;
    if (!(byte & 128)) return [value, pos];
  } while (true);
}
function uleb(value) {
  const bytes = [];
  do { const byte = value & 127; value = Math.floor(value / 128); bytes.push(byte | (value ? 128 : 0)); } while (value);
  return Buffer.from(bytes);
}
function sections(bytes) {
  assert.equal(bytes.subarray(0, 8).toString('hex'), '0061736d01000000');
  const result = []; let pos = 8;
  while (pos < bytes.length) {
    const start = pos, id = bytes[pos++]; let size; [size, pos] = readULEB(bytes, pos);
    const end = pos + size; assert.ok(end <= bytes.length);
    result.push({ id, start, payload: pos, end }); pos = end;
  }
  return result;
}
function bodies(bytes) {
  const code = sections(bytes).find(s => s.id === 10); assert.ok(code);
  let [count, pos] = readULEB(bytes, code.payload); const result = [];
  for (let i = 0; i < count; i++) { let size; [size, pos] = readULEB(bytes, pos); result.push(bytes.subarray(pos, pos + size)); pos += size; }
  assert.equal(pos, code.end); return { code, result };
}
function transform(bytes, reverse = false) {
  assert.equal(sha(bytes), reverse ? manifest.afterSHA256 : manifest.beforeSHA256, 'Unrecognized WASM; no output written');
  const { code, result } = bodies(bytes);
  for (const f of manifest.functions) {
    const index = f.functionIndex - manifest.functionImports, before = result[index];
    assert.equal(sha(before), reverse ? f.afterSHA256 : f.beforeSHA256);
    let delta = 0, cursor = 0; const chunks = [];
    for (const edit of f.edits) {
      const old = Buffer.from(edit.before, 'hex'), next = Buffer.from(edit.after, 'hex');
      const offset = edit.offset + (reverse ? delta : 0), expected = reverse ? next : old;
      assert.ok(offset >= cursor); assert.deepEqual(before.subarray(offset, offset + expected.length), expected);
      chunks.push(before.subarray(cursor, offset), reverse ? old : next); cursor = offset + expected.length;
      delta += next.length - old.length;
    }
    chunks.push(before.subarray(cursor)); result[index] = Buffer.concat(chunks);
    assert.equal(sha(result[index]), reverse ? f.beforeSHA256 : f.afterSHA256);
  }
  const payload = Buffer.concat([uleb(result.length), ...result.flatMap(b => [uleb(b.length), b])]);
  const output = Buffer.concat([bytes.subarray(0, code.start), Buffer.from([10]), uleb(payload.length), payload, bytes.subarray(code.end)]);
  assert.equal(sha(output), reverse ? manifest.beforeSHA256 : manifest.afterSHA256);
  assert.ok(WebAssembly.validate(output), 'Invalid WASM'); return output;
}
function verify(bytes) {
  assert.equal(sha(bytes), manifest.afterSHA256, 'Unexpected patched build');
  const original = transform(bytes, true); assert.deepEqual(transform(original), bytes);
  const before = bodies(original).result, after = bodies(bytes).result;
  const changed = before.map((body, i) => body.equals(after[i]) ? null : i + manifest.functionImports).filter(i => i !== null);
  assert.deepEqual(changed, [82, 118]); // Load/store helpers only, not translator or cycle counter.
  const other = data => sections(data).filter(s => s.id !== 10).map(s => data.subarray(s.start, s.end));
  assert.deepEqual(other(original), other(bytes));
  return { sha256: sha(bytes), originalSHA256: sha(original), changedFunctions: changed, roundTrip: true };
}
if (require.main === module) {
  const [mode, input, output] = process.argv.slice(2);
  if (mode === '--check') {
    const root = path.resolve(__dirname, '../..');
    const paths = input ? [input] : ['frontend/public/arm/unicorn_wasm_mips.wasm', 'backend/vendor/unicorn/unicorn_wasm_mips.wasm'].map(p => path.join(root, p));
    for (const file of paths) console.log(JSON.stringify({ file, ...verify(fs.readFileSync(file)) }));
  } else {
    assert.ok((mode === '--apply' || mode === '--reverse') && input && output, 'Usage: patch.cjs --check [file] | --apply|--reverse input output');
    assert.notEqual(path.resolve(input), path.resolve(output), 'Keep the input intact');
    const bytes = transform(fs.readFileSync(input), mode === '--reverse');
    fs.writeFileSync(output, bytes, { flag: 'wx' }); // Never overwrite a file silently.
    assert.equal(sha(fs.readFileSync(output)), sha(bytes)); console.log(JSON.stringify({ output, sha256: sha(bytes) }));
  }
}
module.exports = { transform, verify, manifest };
