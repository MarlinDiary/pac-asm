const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.resolve(process.env.PRIVACY_PROJECT_ROOT || path.join(__dirname, '../..'));
const ts = require(path.join(root, 'frontend/node_modules/typescript'));
const read = file => fs.readFileSync(path.join(root, 'frontend/src', file), 'utf8');
const transpile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
const email = 'alice.private@example.invalid';

function authConfig(fetch) {
  let config;
  const fakeRequire = name => {
    if (name === 'next-auth') return value => { config = value; return { handlers: {} }; };
    if (name === '@auth/core/providers/github') return options => ({ id: 'github', ...options });
    if (name === 'node:buffer') return require(name);
    throw new Error('Unexpected auth dependency: ' + name);
  };
  new Function('require', 'exports', 'fetch', transpile(read('server/auth.ts')))(fakeRequire, {}, fetch);
  return config;
}

test('GitHub login uses providerAccountId, not Auth.js random user sub; own email and bearer token survive', async () => {
  const config = authConfig(() => { throw new Error('New sign-in must not need an extra lookup'); });
  const token = await config.callbacks.jwt({ token: { sub: 'authjs-random-uuid', email }, account: { provider: 'github', providerAccountId: '101', access_token: 'fixture-token' } });
  const session = await config.callbacks.session({ session: { user: { name: 'Alice', email } }, token });
  assert.equal(session.user.email, email);
  assert.equal(session.accessToken, 'fixture-token');
  assert.equal(session.publicUserId, 'github:101');
  console.log('LOGIN_IDENTITY', JSON.stringify(session));
});

test('existing JWT sessions acquire the public ID once without forcing another login', async () => {
  const calls = [];
  const config = authConfig(async (url, options) => {
    calls.push({ url, options });
    return Response.json({ id: 101 });
  });
  let token = { sub: 'existing-authjs-uuid', email, accessToken: 'existing-token' };
  token = await config.callbacks.jwt({ token });
  token = await config.callbacks.jwt({ token });
  const session = await config.callbacks.session({ session: { user: { email } }, token });
  assert.equal(session.publicUserId, 'github:101');
  assert.equal(session.accessToken, 'existing-token');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.github.com/user');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer existing-token');
  assert.ok(calls[0].options.signal instanceof AbortSignal);
});

test('old-session lookup failures do not destroy the session or expose an email as public identity', async () => {
  for (const response of [() => { throw new Error('offline'); }, () => new Response('{}', { status: 401 }), () => Response.json({ id: email })]) {
    const config = authConfig(response);
    const token = await config.callbacks.jwt({ token: { sub: email, accessToken: 'existing-token' } });
    const session = await config.callbacks.session({ session: { user: { email } }, token });
    assert.equal(session.user.email, email);
    assert.equal(session.accessToken, 'existing-token');
    assert.equal(session.publicUserId, undefined);
  }
});

test('sign-in still syncs only the verified account using the bearer token', async () => {
  const calls = [];
  const config = authConfig(async (...args) => { calls.push(args); return Response.json({}); });
  await config.events.signIn({ user: { email }, account: { access_token: 'fixture-token' } });
  assert.equal(calls.length, 1);
  assert.ok(calls[0][0].endsWith('/users'));
  assert.equal(calls[0][1].method, 'POST');
  assert.equal(calls[0][1].headers.Authorization, 'Bearer fixture-token');
  assert.equal(calls[0][1].body, '{}');
});

// Evaluate the actual hook callbacks rather than a duplicate implementation.
const hookSource = read('hooks/useExecutionControl.ts');
const hookAst = ts.createSourceFile('hook.ts', hookSource, ts.ScriptTarget.Latest, true);
function callback(name, context) {
  let expression;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(hookAst) === name) expression = node.initializer.arguments[0].getText(hookAst);
    ts.forEachChild(node, visit);
  }
  visit(hookAst);
  assert.ok(expression, name);
  const exports = {};
  new Function(...Object.keys(context), 'exports', transpile('export const callback = ' + expression))(...Object.values(context), exports);
  return exports.callback;
}

test('pending-submit storage keys survive the upgrade, but rank matching uses the public identifier', () => {
  const session = { user: { email, name: 'Alice' }, publicUserId: 'github:101' };
  const userInfo = callback('userInfo', { session })();
  const key = callback('pendingSubmissionStorageKey', { userInfo, levelId: 'level1', architecture: 'MIPS_R6' })();
  assert.equal(key, `pacasm-pending-submit-${encodeURIComponent(email)}-level1-MIPS_R6`);
  let cleared = 0;
  const started = new Date().toISOString();
  const resolve = callback('resolvePendingSubmissionFromEntries', {
    userInfo, pendingSubmissionStartedAtRef: { current: started },
    clearPendingSubmission: () => { cleared++; }, SUBMISSION_PENDING_TTL_MS: 7200000,
  });
  resolve([{ userId: 'github:202', updatedAt: started }]);
  assert.equal(cleared, 0);
  resolve([{ userId: 'github:101', updatedAt: new Date(Date.now() - 10000).toISOString() }]);
  assert.equal(cleared, 0);
  resolve([{ userId: 'github:101', updatedAt: started }]);
  assert.equal(cleared, 1);
  console.log('PENDING_SUBMIT', JSON.stringify({ keyPreserved: true, resolvedOwnPublicId: true }));
});

test('privacy changes do not alter historical pending-submit expiry handling', () => {
  let cleared = 0;
  callback('resolvePendingSubmissionFromEntries', {
    userInfo: { id: email, publicId: 'github:101' },
    pendingSubmissionStartedAtRef: { current: '2020-01-01T00:00:00.000Z' },
    clearPendingSubmission: () => { cleared++; }, SUBMISSION_PENDING_TTL_MS: 7200000,
  })([]);
  assert.equal(cleared, 1);
});

test('real Auth.js session endpoint protects own email and enriches both new and pre-upgrade encrypted JWT cookies', async () => {
  const load = file => import(pathToFileURL(path.join(root, 'frontend/node_modules/@auth/core', file)).href);
  const { Auth } = await load('index.js');
  const { encode } = await load('jwt.js');
  const { default: GitHub } = await load('providers/github.js');
  const config = authConfig(async () => Response.json({ id: 101 }));
  config.secret = 'isolated-test-secret-not-used-by-any-real-account';
  config.basePath = '/api/auth';
  config.providers = [GitHub({ clientId: 'fixture-client', clientSecret: 'fixture-secret' })];
  const anonymous = await Auth(new Request('http://localhost:3000/api/auth/session'), config);
  assert.equal(anonymous.status, 200);
  assert.equal(await anonymous.json(), null);
  for (const extra of [{ publicUserId: 'github:101' }, {}]) {
    const cookie = await encode({ secret: config.secret, salt: 'authjs.session-token', token: {
      sub: 'authjs-random-uuid', name: 'Alice', email, accessToken: 'fixture-token', ...extra,
    } });
    const response = await Auth(new Request('http://localhost:3000/api/auth/session', { headers: { Cookie: `authjs.session-token=${cookie}` } }), config);
    assert.equal(response.status, 200);
    const session = await response.json();
    assert.equal(session.user.email, email);
    assert.equal(session.accessToken, 'fixture-token');
    assert.equal(session.publicUserId, 'github:101');
  }
  console.log('AUTH_SESSION_HTTP', 'anonymous=null; authenticated=own-email+bearer+public-id; old-cookie=upgraded');
});
