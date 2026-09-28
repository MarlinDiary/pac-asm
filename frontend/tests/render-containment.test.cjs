const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = process.env.TEST_SOURCE_ROOT || path.join(__dirname, '..');
const element=(type,props,key)=>({type,props,key});
function load(file,extra='') {
  const source=fs.readFileSync(path.join(root,file),'utf8')+extra;
  const mocks={
    'react':{memo:f=>f,useState:v=>[v,()=>{}],useMemo:f=>f(),useEffect:()=>{}},
    'react/jsx-runtime':{jsx:element,jsxs:element,Fragment:'fragment'},
    './bar/TabBar':{default:'TabBar',Tab:'Tab'},
    'next/image':{default:'Image'},
    'next-themes':{useTheme:()=>({theme:'light',resolvedTheme:'light'})},
    '@/components/MemoryFilter':{default:'MemoryFilter'},
    '@/lib/memory-rows':{},
    '@/components/ui/table':{Table:'table',TableBody:'tbody',TableRow:'tr',TableCell:'td'}
  };
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;
  const exports={};new Function('require','exports',js)(n=>{assert(n in mocks,n);return mocks[n]},exports);return exports;
}
test('inactive Card panes stay mounted but skip rendering',()=>{
  const Card=load('src/components/Card.tsx').default,children=[{name:'game'},{name:'memory'}];
  for(const selectedTab of [0,1]){
    const panes=Card({selectedTab,tabContent:children}).props.children[1].props.children;
    assert.equal(panes.length,2);
    panes.forEach((p,i)=>{assert.equal(p.props.children,children[i]);assert.equal(p.props.style.contentVisibility,i===selectedTab?'visible':'hidden');assert.equal(p.props['aria-hidden'],i===selectedTab?undefined:true)});
  }
});
test('memory groups retain every row, order, stripes and correct partial-group height',()=>{
  const {MemoryRows}=load('src/components/panel/MemoryPanel.tsx','\nexport { MemoryRows };');
  for(const length of [0,1,63,64,65,127,256,1024,4096]){
    const rows=Array.from({length},(_,i)=>({address:String(i),hex:'01 02 03 04',ascii:'a b c d'}));
    const groups=MemoryRows({rows}).props.children;
    assert.equal(groups.length,Math.ceil(length/64));
    const actual=[];
    for(const group of groups){
      assert.equal(group.type,'tbody');assert.equal(group.props.role,'rowgroup');assert.equal(group.props.style.contentVisibility,'auto');
      assert.equal(group.props.style.height,`${group.props.children.length*3}rem`);
      assert.equal(group.key,`${actual.length/64}-${group.props.children.length}`);
      for(const row of group.props.children){
        assert.equal(row.props.striped,actual.length%2!==0);
        const rendered=row.type(row.props);assert.equal(rendered.props.role,'row');
        assert(rendered.props.className.includes('table w-full'));
        assert.deepEqual(rendered.props.children.map(c=>c.props.children),[rows[actual.length].address,'01 02 03 04','a b c d']);
        actual.push(row.props.address);
      }
    }
    assert.deepEqual(actual,rows.map(r=>r.address));
  }
});
