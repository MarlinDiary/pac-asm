// Run after npm run build. Real WASM workers, no emulator mocks.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(process.env.JUDGE_BUILD_ROOT || path.join(__dirname, '..'));
process.chdir(root);
const { NodeEmulator } = require(root + '/dist/game/emulator/node-emulator');
const { assembleCode, MEMORY_CONFIG } = require(root + '/dist/game/emulator-utils');
const { validateGame } = require(root + '/dist/game/game-runner');
const { MAPS } = require(root + '/dist/game/maps');
const initialCode = arch => MAPS.find(m => m.id === 'level1').initialCode[arch];

for (const arch of ['MIPS_R6', 'ARM']) {
  test(`${arch}: new attempts erase memory, registers and stale code; preserve cycle accounting`, async () => {
    const emulator = new NodeEmulator();
    try {
      await emulator.initializeEmulator(arch);
      const code = await assembleCode(initialCode(arch), arch);
      await emulator.loadCode(code);
      const cleanRegisters = await emulator.getAllRegisters();
      const probes = [MEMORY_CONFIG.STACK_BASE, MEMORY_CONFIG.DATA_BASE,
        MEMORY_CONFIG.USER_DATA_BASE, MEMORY_CONFIG.USER_DATA_BASE + 64 * 1024 * 1024,
        MEMORY_CONFIG.USER_DATA_END - 3];
      for (let iteration = 0; iteration < 3; iteration++) {
        const run = await emulator.runUntilMemWrite(MEMORY_CONFIG.DATA_BASE, [1,2,3,4]);
        assert.equal(run.memEvent.value, 4);
        const cyclesAfterRun = await emulator.getCycleCount();
        assert.ok(cyclesAfterRun > 0);
        for (const address of probes) await emulator.writeMemory(address, [17,34,51,68]);
        // Dirty an instruction that will be replaced, and unused code space that
        // must be zeroed rather than leaking into the next attempt.
        await emulator.writeMemory(MEMORY_CONFIG.CODE_BASE, [255,255,255,255]);
        await emulator.writeMemory(MEMORY_CONFIG.CODE_BASE + MEMORY_CONFIG.CODE_SIZE - 4, [17,34,51,68]);
        if (arch === 'ARM') await emulator.reset();
        await emulator.loadCode(code);
        for (const address of [...probes, MEMORY_CONFIG.CODE_BASE + MEMORY_CONFIG.CODE_SIZE - 4]) {
          assert.deepEqual((await emulator.getMemory(address, 4)).data, [0,0,0,0]);
        }
        // The worker counter is cumulative; judging uses an attempt-local delta.
        assert.equal(await emulator.getCycleCount(), cyclesAfterRun);
        assert.deepEqual(await emulator.getAllRegisters(), cleanRegisters);
        assert.deepEqual((await emulator.getMemory(MEMORY_CONFIG.CODE_BASE, code.length)).data, code);
      }
    } finally { await emulator.close(); }
  });

  test(`${arch}: repeated judging preserves results without duplicate MIPS reset`, async () => {
    const original = NodeEmulator.prototype.reset;
    let resets = 0;
    NodeEmulator.prototype.reset = async function(...args) { resets++; return original.apply(this,args); };
    try {
      const result = await validateGame({sourceCode:initialCode(arch), levelId:'level1', architecture:arch, attempts:5});
      assert.equal(result.attempts.length, 5);
      assert.ok(result.attempts.every(a => a.success));
      const first = {...result.attempts[0], attempt:0};
      for (const attempt of result.attempts) assert.deepEqual({...attempt, attempt:0}, first);
      assert.equal(resets, arch === 'MIPS_R6' ? 1 : 5);
    } finally { NodeEmulator.prototype.reset = original; }
  });

  test(`${arch}: compiler failure does not poison the next submission`, async () => {
    await assert.rejects(validateGame({sourceCode:'not_an_instruction', levelId:'level1', architecture:arch}));
    const result = await validateGame({sourceCode:initialCode(arch), levelId:'level1', architecture:arch});
    assert.equal(result.summary.pass, true);
  });

  test(`${arch}: all-pass failures stop early; challenge still runs 100 attempts`, async () => {
    const sourceCode = arch === 'MIPS_R6' ? 'ORI $t0, $zero, 1' : 'MOV R0, #1';
    const failed = await validateGame({sourceCode, levelId:'level4', architecture:arch});
    assert.equal(failed.attempts.length, 1);
    assert.equal(failed.summary.pass, false);
    const challenge = await validateGame({sourceCode, levelId:'challenge', architecture:arch, recordReplay:true, includeRegisters:true});
    assert.equal(challenge.attempts.length, 100);
    assert.equal(challenge.replayAttempt.attempt, 1);
    assert.ok(challenge.replayAttempt.frames.length > 0);
    assert.ok(challenge.replayAttempt.frames[0].registers.length > 0);
    for (const attempt of challenge.attempts) assert.deepEqual({...attempt,attempt:0}, {...challenge.attempts[0],attempt:0});
  });
}

for (const architecture of ['MIPS_R6', 'ARM']) {
  test(`${architecture}: a failed map write does not contaminate the following attempt`, async () => {
    const originalLoad = NodeEmulator.prototype.loadCode;
    const originalWrite = NodeEmulator.prototype.writeMemory;
    let loads = 0;
    let injected = false;
    NodeEmulator.prototype.loadCode = async function(...args) { loads++; return originalLoad.apply(this,args); };
    NodeEmulator.prototype.writeMemory = async function(address, data) {
      if (loads === 2 && !injected) { injected = true; return false; }
      return originalWrite.call(this,address,data);
    };
    try {
      const result = await validateGame({sourceCode:initialCode(architecture), levelId:'level1', architecture, attempts:3});
      assert.equal(injected, true);
      assert.deepEqual(result.attempts.map(a=>a.success), [true,false,true]);
      assert.match(result.attempts[1].failureReason, /Failed to write map data for attempt/);
      assert.deepEqual({...result.attempts[0],attempt:0}, {...result.attempts[2],attempt:0});
    } finally {
      NodeEmulator.prototype.loadCode = originalLoad;
      NodeEmulator.prototype.writeMemory = originalWrite;
    }
  });

  test(`${architecture}: stalled code still times out and the next submission works`, async () => {
    const sourceCode = architecture === 'MIPS_R6' ? 'loop:\nBC loop' : 'loop:\nB loop';
    const result = await validateGame({sourceCode,levelId:'level1',architecture});
    assert.equal(result.summary.pass, false);
    assert.match(result.attempts[0].failureReason, /timeout/i);
    const next = await validateGame({sourceCode:initialCode(architecture),levelId:'level1',architecture});
    assert.equal(next.summary.pass, true);
  });
}
