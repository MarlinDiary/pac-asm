const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(process.env.JUDGE_BUILD_ROOT || path.join(__dirname, '..'));
process.chdir(root);
const { validateGame } = require(root + '/dist/game/game-runner');
const { MAPS } = require(root + '/dist/game/maps');

for (const [architecture, sourceCode] of [['MIPS_R6', 'break 0'], ['ARM', 'bkpt #0']]) {
  test(`${architecture}: grading reports CPU faults rather than timeout and the next submission works`, async () => {
    const result = await validateGame({ sourceCode, architecture, levelId: 'level1' });
    assert.equal(result.summary.pass, false);
    assert.match(result.attempts[0].failureReason, /RUNTIME_ERROR:.*uc_emu_start/);
    assert.doesNotMatch(result.attempts[0].failureReason, /timeout/i);
    const valid = await validateGame({ sourceCode: MAPS.find(m => m.id === 'level1').initialCode[architecture], architecture, levelId: 'level1' });
    assert.equal(valid.summary.pass, true);
  });
}
