const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { repo, loadSource, loadRuntime } = require('./helpers/emulator-runtime.cjs');

const variants = [
  ['beq', 'beq $t4, $s2, target', { t4: 1, s2: 1 }],
  ['beq-default-reorder', 'beq $t4, $s2, target', { t4: 1, s2: 1 }],
  ['bne', 'bne $t4, $s2, target', { t4: 1, s2: 2 }],
  ['beqc', 'beqc $t4, $s2, target', { t4: 1, s2: 1 }],
  ['bnec', 'bnec $t4, $s2, target', { t4: 1, s2: 2 }],
  ['beqzc', 'beqzc $t4, target', { t4: 0 }],
  ['bnezc', 'bnezc $t4, target', { t4: 1 }],
  ['blezc', 'blezc $t4, target', { t4: 0xffffffff }],
  ['bgezc', 'bgezc $t4, target', { t4: 1 }],
  ['bc', 'bc target', {}],
];

test('real -mips32r6 assembler output agrees across run, step and breakpoint paths', async t => {
  const { GASAssembler } = loadSource(path.join(repo, 'backend/src/game/assembler.ts'));
  const assembler = new GASAssembler({ target: 'mips-linux-gnu', variant: 'mips-r6' });
  await assembler.initialize();
  for (const layer of ['frontend', 'backend']) {
    const { C, create } = await loadRuntime(layer, 'MIPS_R6');
    for (const [name, branch, registers] of variants) {
      const source = (name.endsWith('default-reorder') ? '' : '.set noreorder\n') +
        `.text\n${branch}\nnop\nori $s3, $zero, 1\nj finish\nnop\ntarget:\nori $s3, $zero, 2\nfinish:\nsw $s3, 0($t1)\nnop\n`;
      const { machineCode } = await assembler.assemble(source);
      const bytes = Buffer.from(machineCode); const words = [];
      for (let i = 0; i < bytes.length; i += 4) words.push(bytes.readUInt32BE(i));
      const modes = layer === 'frontend' ? ['run', 'step', 'breakpoint'] : ['run', 'step'];
      for (const mode of modes) await t.test(`${layer} / ${name} / ${mode}`, () => {
        const r = create(words, { ...registers, t1: C.DATA_BASE });
        try {
          if (mode === 'step') r.engine.stepDebugExecution();
          if (mode === 'breakpoint') {
            const stop = r.engine.runUntilMemoryWrite(C.DATA_BASE, [1, 2, 3, 4], 5000000, [C.CODE_BASE]);
            assert.equal(stop.stopReason, 'breakpoint');
          }
          const result = r.engine.runUntilMemoryWrite(C.DATA_BASE, [1, 2, 3, 4]);
          assert.equal(result.memEvent.value, 2);
          assert.equal(r.mm.getRegister('s3').value, 2);
          assert.equal(r.activeHooks.size, 0);
        } finally { r.close(); }
      });
    }
  }
});
