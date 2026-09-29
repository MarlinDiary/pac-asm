const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {sourceRoot,repo,loadRuntime}=require('./helpers/emulator-runtime.cjs');
const values=[[-1,'ffffffff'],[-2147483648,'80000000'],[2147483647,'7fffffff'],[0,'00000000'],[-19861,'ffffb26b']];
for(const layer of ['frontend','backend'])for(const arch of ['MIPS_R6','ARM'])test(`${layer} ${arch}: register hex preserves all 32 bits`,async()=>{
 const {create}=await loadRuntime(layer,arch),r=create([0]),name=arch==='MIPS_R6'?'t0':'r0';
 try{for(const [value,hex]of values){r.mm.setRegister(name,value);for(const register of [r.mm.getRegister(name),r.mm.getAllRegisters().find(r=>r.register===name)]){assert.equal(register.hex,'0x'+hex);assert.equal(register.value,value,'signed numeric value is unchanged');}}}finally{r.close()}
});
const ts=require(repo+'/frontend/node_modules/typescript'),React=require(repo+'/frontend/node_modules/react');
const {renderToStaticMarkup}=require(repo+'/frontend/node_modules/react-dom/server');
function component(){
 const source=fs.readFileSync(sourceRoot+'/frontend/src/components/panel/RegisterPanel.tsx','utf8');
 const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const primitive=tag=>({children,...props})=>React.createElement(tag,props,children);
 const modules={'react/jsx-runtime':require(repo+'/frontend/node_modules/react/jsx-runtime'),'@/components/ui/badge':{Badge:primitive('span')},'@/components/ui/table':{Table:primitive('table'),TableBody:primitive('tbody'),TableRow:primitive('tr'),TableCell:primitive('td')}};
 const exports={};new Function('require','exports',code)(n=>modules[n],exports);return exports.default;
}
for(const architecture of ['MIPS_R6','ARM'])test(`${architecture}: student register panel shows two's-complement hex`,()=>{
 const Panel=component(),register=architecture==='MIPS_R6'?'t0':'r0';
 for(const [value,hex]of values){const html=renderToStaticMarkup(React.createElement(Panel,{architecture,registers:[{register,value}]}));assert.ok(html.includes('>'+hex.toUpperCase()+'<'),`expected ${hex} for ${value}`);assert.ok(html.includes('>'+value+'<'),'decimal display unchanged');}
});
