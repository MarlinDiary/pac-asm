const test = require('node:test');
const assert = require('node:assert/strict');
const {sourceRoot, loadSource, loadRuntime} = require('./helpers/emulator-runtime.cjs');
const {createHighlighter}=loadSource(sourceRoot+'/frontend/src/lib/highlighter.ts');
const opts={target:'mips-linux-gnu',variant:'mips-r6'};

test('coincident DWARF rows retain every source breakpoint after compiler serialization',async()=>{
 const source='.file 1 "in.s"\n.loc 1 4\n.loc 1 6\nori $t0,$zero,1\n\nori $t1,$zero,2\n';
 const a=createHighlighter(opts);await a.initialize(source);
 const b=createHighlighter(opts);b.loadManualMappings(source,JSON.parse(JSON.stringify(a.getAllMappings())));
 for(const h of [a,b]){assert.deepEqual(h.getAddressesForLine(4),[0x10000]);assert.deepEqual(h.getAddressesForLine(6),[0x10000]);assert.deepEqual(h.getHighlightLine(0x10000).lineNumbers,[4,6]);}
});
test('three source aliases survive serialization and repeated rows are deduplicated',()=>{
 const h=createHighlighter(opts),source='a\nb\nc\nd\ne\n';
 h.loadManualMappings(source,[1,3,5,3].map(lineNumber=>({address:0x10000,lineNumber})));
 assert.deepEqual(h.getHighlightLine(0x10000).lineNumbers,[1,3,5]);assert.equal(h.getAllMappings().length,3);
});
test('unknown instruction addresses clear stale highlights instead of blaming an earlier source line',()=>{
 const h=createHighlighter(opts);h.loadManualMappings('nop\n',[{address:0x10000,lineNumber:1}]);
 assert.deepEqual(h.getHighlightLine(0x10000).lineNumbers,[1]);assert.equal(h.getHighlightLine(0x10004),null);
});
test('reinitializing mappings never retains lines from the previous program',async()=>{
 const h=createHighlighter(opts);await h.initialize('nop\nnop\nnop\nnop\nnop\n');await h.initialize('nop\n');
 assert.deepEqual(h.getAddressesForLine(5),[]);
});
test('multiple instructions of one source line highlight that line once',()=>{
 const h=createHighlighter(opts);h.loadManualMappings('li $t0,0x12345678\n',[{address:0x10000,lineNumber:1},{address:0x10004,lineNumber:1}]);
 assert.deepEqual(h.getHighlightForAddresses([0x10000,0x10004]).lineNumbers,[1]);assert.deepEqual(h.getAddressesForLine(1),[0x10000,0x10004]);
});
for(const layer of ['frontend','backend'])test(`${layer}: every public execution entry preserves delayed branches`,async t=>{
 const {uc,C,create}=await loadRuntime(layer,'MIPS_R6');
 for(const method of ['stepExecution','runExecution'])await t.test(method,()=>{
  const r=create([0x08004004,0x25080001,0x34090063,0,0x340a0007,0]);
  try {if(method==='stepExecution')r.engine.stepExecution();else r.engine.runExecution(1);assert.equal(r.pc(),C.CODE_BASE+16);assert.equal(r.mm.getRegister('t0').value,1);assert.equal(r.mm.getRegister('t1').value,0);assert.equal(r.activeHooks.size,0);}finally{r.close();}
 });

});
for(const layer of ['frontend','backend'])test(`${layer}: bounded RUN does not mistake a productive self-branch for a stalled CPU`,async()=>{
 const {create}=await loadRuntime(layer,'MIPS_R6');const r=create([0x1108ffff,0x25080001,0]);
 try{const result=r.engine.runExecution(3);assert.equal(r.mm.getRegister('t0').value,3);assert.equal(result.executedInstructions,3);}finally{r.close();}
});
const fs=require('node:fs'),path=require('node:path');
const ts=require(path.join(__dirname,'../frontend/node_modules/typescript'));
for(const [name,props,expected] of [
 ['nonadjacent',{highlightedLine:2,highlightedLineSecondary:5},[2,5]],
 ['three aliases',{highlightedLines:[2,5,8],highlightedLine:2,highlightedLineSecondary:5},[2,5,8]],
 ['deduplicate',{highlightedLines:[2,2,5],highlightedLine:2,highlightedLineSecondary:2},[2,5]],
])test(`editor decorations are exact source rows: ${name}`,async()=>{
 const effects=[],refs=[],exports={},decorations=[];
 const modules={react:{useRef:v=>{const r={current:v};refs.push(r);return r;},useEffect:f=>effects.push(f),useState:v=>[v,()=>{}]},'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},'@monaco-editor/react':{Editor:'Editor'},'next-themes':{useTheme:()=>({theme:'light'})},'@/hooks/useSettings':{useSettings:()=>({settings:{architecture:'MIPS_R6'}})},'monaco-editor':{Range:class {constructor(startLineNumber,startColumn,endLineNumber,endColumn){Object.assign(this,{startLineNumber,startColumn,endLineNumber,endColumn});}}}};
 const source=fs.readFileSync(path.join(sourceRoot,'frontend/src/components/CodeEditor.tsx'),'utf8');const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('require','exports',code)(n=>modules[n],exports);exports.default(props);
 refs[0].current={deltaDecorations:(_,ds)=>{decorations.push(...ds);return[];},revealLineInCenter(){},getModel:()=>({getLineCount:()=>20})};refs[3].current=modules['monaco-editor'];
 const effect=effects.find(f=>f.toString().includes('highlighted-line-full'));assert.ok(effect);effect();await Promise.resolve();await Promise.resolve();
 assert.deepEqual(decorations.map(d=>[d.range.startLineNumber,d.range.endLineNumber]),expected.map(n=>[n,n]));
});
