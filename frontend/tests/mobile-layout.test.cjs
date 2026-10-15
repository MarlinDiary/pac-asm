const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const ts=require('typescript');
const root=process.env.TEST_SOURCE_ROOT||path.join(__dirname,'..');const read=f=>fs.readFileSync(path.join(root,f),'utf8');
function load(file,react={}){const out={};const js=ts.transpileModule(read(file),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;new Function('require','exports',js)(n=>n==='react'?react:n==='react/jsx-runtime'?{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})}:(()=>{throw Error(n)})(),out);return out}
test('mobile labels follow the five existing levels, without inventing a sixth',()=>{const m=load('src/hooks/useMobileViewport.ts');assert.deepEqual(['1','2','3','4','challenge','level1'].map(m.mobileLevelLabel),['I','II','III','IV','V','I']);assert.equal(m.MOBILE_QUERY,'(max-width: 900px)')});
test('mobile viewport follows keyboard height, respects pinch zoom and removes listeners',()=>{let state=[],cursor=0,effects=[],listeners=new Map();const subscribe=(k,f)=>listeners.set(k,f);const query={matches:true,addEventListener:(k,f)=>subscribe('media',f),removeEventListener:()=>listeners.delete('media')};const viewport={height:812,scale:1,addEventListener:(k,f)=>subscribe('viewport',f),removeEventListener:()=>listeners.delete('viewport')};global.window={matchMedia:()=>query,visualViewport:viewport};try{const m=load('src/hooks/useMobileViewport.ts',{useState:v=>{const i=cursor++;if(!(i in state))state[i]=v;return[state[i],v=>state[i]=v]},useEffect:f=>effects.push(f)});m.useMobileViewport();const cleanup=effects[0]();assert.deepEqual(state,[true,812]);viewport.height=420;listeners.get('viewport')();assert.deepEqual(state,[true,420]);viewport.scale=2;listeners.get('viewport')();assert.deepEqual(state,[true,undefined]);query.matches=false;listeners.get('media')();assert.deepEqual(state,[false,undefined]);cleanup();assert.equal(listeners.size,0)}finally{delete global.window}});
test('mobile game fits width and height without changing board geometry or upscaling',()=>{const {fitGameScale}=load('src/components/GameViewport.tsx');for(const [w,h,mw,mh] of [[304,420,320,192],[359,600,640,640],[414,300,960,960],[720,480,320,192]]){const s=fitGameScale(w,h,mw,mh);assert(s<=1&&s>0);assert(mw*s<=w-24+.01);assert(mh*s<=h-24+.01)}});
test('one mounted CodeEditor, RankingPanel and emulator across all mobile tabs',()=>{const s=read('src/components/GamePage.tsx');for(const re of [/<CodeEditor\b/g,/<RankingPanel\b/g,/useEmulator\(\)/g])assert.equal([...s.matchAll(re)].length,1);assert.match(s,/aria-label="Mobile workspace"/);assert.match(s,/data-mobile-active=\{mobilePane === 'code'\}/);assert.match(s,/inert=\{isMobile && mobilePane !== 'code'\}/);assert.match(s,/setMobilePane\('game'\)\s+gameState.setLeftPanelTab\(3\)/);assert.match(s,/if \(isMobile\) setMobilePane\('tools'\)/);assert(!s.includes('pac-mobile-diagnostics'))});
test('responsive rules are mobile-scoped; keep zoom, resize and desktop columns untouched',()=>{const css=read('src/app/globals.css');const marker=css.indexOf('/* One mounted workspace');assert(marker>0);const added=css.slice(marker);assert.match(added,/@media \(max-width: 900px\)/);const before=added.slice(0,added.indexOf('@media'));assert(!before.includes('zoom:'));assert.match(added,/zoom: 1 !important/);assert.match(added,/100dvh/);assert.match(added,/safe-area-inset-bottom/);assert.match(added,/\.pac-workspace > \[data-mobile-active="true"\]/);assert.match(added,/grid-template-columns: (?:20|24)px minmax\(0, 1fr\) auto/);assert(!added.includes('user-scalable'));assert(!added.includes('touch-action: none'))});
test('icon-only controls remain named and code respects the configured font size',()=>{for(const label of ['Debug','Run'])assert(read('src/components/bar/ExecutionBar.tsx').includes('aria-label="'+label+'"'));for(const label of ['Stop debugging','Step forward','Step back','Restart debugging'])assert(read('src/components/bar/DebuggerBar.tsx').includes('aria-label="'+label+'"'));assert.match(read('src/components/CodeEditor.tsx'),/fontSize: settings.fontSize/);assert.match(read('src/components/GamePage.tsx'),/label="Log in"/)});
test('ranking retains all fields, authentication, submit gate and replay action',()=>{const s=read('src/components/panel/RankingPanel.tsx');for(const field of ['rank','name','status','cycles','score','steps','time','replay'])assert(s.includes('data-rank-field="'+field+'"'));assert.match(s,/onClick=\{isAuthenticated \? handleSubmit : onLogin\}/);assert.match(s,/if \(controller.isSubmitting\) return/);assert.match(s,/aria-label="Watch playback"/);assert.match(s,/Authorization: `Bearer \$\{user.accessToken\}`/)});
test('mobile replay fills the viewport with a fitted board; desktop renderer retained', () => {
  const s = read('src/components/SubmissionReplayModal.tsx');
  assert.match(s, /aria-label="Close replay" onClick=\{onClose\}/);
  assert.match(s, /aria-hidden=\{!isOpen\}/); assert.match(s, /inert=\{!isOpen\}/);
  assert.match(s, /\{mobile \? \(\s+<GameViewport mobile/);
  assert.equal([...s.matchAll(/<MapRenderer map=\{currentMap\}/g)].length, 2);
  assert.match(read('src/components/GamePage.tsx'), /<SubmissionReplayModal\s+mobile=\{isMobile\}/);
  const css = read('src/app/globals.css').split('@media (max-width: 900px)')[1];
  assert.match(css, /\.pac-replay \{ top: 0; left: 0; width: 100%;[^}]*height: var\(--pac-viewport-height, 100dvh\)/);
});

test('mobile workspace tabs belong to the content card and retain desktop tab styling and pointer cursor', () => {
  const source = read('src/components/GamePage.tsx'), css = read('src/app/globals.css');
  assert(source.indexOf('<div className="pac-workspace-wrap') < source.indexOf('<nav className="pac-mobile-nav'));
  assert.equal([...source.matchAll(/<Card className="pac-mobile-hide-tabs"/g)].length, 3);
  assert(!source.includes('pac-help-heading'));
  assert.match(css, /\.pac-mobile-nav > button \{[^}]*cursor: pointer/);
  assert.match(css, /\.dark \.pac-mobile-nav \{ background: #333/);
  assert.match(css, /\.pac-workspace \.pac-mobile-hide-tabs \{ border-radius: 0/);
});
test('More keeps both filter-style transitions mounted and colors the selected tool, with checked menu items', () => {
  const source = read('src/components/MobileMoreMenu.tsx'), page = read('src/components/GamePage.tsx');
  assert.match(page, /<MobileMoreMenu mobile=\{isMobile\}/);
  assert.match(source, /aria-label="More" title="More"/);
  assert.match(source, /<Ellipsis size=\{20\}/);
  assert(!source.includes('if (!isOpen) return null')); assert(!source.includes('<Select'));
  assert.match(page, /value=\{mobilePane === 'tools' \? \['Register', 'Memory', 'Diagnostics'\]/);
  for (const name of ['Manual','Hint','Register','Memory','Diagnostics']) assert(source.includes("name: '"+name+"'"));
  assert.match(source, /role="menuitemradio" aria-checked=\{value === name\}/);
  assert.match(source, /aria-hidden=\{!isOpen\} inert=\{!isOpen\}/);
  assert.match(source, /transition-all duration-200 origin-top-right/);
  const filter=read('src/components/MemoryFilter.tsx');
  for(const classes of ['opacity-100 scale-100 translate-y-0 pointer-events-auto','opacity-0 scale-95 -translate-y-1 pointer-events-none']) {assert(source.includes(classes));assert(filter.includes(classes))}
  for(const color of ['#50AE40','#A2470F','#FFAB70','#9164EA','#01A2C2','#DF0D25','#FF6B6B']) assert(source.includes(color));
  assert.match(source, /style=\{colors\(selected\)\}/);
  assert.match(read('src/app/globals.css'), /\.pac-more-menu \{[^}]*max-height: calc\(100% - 48px\)/);
});
test('mobile ranking is a single line with status beside the name and time hidden, preserving challenge metrics and replay', () => {
  const source = read('src/components/panel/RankingPanel.tsx'), css = read('src/app/globals.css').split('@media (max-width: 900px)')[1];
  assert.match(source, /data-challenge=\{isChallenge\}/);
  assert.match(source, /\{entry.userName\}\s*<\/span>\s*<span className="pac-mobile-only pac-ranking-name-status">/);
  assert.match(source, /<Check aria-label="Accepted"/); assert.match(source, /<X aria-label=\{entry.status\}/);
  assert.match(css, /\.pac-ranking-row \{[^}]*height: 48px/);
  assert.match(css, /\[data-rank-field="status"\], \.pac-ranking-row \[data-rank-field="time"\] \{ display: none/);
  assert.match(css, /grid-template-columns: 20px minmax\(0, 1fr\) auto auto 44px/);
  assert.match(css, /\[data-rank-field="replay"\] button \{ min-width: 44px; min-height: 44px/);
});
test('mobile Settings has a full-screen root -> category -> back flow and keeps guarded editor actions', () => {
  const source = read('src/components/SettingsPanel.tsx');
  const states = []; let cursor = 0; const updates = [];
  const react = {useState:v=>{const i=cursor++;if(!(i in states))states[i]=v;return[states[i],v=>states[i]=v]}, useEffect:()=>{}, useRef:()=>({current:null})};
  react.default=react;
  const jsx = (type,props)=>({type,props}); const out={};
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;
  new Function('require','exports',js)(name => name==='react'?react : name==='react/jsx-runtime'?{jsx,jsxs:jsx} : name==='lucide-react'?new Proxy({}, {get:(_,name)=>name}) : name==='next-themes'?{useTheme:()=>({theme:'dark',setTheme:()=>{}})} : name==='@/hooks/useSettings'?{useSettings:()=>({settings:{architecture:'ARM',pageZoom:100},updateSetting:(...args)=>updates.push(args)})} : new Proxy({}, {get:(_,name)=>name}),out);
  const render=props=>{cursor=0;return out.default({mobile:true,isOpen:true,onClose:()=>{},onResetCode:()=>{},...props})};
  const nodes = tree => {const result=[];const visit=x=>{if(!x||typeof x!=='object')return;if(Array.isArray(x)){x.forEach(visit);return}result.push(x);visit(x.props?.children)};visit(tree);return result};
  let tree=nodes(render({}));
  assert(!tree.find(x=>x.props?.role==='dialog').props.className.includes('-translate-x-1/2'));
  assert(tree.some(x=>x.props?.id==='pac-settings-title' && x.props.children==='Settings'));
  const editor=tree.find(x=>x.type==='button' && nodes(x).some(y=>y.type==='span' && y.props.children==='Editor'));
  editor.props.onClick(); tree=nodes(render({}));
  assert(tree.some(x=>x.props?.id==='pac-settings-title' && x.props.children==='Editor'));
  const select=tree.find(x=>x.type==='Select' && x.props.value==='ARM'); assert(select);
  select.props.onValueChange('MIPS_R6'); assert.deepEqual(updates,[['architecture','MIPS_R6']]);
  tree=nodes(render({isRunning:true}));tree.find(x=>x.type==='Select' && x.props.value==='ARM').props.onValueChange('MIPS_R6');assert.equal(updates.length,1);
  assert(tree.find(x=>x.type==='button' && nodes(x).some(y=>y.type==='span' && y.props.children==='Reset')).props.disabled);
  tree.find(x=>x.props?.['aria-label']==='Back to settings').props.onClick();tree=nodes(render({}));
  assert(tree.some(x=>x.props?.id==='pac-settings-title' && x.props.children==='Settings'));
  assert(!tree.some(x=>x.type==='Select' && x.props.value==='ARM'));
  assert.match(source, /setMobileSection\(null\).*\[isOpen, mobile\]/);
  assert.match(source, /event.key === 'Escape' && !event.defaultPrevented/);
  assert.match(read('src/components/GamePage.tsx'), /inert=\{isMobile && \(isSettingsOpen \|\| selectedReplayEntry !== null\)\}/);
  const css=read('src/app/globals.css').split('@media (max-width: 900px)')[1];
  assert.match(css, /\.pac-settings \{ top: 0; left: 0;[^}]*width: 100%;[^}]*height: var\(--pac-viewport-height, 100dvh\)/);
  assert.match(css, /\.pac-settings \[data-mobile-visible="false"\] \{ display: none/);
});

test('Settings effects are top-level hooks, never invoked inside another effect', () => {
  const ast = ts.createSourceFile('SettingsPanel.tsx', read('src/components/SettingsPanel.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let count=0;
  const visit=node=>{if(ts.isCallExpression(node) && (node.expression.getText(ast)==='useEffect' || node.expression.getText(ast)==='React.useEffect')) {
    count++; let parent=node.parent; while(parent && !ts.isFunctionDeclaration(parent) && !ts.isArrowFunction(parent) && !ts.isFunctionExpression(parent)) parent=parent.parent;
    assert(parent && ts.isFunctionDeclaration(parent) && parent.name?.text==='SettingsPanel','effect hook must be directly in SettingsPanel');
  } ts.forEachChild(node,visit)};visit(ast);assert(count>=4);
  assert.match(read('src/components/MobileMoreMenu.tsx'), /if \(!mobile\) setIsOpen\(false\)/);
});

test('mobile controls separate compact 36px visual surfaces from 44px hit boxes', () => {
  const css=read('src/app/globals.css').split('@media (max-width: 900px)')[1];
  const rule=selector=>css.slice(css.indexOf(selector+' {')).split('}')[0];
  for(const selector of ['.pac-execution-bar button','.pac-mobile-nav > button','.pac-ranking-footer > button']) {
    assert.match(rule(selector),/height: 44px/);assert.match(rule(selector),/border(?:-block)?: 4px solid transparent/);assert.match(rule(selector),/background-clip: padding-box/);
  }
  assert.match(rule('.pac-mobile-nav'), /padding: 0 4px/);
  assert.match(rule('.pac-ranking-footer'), /min-height: 52px/);
  assert.match(rule('.pac-execution-bar button svg'), /width: 16px; height: 16px/);
  assert.match(rule('.pac-settings-header'), /min-height: 48px/);
});


test('mobile debugger stays in the first header row, hiding the whole level navigation and secondary controls only while debugging', () => {
  const css=read('src/app/globals.css').split('@media (max-width: 900px)')[1];
  assert.match(css, /\.pac-header\[data-debug="true"\] \.pac-execution \{ grid-row: 1; grid-column: 2; width: 177px; height: 44px/);
  assert.match(css, /\.pac-header\[data-debug="true"\] \.pac-level-nav, \.pac-header\[data-debug="true"\] \.pac-header-actions \{ display: none/);
  assert(!css.includes('grid-row: 2'));
  const source=read('src/components/GamePage.tsx');
  for(const handler of ['handleStopClick','handleStepDown','handleStepUp','handleReplay']) assert(source.includes(handler));
});
test('hover colors never reset the inset background clip; score and steps share numeric and unit sizes', () => {
  const css=read('src/app/globals.css').split('@media (max-width: 900px)')[1];
  assert.match(css, /\.pac-mobile-nav > button \{[^}]*border: 4px solid transparent; background-clip: padding-box/);
  assert.match(css, /\.pac-mobile-nav > button:hover \{ background-color: #f0f0f0/);
  assert.match(css, /\.dark \.pac-mobile-nav > button:hover \{ background-color: #434343/);
  assert.match(css, /\[data-rank-field="score"\], \.pac-ranking-row \[data-rank-field="cycles"\], \.pac-ranking-row \[data-rank-field="steps"\] \{[^}]*font-size: 13px;[^}]*font-weight: 500/);
  for(const f of ['score','steps']) assert.match(css, new RegExp('\\[data-rank-field="'+f+'"\\]::after \\{[^}]*font-size: 10px; font-weight: 400'));
});
test('full-screen replay keeps background inert, traps keyboard focus and restores the trigger', () => {
  const source=read('src/components/SubmissionReplayModal.tsx');
  assert.match(source, /mobile \? 'top-0 left-0' : 'top-1\/2 left-1\/2 -translate-x-1\/2 -translate-y-1\/2'/);
  assert.match(source, /aria-modal=\{mobile && isOpen \? true : undefined\}/);
  assert.match(source, /if \(!isOpen \|\| !mobile\) return/);
  assert.match(source, /event.key !== 'Tab'/);assert.match(source,/previous\?\.focus\(\)/);
  assert.match(source, /event.key === 'Escape' && !event.defaultPrevented/);
});
test('More supports selection, focus return, Escape, Arrow and desktop-close without remounting the menu', () => {
  const source=read('src/components/MobileMoreMenu.tsx');
  let states=[],refs=[],cursor=0,refCursor=0,effects=[],selected=[],focused=0;
  const buttons=Array.from({length:5},(_,i)=>({focus:()=>focused=i}));
  const react={useState:v=>{const i=cursor++;if(!(i in states))states[i]=v;return[states[i],v=>states[i]=typeof v==='function'?v(states[i]):v]},useRef:()=>refs[refCursor++]??(refs[refCursor-1]={current:null}),useId:()=> 'test-menu',useEffect:f=>effects.push(f)};
  const jsx=(type,props)=>({type,props}), out={};
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;
  new Function('require','exports',js)(n=>n==='react'?react:n==='react/jsx-runtime'?{jsx,jsxs:jsx}:new Proxy({},{get:(_,name)=>name}),out);
  const render=(mobile=true)=>{cursor=0;refCursor=0;effects=[];return out.default({mobile,value:'Hint',onSelect:n=>selected.push(n)})};
  let tree=render(), [trigger,menu]=tree.props.children;
  assert.equal(menu.props.inert,true);assert.equal(trigger.props.style['--pac-tool-color'],'#A2470F');
  trigger.props.onClick();tree=render();[trigger,menu]=tree.props.children;assert.equal(menu.props.inert,false);
  refs[1].current={focus:()=>focused=99};refs[2].current={querySelectorAll:()=>buttons};
  global.document={activeElement:buttons[0]};
  try {
    const event=key=>({key,preventDefault(){},stopPropagation(){}});
    menu.props.onKeyDown(event('ArrowDown'));assert.equal(focused,1);
    menu.props.onKeyDown(event('End'));assert.equal(focused,4);
    menu.props.children[2].props.onClick();assert.deepEqual(selected,['Register']);assert.equal(states[0],false);assert.equal(focused,99);
    trigger.props.onClick();tree=render();menu=tree.props.children[1];menu.props.onKeyDown(event('Escape'));assert.equal(states[0],false);
    tree=render();tree.props.children[0].props.onClick();render(false);effects[0]();assert.equal(states[0],false);
  } finally {delete global.document}
});


test('mobile More check and icon share the option theme variables without a fixed check color', () => {
  const source=read('src/components/MobileMoreMenu.tsx');
  assert.match(source, /tabIndex=\{isOpen \? 0 : -1\} style=\{colors\(\{ name, icon: Icon, \.\.\.color \}\)\}/);
  assert.match(source, /<Icon className="pac-tool-icon" size=\{16\}/);
  assert.match(source, /<Check className="pac-tool-icon absolute right-2"/);
  assert(!source.includes('text-[#01A2C3]'));
  const css=read('src/app/globals.css');
  const mobile=css.slice(css.indexOf('@media (max-width: 900px)'));
  assert.match(mobile, /\.pac-tool-icon \{ color: var\(--pac-tool-color\)/);
  assert.match(mobile, /\.dark \.pac-tool-icon \{ color: var\(--pac-tool-dark-color\)/);
});

test('new errors directly open mobile Diagnostics, without a duplicate code footer; desktop and empty state stay unchanged', () => {
  const source = read('src/components/GamePage.tsx');
  const effect = source.match(/\/\/ Switch to Diagnostics tab when new error appears\s+useEffect\(\(\) => \{([\s\S]+?)\n  \}, \[errors.length, setRightPanelTab, isMobile\]\)/);
  assert(effect);
  const execute = (mobile, count) => {
    const state = {pane: 'code', rightTab: 0};
    new Function('errors', 'isMobile', 'setMobilePane', 'setRightPanelTab', effect[1])(
      Array(count).fill({error: 'NOT_AN_ARM_INSTRUCTION'}), mobile,
      pane => state.pane = pane, tab => state.rightTab = tab);
    return state;
  };
  for (const count of [1, 2]) assert.deepEqual(execute(true, count), {pane: 'tools', rightTab: 2});
  assert.deepEqual(execute(false, 1), {pane: 'code', rightTab: 2});
  assert.deepEqual(execute(true, 0), {pane: 'code', rightTab: 0});
  assert(!source.includes('pac-mobile-diagnostics'));
  assert(source.includes('<DiagnosticsPanel />'));
});

test('mobile Submit and workspace tabs have symmetric circular corners with the same hit and painted heights', () => {
  const css = read('src/app/globals.css').split('@media (max-width: 900px)')[1];
  for (const selector of ['.pac-mobile-nav > button', '.pac-ranking-footer > button']) {
    const rule = css.slice(css.indexOf(selector + ' {')).split('}')[0];
    assert.match(rule, /height: 44px/);
    assert.match(rule, /border: 4px solid transparent/);
    assert.match(rule, /border-radius: 10px/);
    assert.match(rule, /background-clip: padding-box/);
    assert(!rule.includes('border-block:'));
  }
});

function renderEditorForMobileTest(mobile, codeCompletion = true, fontSize = 14) {
  const refs = [], effects = [], out = {}, jsx = (type, props) => ({type, props});
  const react = {useRef:v=>{const r={current:v};refs.push(r);return r},useState:()=>[true,()=>{}],useEffect:f=>effects.push(f)};
  const js = ts.transpileModule(read('src/components/CodeEditor.tsx'), {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;
  new Function('require','exports',js)(n=>n==='react'?react:n==='react/jsx-runtime'?{jsx,jsxs:jsx}:n==='@monaco-editor/react'?{Editor:'Editor'}:n==='next-themes'?{useTheme:()=>({theme:'dark',systemTheme:'dark'})}:n==='@/hooks/useSettings'?{useSettings:()=>({settings:{codeCompletion,fontSize,architecture:'ARM',stickyScroll:false}})}:(()=>{throw Error(n)})(),out);
  const options=out.default({mobile}).props.children.find(n=>n.type==='Editor').props.options;
  return {options,refs,effects};
}
test('phone editor follows configured font and disables completion without changing desktop preference', () => {
  for (const font of [12,14,18,24]) for (const enabled of [true,false]) {
    const phone=renderEditorForMobileTest(true,enabled,font).options,desktop=renderEditorForMobileTest(false,enabled,font).options;
    assert.equal(phone.fontSize,font); assert.equal(desktop.fontSize,font);
    assert.equal(phone.quickSuggestions,false);assert.equal(phone.suggestOnTriggerCharacters,false);assert.equal(phone.acceptSuggestionOnCommitCharacter,false);assert.equal(phone.wordBasedSuggestions,'off');assert.equal(phone.suggest.showWords,false);
    assert.deepEqual(desktop.quickSuggestions,enabled?{other:true,comments:false,strings:false}:false);
    assert.equal(desktop.wordBasedSuggestions,enabled?'allDocuments':'off');assert.equal(desktop.suggest.showWords,enabled);
  }
});
test('phone editor closes existing suggestions and blocks explicit completion shortcuts, disposing on desktop return', () => {
  for (const mobile of [true,false]) {
    const r=renderEditorForMobileTest(mobile),calls=[];let disposed=0,action;
    r.refs[0].current={trigger:(...args)=>calls.push(args),addAction:a=>{action=a;return{dispose:()=>disposed++}}};
    r.refs[3].current={KeyMod:{CtrlCmd:2048,WinCtrl:256},KeyCode:{Space:10}};
    const effect=r.effects.find(e=>e.toString().includes('pacasm.mobile.disable-completion'));assert(effect);
    const cleanup=effect();
    if(mobile){assert.deepEqual(calls,[['mobile','hideSuggestWidget',undefined]]);assert.deepEqual(action.keybindings,[2058,266]);action.run();cleanup();assert.equal(disposed,1)}
    else{assert.equal(cleanup,undefined);assert.equal(calls.length,0);assert.equal(action,undefined)}
  }
});
test('phone Settings removes backdrop and panel shadow throughout transitions but keeps desktop modal classes', () => {
  const source=read('src/components/SettingsPanel.tsx'),css=read('src/app/globals.css'),mobile=css.split('@media (max-width: 900px)')[1];
  assert.match(source,/pac-settings-backdrop fixed inset-0 bg-\[#0f0f0f\]\/60 z-40 transition-opacity/);
  assert(source.includes('shadow-[0_0_20px_rgba(0,0,0,0.2)]'));
  assert.match(mobile,/\.pac-settings-backdrop \{ display: none/);
  assert.match(mobile,/\.pac-settings \{[^}]*box-shadow: none; transition-property: opacity/);
  assert(!css.split('@media (max-width: 900px)')[0].includes('.pac-settings-backdrop'));
  assert.match(source,/className="pac-desktop-only flex items-center justify-between h-8">\s*<label[^>]*>\s*Code Completion/);
});
test('phone Challenge hides check and cross only, retaining ordinary level statuses and score, steps, replay', () => {
  const css=read('src/app/globals.css').split('@media (max-width: 900px)')[1];
  assert.match(css,/\.pac-ranking\[data-challenge="true"\] \.pac-ranking-name-status \{ display: none/);
  assert.match(css,/\.pac-ranking-name-status \{ display: inline-flex/);
  const ranking=read('src/components/panel/RankingPanel.tsx');
  for(const f of ['score','steps','replay'])assert(ranking.includes('data-rank-field="'+f+'"'));
  assert(ranking.includes('<Check aria-label="Accepted"'));assert(ranking.includes('<X aria-label={entry.status}'));
});
