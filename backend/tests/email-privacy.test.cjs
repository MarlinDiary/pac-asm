// Real Express routes + isolated MongoDB + real judge workers. Only GitHub is
// replaced with deterministic profiles; never connect to a configured database.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(process.env.PRIVACY_PROJECT_ROOT || path.join(__dirname, '../..'));
const backend = path.join(root, 'backend');
const mongoose = require(path.join(backend, 'node_modules/mongoose'));
const { MongoMemoryServer } = require(path.join(backend, 'node_modules/mongodb-memory-server'));
process.chdir(backend);
const User = require(path.join(backend, 'dist/models/user')).default;
const Submission = require(path.join(backend, 'dist/models/submission')).default;
const { MAPS } = require(path.join(backend, 'dist/game/maps'));
const app = require(path.join(backend, 'dist/app')).default;

const aliceEmail = 'alice.private@example.invalid';
const bobEmail = 'bob.private@example.invalid';
const orphanEmail = 'deleted.private@example.invalid';
const profiles = {
  alice: { id: 101, login: 'alice', name: 'Alice', email: aliceEmail },
  bob: { id: 202, login: 'bob', name: 'Bob', email: null },
  noemail: { id: 303, login: 'noemail', name: null, email: null },
};
let mongo, server, base, alice, bob, noemail, replayId, jobPayload;
const nativeFetch = global.fetch;
const githubCalls = [];
const frame = { step: 0, command: 0, score: 0, map: { tiles: [[' ']], playerPosition: { row: 0, col: 0, direction: 'right' }, ghostPositions: [] } };
const replay = { attempt: 1, score: 50, steps: 4, frames: [frame] };

function assertPrivate(value) {
  const body = JSON.stringify(value);
  for (const email of [aliceEmail, bobEmail, orphanEmail]) assert.ok(!body.includes(email), `response leaked ${email}`);
  assert.doesNotMatch(body, /"email"\s*:/);
}

async function request(route, { token, body, method } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await nativeFetch(base + route, { method: method || (body ? 'POST' : 'GET'), headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  const payload = text && res.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : text;
  return { status: res.status, payload };
}

async function waitJob(jobId) {
  for (let i = 0; i < 300; i++) {
    const res = await request(`/game/job/${jobId}`);
    assert.equal(res.status, 200);
    if (res.payload.status === 'done' || res.payload.status === 'failed') return res.payload;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('Local job did not finish within 6 seconds');
}

test.before(async () => {
  const binary = process.env.MONGOMS_SYSTEM_BINARY;
  mongo = await MongoMemoryServer.create({ binary: binary ? { systemBinary: binary } : undefined, instance: { ip: '127.0.0.1' } });
  await mongoose.connect(mongo.getUri('email_privacy_regression'));
  await Promise.all([User.init(), Submission.init()]);
  [alice, bob, noemail] = await User.create([
    { githubId: '101', email: aliceEmail, name: 'Alice' },
    { githubId: '202', email: bobEmail, name: bobEmail },
    { githubId: '303', name: 'noemail' },
  ]);
  const seed = async (userId, userName, score, steps, date) => Submission.create({
    userId, userName, levelId: 'challenge', architecture: 'MIPS_R6', score, steps,
    summary: { pass: true, metrics: { score, steps } }, hasReplay: true, replay,
    createdAt: new Date(date), updatedAt: new Date(date),
  });
  await seed(aliceEmail, 'Alice', 900, 1, '2026-01-01');
  const latestAlice = await seed(aliceEmail, 'Alice', 50, 4, '2026-01-02');
  replayId = latestAlice.id;
  await seed(bobEmail, bobEmail, 60, 9, '2026-01-02');
  await seed('303', 'noemail', 50, 3, '2026-01-02');
  await seed(orphanEmail, orphanEmail, 1, 20, '2026-01-02');
  global.fetch = async (url, options = {}) => {
    if (!String(url).startsWith('https://api.github.com/')) throw new Error('Unexpected external fetch: ' + url);
    const token = String(options.headers?.Authorization || '').replace(/^Bearer /, '');
    githubCalls.push({ url: String(url), token });
    const profile = profiles[token];
    if (!profile) return new Response('{}', { status: 401 });
    if (String(url).endsWith('/user/emails')) {
      return token === 'bob'
        ? Response.json([{ email: bobEmail, primary: true, verified: true }])
        : new Response('{}', { status: 403 });
    }
    return Response.json(profile);
  };
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  global.fetch = nativeFetch;
  if (server) await new Promise(resolve => server.close(resolve));
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test('anonymous user enumeration is unavailable', async () => {
  const res = await request('/users');
  console.log('PUBLIC_USERS', JSON.stringify(res));
  assert.equal(res.status, 404);
  assertPrivate(res.payload);
});

test('anonymous ranking hides legacy email IDs and fallback names without changing latest-per-user ordering', async () => {
  const { status, payload } = await request('/game/ranking?levelId=challenge&architecture=MIPS_R6');
  assert.equal(status, 200);
  console.log('PUBLIC_RANKING', JSON.stringify(payload));
  assert.deepEqual(payload.submissions.map(row => row.score), [60, 50, 50, 1]);
  assert.deepEqual(payload.submissions.map(row => row.steps), [9, 3, 4, 20]);
  assert.equal(payload.submissions.length, 4); // Not five: old high score stays hidden.
  assertPrivate(payload);
  assert.deepEqual(payload.submissions.slice(0, 3).map(row => row.userId), ['github:202', 'github:303', 'github:101']);
  assert.match(payload.submissions[3].userId, /^submission:[a-f0-9]{24}$/);
  assert.equal(payload.submissions[2].userName, 'Alice');
});

test('anonymous replay hides the owner email but preserves every replay frame', async () => {
  const { status, payload } = await request(`/game/submissions/${replayId}/replay`);
  assert.equal(status, 200);
  console.log('PUBLIC_REPLAY', JSON.stringify(payload));
  assert.deepEqual(payload.replay, replay);
  assertPrivate(payload);
  assert.equal(payload.submission.userId, 'github:101');
});

test('user sync and submission still require a verified GitHub token', async () => {
  const callsBefore = githubCalls.length;
  assert.equal((await request('/users', { method: 'POST' })).status, 401);
  const sourceCode = MAPS[0].initialCode.MIPS_R6;
  assert.equal((await request('/game/submit', { body: { sourceCode, levelId: 'level1', architecture: 'MIPS_R6' } })).status, 401);
  assert.equal(githubCalls.length, callsBefore);
  assert.equal((await request('/users', { method: 'POST', token: 'invalid' })).status, 401);
});

test('authenticated own-user sync retains email, stable identity and GitHub email fallback', async () => {
  const first = await request('/users', { method: 'POST', token: 'alice' });
  const second = await request('/users', { method: 'POST', token: 'alice' });
  assert.equal(first.status, 200);
  assert.equal(first.payload.email, aliceEmail); // Own data is intentionally available.
  assert.equal(first.payload.id, alice.id);
  assert.equal(second.payload.id, alice.id);
  assert.equal((await request('/users', { method: 'POST', token: 'bob' })).payload.email, bobEmail);
  const withoutEmail = await request('/users', { method: 'POST', token: 'noemail' });
  assert.equal(withoutEmail.status, 200);
  assert.equal(withoutEmail.payload.id, noemail.id);
  assert.equal(await User.countDocuments(), 3);
});

test('real MIPS submission still judges, persists and replaces only that user in the ranking', async () => {
  const body = { sourceCode: MAPS[0].initialCode.MIPS_R6, levelId: 'level1', architecture: 'MIPS_R6', user: { id: bobEmail, name: 'Spoofed' } };
  const first = await request('/game/submit', { token: 'alice', body });
  assert.equal(first.status, 202);
  assert.deepEqual(Object.keys(first.payload), ['jobId']);
  const firstResult = await waitJob(first.payload.jobId);
  assert.equal(firstResult.status, 'done');
  assert.equal(firstResult.submission.status, 'Accepted');
  const second = await request('/game/submit', { token: 'alice', body });
  jobPayload = await waitJob(second.payload.jobId);
  assert.equal(jobPayload.status, 'done');
  assert.equal(jobPayload.submission.userName, 'Alice');
  assert.equal(jobPayload.submission.cycleCount, firstResult.submission.cycleCount);
  const stored = await Submission.findById(jobPayload.submission.id);
  assert.equal(stored.userId, aliceEmail); // No migration or changed grouping keys.
  const ranked = (await request('/game/ranking?levelId=level1&architecture=MIPS_R6')).payload.submissions;
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].id, jobPayload.submission.id);
  assert.equal(ranked[0].userId, jobPayload.submission.userId);
});

test('anonymous completed job response contains no email', () => {
  assert.ok(jobPayload);
  console.log('PUBLIC_JOB', JSON.stringify(jobPayload));
  assertPrivate(jobPayload);
  assert.equal(jobPayload.submission.userId, 'github:101');
});

test('real ARM submission and an account without email remain supported', async () => {
  const res = await request('/game/submit', { token: 'noemail', body: { sourceCode: MAPS[0].initialCode.ARM, levelId: 'level1', architecture: 'ARM' } });
  assert.equal(res.status, 202);
  const result = await waitJob(res.payload.jobId);
  assert.equal(result.status, 'done');
  assert.equal(result.submission.status, 'Accepted');
  assertPrivate(result);
  assert.equal(result.submission.userId, 'github:303');
});

test('legacy accounts without GitHub IDs keep a stable non-email ID across email and ObjectId storage keys', async () => {
  const user = await User.create({ email: 'legacy.private@example.invalid', name: 'Legacy' });
  const submission = await Submission.create({ userId: user.email, userName: 'Legacy', levelId: 'level2', architecture: 'ARM', status: 'Accepted', summary: { pass: true } });
  for (const key of [user.email, user.id]) {
    await Submission.updateOne({ _id: submission._id }, { userId: key });
    const result = await request('/game/ranking?levelId=level2&architecture=ARM');
    assert.equal(result.status, 200);
    assert.equal(result.payload.submissions.length, 1);
    assert.equal(result.payload.submissions[0].userId, `user:${user.id}`);
    assert.ok(!JSON.stringify(result.payload).includes(user.email));
  }
});
