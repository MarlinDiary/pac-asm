const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const ts=require('typescript');
const file=path.join(__dirname,'../src/lib/memory-rows.ts');
const mod=new Module(file,module);mod.paths=module.paths;
mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,file);
const {generateMemoryRows}=mod.exports;
// Independent reference matching the pre-optimization display contract.
function reference(...regions){
 return [[0x10000,0x1000],[0x20000,0x1000],[0x30000,0x2000]].flatMap(([start,size],index)=>Array.from({length:size/4},(_,row)=>{
  const bytes=Array.from({length:4},(_,i)=>regions[index]?.[row*4+i]===undefined?0:regions[index][row*4+i]);
  return {address:`0x${(start+row*4).toString(16).toUpperCase().padStart(8,'0')}`,hex:bytes.map(b=>b.toString(16).toUpperCase().padStart(2,'0')).join(' '),ascii:bytes.map(b=>b>=32&&b<=126?String.fromCharCode(b):'.').join(' ')};
 }));
}
test('zero, absent, partial and sparse snapshots preserve all 4096 rows',()=>{
 for(const arrays of [[],[[],[],[]],[[65],[],[0,32,126,127,255]],[new Array(4096),new Array(4096),new Array(8192)]]) assert.deepEqual(generateMemoryRows(...arrays),reference(...arrays));
});
test('every possible byte, random snapshots and region boundaries match the reference',()=>{
 let state=123456789;const next=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state>>>24};
 for(let i=0;i<50;i++){
  const snapshots=[4096,4096,8192].map((size,r)=>Array.from({length:size},(_,n)=>i===0?n%256:(i%2?next():(next()<250?0:next()))));
  assert.deepEqual(generateMemoryRows(...snapshots),reference(...snapshots));
 }
});
test('formatting is read-only and reused zero rows are frozen',()=>{
 const snapshots=[Object.freeze([65,0,255,126]),Object.freeze([0]),Object.freeze([1])];
 assert.deepEqual(generateMemoryRows(...snapshots),reference(...snapshots));
 const zero=generateMemoryRows(),again=generateMemoryRows();
 assert.equal(zero[50],again[50]);assert(Object.isFrozen(zero[50]));
 assert.equal(zero[0].address,'0x00010000');assert.equal(zero[4095].address,'0x00031FFC');
});
if(process.env.BENCHMARK_MEMORY){
 const snapshots=[Array(4096).fill(0),Array(4096).fill(0),Array(8192).fill(0)];
 snapshots[0].splice(0,16,...Array.from({length:16},(_,i)=>i*13));snapshots[2].splice(0,64,...Array.from({length:64},(_,i)=>i));
 const measure=fn=>{for(let i=0;i<20;i++)fn(...snapshots);const start=performance.now();for(let i=0;i<500;i++)fn(...snapshots);return performance.now()-start};
 console.log(JSON.stringify({iterations:500,referenceMs:measure(reference),optimizedMs:measure(generateMemoryRows)}));
}
