const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const file = process.env.TEST_EDITOR_SOURCE || path.join(__dirname,'../src/components/CodeEditor.tsx');
const source = fs.readFileSync(file,'utf8');
function component() {
  const element = (type,props)=>({type,props});
  const modules = {
    'react': {useRef:value=>({current:value}),useEffect:()=>{},useState:value=>[value,()=>{}]},
    'react/jsx-runtime': {jsx:element,jsxs:element},
    '@monaco-editor/react': {Editor:'Editor'},
    'next-themes': {useTheme:()=>({theme:'light',systemTheme:'light'})},
    '@/hooks/useSettings': {useSettings:()=>({settings:{architecture:'MIPS_R6',fontSize:14,stickyScroll:false,codeCompletion:true}})},
  };
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;
  const exports={};new Function('require','exports',compiled)(name=>{assert(name in modules);return modules[name]},exports);
  return exports.default;
}
test('editor state changes reuse the static stylesheet rather than replacing innerHTML',()=>{
  const Editor=component();
  const renders=[Editor({value:'ORI $t0, $zero, 4'}),Editor({disabled:true,highlightedLine:1}),Editor({disabled:false})];
  const styles=renders.map(r=>r.props.children.find(c=>c.type==='style'));
  assert.equal(styles[0].props.dangerouslySetInnerHTML,styles[1].props.dangerouslySetInnerHTML);
  assert.equal(styles[0].props.dangerouslySetInnerHTML,styles[2].props.dangerouslySetInnerHTML);
});
test('all original editor CSS rules remain byte-identical',()=>{
  const css=source.match(/__html: `([\s\S]*?)`/)[1];
  assert.equal(crypto.createHash('sha256').update(css).digest('hex'),'07e31328b3f5b560a9b34f1115cc6e6336bfc15eeaa56ed8f5609084b6e1c535');
});
