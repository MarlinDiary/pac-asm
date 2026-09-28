const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const file = path.join(__dirname, '../src/components/home/promo-playback.ts');
const mod = new Module(file, module);
mod.paths = module.paths;
mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, file);
const { createPromoPlayback } = mod.exports;
const settle = () => new Promise(resolve => setImmediate(resolve));
const error = name => Object.assign(new Error(name), { name });

function fixture({ reduced = false, visible = true, results = [] } = {}) {
  const state = { reduced, visible, errors: 0, attempts: [], pauses: 0 };
  const video = {
    muted: false, paused: true,
    play() {
      state.attempts.push({ muted: this.muted });
      const result = results.shift();
      if (result instanceof Error) return Promise.reject(result);
      if (result) return result;
      this.paused = false;
      return Promise.resolve();
    },
    pause() { state.pauses++; this.paused = true; },
  };
  const control = createPromoPlayback(video, {
    isVisible: () => state.visible,
    prefersReducedMotion: () => state.reduced,
    onError: () => state.errors++,
  });
  return { state, video, control };
}

test('homepage uses the selected split composition and preserves the level 1 entry', () => {
  const source = fs.readFileSync(process.env.HOMEPAGE_SOURCE || path.join(__dirname, '../src/app/page.tsx'), 'utf8');
  assert.match(source, /A little code\./);
  assert.match(source, /href="\/level\/1"/);
  assert.match(source, /<PromoVideo/);
  assert.doesNotMatch(source, /LetterGlitch|demo-dark\.png|useRouter/);
});

test('the homepage player preserves 16:9, inline playback and accessible native fallback', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/components/home/PromoVideo.tsx'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../src/components/home/promo-video.module.css'), 'utf8');
  assert.match(css, /aspect-ratio: 16 \/ 9/);
  assert.match(css, /object-fit: contain/);
  assert.match(source, /playsInline/);
  assert.match(source, /controls=\{!enhanced\}/);
  assert.match(source, /aria-label=\{playing \? "Pause film" : "Play film"\}/);
  assert.match(source, /media="\(min-width: 1200px\)"/);
  assert.doesNotMatch(source, /autoPlay|requestAnimationFrame|setInterval|localStorage/);
});

test('tries audible autoplay first when it is permitted', async () => {
  const { control, state, video } = fixture(); control.start(); await settle();
  assert.deepEqual(state.attempts, [{ muted: false }]);
  assert.equal(video.paused, false); assert.equal(state.errors, 0);
});

test('autoplay policy rejection falls back once to muted playback', async () => {
  const { control, state, video } = fixture({ results: [error('NotAllowedError')] });
  control.start(); await settle();
  assert.deepEqual(state.attempts, [{ muted: false }, { muted: true }]);
  assert.equal(video.paused, false); assert.equal(state.errors, 0);
  control.toggleSound(); assert.equal(video.muted, false);
});

test('blocked muted autoplay stays paused and can be started by the user', async () => {
  const { control, state, video } = fixture({ results: [error('NotAllowedError'), error('NotAllowedError')] });
  control.start(); await settle();
  assert.equal(state.attempts.length, 2); assert.equal(video.paused, true); assert.equal(state.errors, 0);
  control.play(); await settle(); assert.equal(video.paused, false);
});

test('reduced motion starts on the poster, but explicit play still works', async () => {
  const { control, state, video } = fixture({ reduced: true });
  control.start(); await settle(); assert.equal(state.attempts.length, 0);
  control.play(); await settle(); assert.equal(video.paused, false);
});

test('hidden tabs pause and visible tabs resume only when playback was wanted', async () => {
  const { control, state, video } = fixture(); control.start(); await settle();
  state.visible = false; control.syncEnvironment(); assert.equal(video.paused, true);
  state.visible = true; control.syncEnvironment(); await settle(); assert.equal(video.paused, false);
  control.pause(); state.visible = false; control.syncEnvironment();
  state.visible = true; control.syncEnvironment(); await settle();
  assert.equal(video.paused, true); assert.equal(state.attempts.length, 2);
});

test('a page initially opened in the background defers all playback', async () => {
  const { control, state } = fixture({ visible: false }); control.start(); await settle();
  assert.equal(state.attempts.length, 0);
  state.visible = true; control.syncEnvironment(); await settle();
  assert.deepEqual(state.attempts, [{ muted: false }]);
});

test('enabling reduced motion stops playback and does not surprise-resume', async () => {
  const { control, state, video } = fixture(); control.start(); await settle();
  state.reduced = true; control.syncEnvironment(); assert.equal(video.paused, true);
  state.reduced = false; control.syncEnvironment(); await settle(); assert.equal(video.paused, true);
});

for (const action of ['pause', 'dispose']) {
  test(`${action} invalidates a pending autoplay rejection without a restart`, async () => {
    let reject;
    const pending = new Promise((_, r) => { reject = r; });
    const { control, state } = fixture({ results: [pending] });
    control.start(); control[action](); reject(error('NotAllowedError')); await settle();
    assert.deepEqual(state.attempts, [{ muted: false }]); assert.equal(state.errors, 0);
  });
}

test('sound toggles preserve an explicit pause', async () => {
  const { control, state, video } = fixture(); control.start(); await settle(); control.pause();
  control.toggleSound(); assert.equal(video.muted, true); control.toggleSound();
  assert.equal(video.muted, false); assert.equal(video.paused, true); assert.equal(state.attempts.length, 1);
});

test('a newer sound choice wins over a stale pending autoplay fallback', async () => {
  let reject;
  const pending = new Promise((_, r) => { reject = r; });
  const { control, state, video } = fixture({ results: [pending] });
  control.start(); control.toggleSound(); control.toggleSound();
  reject(error('NotAllowedError')); await settle();
  assert.equal(video.muted, false); assert.equal(state.attempts.length, 2); assert.equal(state.errors, 0);
});

test('media failures report one error, while interrupted requests are quiet', async () => {
  for (const [name, count] of [['NotSupportedError', 1], ['AbortError', 0]]) {
    const { control, state } = fixture({ results: [error(name)] });
    control.start(); await settle(); assert.equal(state.errors, count); assert.equal(state.attempts.length, 1);
  }
});

test('homepage refinements use system typography and an integrated logo without redundant labels', () => {
  const page = fs.readFileSync(path.join(__dirname, '../src/app/page.tsx'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../src/app/home.module.css'), 'utf8');
  const video = fs.readFileSync(path.join(__dirname, '../src/components/home/PromoVideo.tsx'), 'utf8');
  assert.match(css, /font-family:\s*-apple-system/);
  assert.doesNotMatch(css, /--font-inter|--font-geist-mono|text-transform:\s*uppercase/);
  assert.match(page, /<span[^>]*>PA<\/span>/);
  assert.match(page, /<span[^>]*>ASM<\/span>/);
  assert.match(page, /<p>© PACASM<\/p>/);
  assert.doesNotMatch(page, /Assembly, made playable|styles\.tagline/);
  assert.doesNotMatch(css, /\.tagline/);
  assert.match(css, /\.header\s*\{[^}]*grid-template-columns:\s*1fr auto;/s);
  assert.match(page, /pacasm-mark\.png" alt="" width=\{40\} height=\{40\}/);
  assert.match(css, /\.brandIcon\s*\{[^}]*width:\s*1\.1em;[^}]*height:\s*1\.1em;/s);
  assert.doesNotMatch(page, /Ellipsis|No setup|brandDots/);
  assert.doesNotMatch(video, /<figcaption/);
});

test('video controls reveal on hover, keyboard focus and touch without a frame inset', () => {
  const css = fs.readFileSync(path.join(__dirname, '../src/components/home/promo-video.module.css'), 'utf8');
  assert.match(css, /border:\s*0/);
  assert.match(css, /\.frame:hover \.controls/);
  assert.match(css, /\.frame:focus-within \.controls/);
  assert.match(css, /\(hover: none\)/);
  assert.match(css, /opacity:\s*0/);
});

test('the main content uses balanced vertical centering rather than fixed top offsets', () => {
  const css = fs.readFileSync(path.join(__dirname, '../src/app/home.module.css'), 'utf8');
  assert.match(css, /align-content:\s*center/);
  assert.match(css, /\.introduction\s*\{\s*padding:\s*0/);
  assert.doesNotMatch(css, /padding-top:\s*74px|padding-block:\s*64px 104px/);
});
