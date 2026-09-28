const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Execute the production hook with deterministic React/Worker adapters. Browser
// integration tests separately exercise the real hook, editor and Unicorn WASM.
function harness() {
  const listeners = new Map(), effects = [], workers = [];
  let architecture = 'MIPS_R6', state;
  const react = {
    useRef: value => ({ current: value }),
    useState: initial => { state = initial; return [state, value => { state = typeof value === 'function' ? value(state) : value; }]; },
    useCallback: fn => fn,
    useEffect: fn => effects.push(fn),
  };
  const window = {
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: name => listeners.delete(name),
  };
  class Worker {
    constructor() { this.messages = []; this.terminated = false; workers.push(this); }
    postMessage(message) {
      this.messages.push(message);
      queueMicrotask(() => { if (!this.terminated) this.onmessage({ data: { type: 'success', messageId: message.messageId } }); });
    }
    terminate() { this.terminated = true; }
  }
  const errorsFile = path.join(__dirname, '../src/lib/emulator-errors.ts');
  const errors = { exports: {} };
  new Function('exports', 'module', ts.transpileModule(fs.readFileSync(errorsFile, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(errors.exports, errors);
  const file = process.env.TEST_EMULATOR_SOURCE || path.join(__dirname, '../src/hooks/useEmulator.ts');
  const source = fs.readFileSync(file, 'utf8').replaceAll('import.meta.url', JSON.stringify('file://' + file));
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {};
  const resolve = name => {
    if (name === 'react') return react;
    if (name === '@/hooks/useSettings') return { getGlobalSettings: () => ({ settings: { architecture } }) };
    if (name === '@/lib/emulator-errors') return errors.exports;
    throw new Error('Unexpected import: ' + name);
  };
  new Function('require', 'exports', 'Worker', 'window', compiled)(resolve, exports, Worker, window);
  const api = exports.useEmulator();
  const cleanups = effects.map(fn => fn());
  return {
    api, workers, getState: () => state,
    setting(detail) { if (detail.architecture) architecture = detail.architecture; listeners.get('pacasm-settings-changed')({ detail }); },
    close() { api.cleanup(); cleanups.forEach(fn => fn?.()); },
  };
}

test('editor/zoom changes retain the live worker and initialized state', async () => {
  const h = harness();
  try {
    await h.api.initializeEmulator();
    const worker = h.workers[0];
    for (const detail of [{architecture:'MIPS_R6',stickyScroll:true},{architecture:'MIPS_R6',pageZoom:125},{architecture:'MIPS_R6',aiDiagnostics:true}]) h.setting(detail);
    assert.equal(worker.terminated, false);
    assert.equal(h.getState().isInitialized, true);
    await h.api.reset();
    assert.deepEqual(worker.messages.map(m => m.type), ['init','reset']);
  } finally { h.close(); }
});

test('a real architecture change terminates the old worker and initializes the new ISA', async () => {
  const h = harness();
  try {
    await h.api.initializeEmulator();
    h.setting({architecture:'ARM'});
    assert.equal(h.workers[0].terminated, true);
    assert.equal(h.getState().isInitialized, false);
    await h.api.initializeEmulator();
    assert.equal(h.workers[1].messages[0].payload.arch, 'ARM');
    h.setting({architecture:'ARM',pageZoom:100});
    assert.equal(h.workers[1].terminated, false);
    h.setting({architecture:'MIPS_R6'});
    assert.equal(h.workers[1].terminated, true);
  } finally { h.close(); }
});

test('settings before initialization create no worker; cleanup still terminates it', async () => {
  const h = harness();
  try {
    h.setting({architecture:'ARM',stickyScroll:true});
    assert.equal(h.workers.length, 0);
    await h.api.initializeEmulator();
    assert.equal(h.workers[0].messages[0].payload.arch, 'ARM');
    h.api.cleanup();
    assert.equal(h.workers[0].terminated, true);
    assert.equal(h.getState().isInitialized, false);
  } finally { h.close(); }
});
