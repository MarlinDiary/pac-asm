const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const repo = path.resolve(__dirname, '../..');
const sourceRoot = path.resolve(process.env.EMULATOR_SOURCE_ROOT || repo);
const ts = require(path.join(repo, 'frontend/node_modules/typescript'));
const cache = new Map();

// Run the real checked-in TypeScript without a bundler or emulator mocks.
function loadSource(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const module = new Module(file);
  module.filename = file;
  module.paths = Module._nodeModulePaths(path.dirname(file));
  cache.set(file, module);
  const nativeRequire = module.require.bind(module);
  module.require = name => {
    if (name.startsWith('@/')) return loadSource(path.join(sourceRoot, 'frontend/src', name.slice(2) + '.ts'));
    const local = path.resolve(path.dirname(file), name) + '.ts';
    if (name.startsWith('.') && fs.existsSync(local)) return loadSource(local);
    return nativeRequire(name);
  };
  module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, file);
  return module.exports;
}

async function loadRuntime(layer, arch) {
  const dir = path.join(sourceRoot, layer === 'frontend' ? 'frontend/src/workers/emulator' : 'backend/src/game/emulator');
  // Only the VM/WASM loader is shared; each layer uses its own shipped assets.
  const { UnicornLoader } = loadSource(path.join(repo, 'backend/src/game/emulator/unicorn-loader.ts'));
  const loader = new UnicornLoader({ postMessage() {}, location: { origin: '' } }, {
    baseDir: path.join(sourceRoot, layer === 'frontend' ? 'frontend/public/arm' : 'backend/vendor/unicorn'),
  });
  loader.setArchitecture(arch);
  await loader.loadUnicornScript();
  const uc = loader.getUnicorn();
  const { ExecutionEngine } = loadSource(path.join(dir, 'execution.ts'));
  const { MemoryManager } = loadSource(path.join(dir, 'memory-manager.ts'));
  const { LiteralPoolDetector } = loadSource(path.join(dir, 'literal-pool.ts'));
  const { MEMORY_CONFIG: C } = loadSource(path.join(sourceRoot, layer === 'frontend' ? 'frontend/src/lib/memory-layout.ts' : 'backend/src/game/memory-layout.ts'));
  const config = { codeAddress: C.CODE_BASE, codeSize: C.CODE_SIZE, stackAddress: C.STACK_BASE,
    stackSize: C.STACK_SIZE, dataAddress: C.DATA_BASE, dataSize: C.DATA_SIZE };
  function create(words, registers = {}) {
    const u = new uc.Unicorn(arch === 'MIPS_R6' ? uc.ARCH_MIPS : uc.ARCH_ARM,
      arch === 'MIPS_R6' ? uc.MODE_MIPS32 | uc.MODE_BIG_ENDIAN : uc.MODE_ARM);
    const mm = new MemoryManager(u, uc, config, arch);
    const bytes = words.flatMap(value => {
      const w = typeof value === 'string' ? parseInt(value, 16) : value;
      return arch === 'MIPS_R6' ? [w >>> 24, (w >>> 16) & 255, (w >>> 8) & 255, w & 255]
        : [w & 255, (w >>> 8) & 255, (w >>> 16) & 255, w >>> 24];
    });
    mm.initializeMemory(); mm.initializeRegisters(); mm.loadCode(bytes);
    for (const [r, v] of Object.entries(registers)) mm.setRegister(r, v);
    const engine = new ExecutionEngine(u, uc, config, new LiteralPoolDetector(config), mm, arch);
    const activeHooks = new Set(); let codeHooks = 0;
    const add = u.hook_add, del = u.hook_del;
    u.hook_add = function(type, ...args) {
      const handle = add.call(this, type, ...args);
      activeHooks.add(handle); if (type === uc.HOOK_CODE) codeHooks++;
      return handle;
    };
    u.hook_del = function(handle) { const result = del.call(this, handle); activeHooks.delete(handle); return result; };
    return { u, mm, engine, bytes, activeHooks, codeHookCount: () => codeHooks,
      pc: () => mm.getRegister('pc').value >>> 0, close: () => u.close() };
  }
  return { uc, C, create };
}
module.exports = { repo, sourceRoot, loadSource, loadRuntime };
