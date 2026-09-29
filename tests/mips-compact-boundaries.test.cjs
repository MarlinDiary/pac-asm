const test = require('node:test');
const assert = require('node:assert/strict');
const { sourceRoot, loadRuntime, loadSource } = require('./helpers/emulator-runtime.cjs');
const { GASAssembler } = loadSource(sourceRoot + '/backend/src/game/assembler.ts');
const BASE = 0x10000, DATA = 0x30000;
const binary = (name, condition) => ({name, instruction: `${name} $t2,$t3,target`, condition});
const unary = (name, condition) => ({name, instruction: `${name} $t2,target`, condition});
// Predicates use mnemonic semantics, independently of the application's opcode decoder.
const families = [
 binary('beqc',(a,b)=>a===b), binary('bnec',(a,b)=>a!==b),
 binary('bgec',(a,b)=>(a|0)>=(b|0)), binary('bltc',(a,b)=>(a|0)<(b|0)),
 binary('bgeuc',(a,b)=>a>=b), binary('bltuc',(a,b)=>a<b),
 binary('bovc',(a,b)=>((a|0)+(b|0)<-2147483648||(a|0)+(b|0)>2147483647)),
 binary('bnvc',(a,b)=>(a|0)+(b|0)>=-2147483648&&(a|0)+(b|0)<=2147483647),
 ...['','al'].flatMap(link=>[
  unary(`blez${link}c`,a=>(a|0)<=0), unary(`bgtz${link}c`,a=>(a|0)>0),
  unary(`bgez${link}c`,a=>(a|0)>=0), unary(`bltz${link}c`,a=>(a|0)<0),
 ]),
 unary('beqzc',a=>a===0),unary('bnezc',a=>a!==0),
 unary('beqzalc',a=>a===0),unary('bnezalc',a=>a!==0),
 {name:'bc',instruction:'bc target',condition:()=>true},
 {name:'balc',instruction:'balc target',condition:()=>true},
 {name:'jic',instruction:'jic $t8,0',condition:()=>true},
 {name:'jialc',instruction:'jialc $t8,0',condition:()=>true},
];
const operands = [[0,0],[1,2],[2,1],[1,1],[0xffffffff,1],[0x80000000,0x80000000],[0x7fffffff,1],[0,0xffffffff]];
for (const layer of ['frontend','backend']) test(`${layer}: compact branch pause boundaries`,async t=>{
 const assembler = new GASAssembler({target:'mips-linux-gnu',variant:'mips-r6'});await assembler.initialize();
 const {uc,create} = await loadRuntime(layer,'MIPS_R6');
 for(const family of families)for(const nextTarget of [false,true]){
  const source = `.set noreorder\n${family.instruction}\n${nextTarget?'target:':''} sw $s3,0($t1)\naddiu $t5,$t5,1\n${nextTarget?'':'target:'} nop\n`;
  const output=Buffer.from((await assembler.assemble(source)).machineCode);
  const words=Array.from({length:output.length/4},(_,i)=>output.readUInt32BE(i*4));
  for(const [a,b] of operands)for(const mode of layer==='frontend'?['step','breakpoint']:['step'])await t.test(`${family.name} a=${a} b=${b} target=${nextTarget?'next':'forward'} ${mode}`,()=>{
   const taken=family.condition(a,b), target=BASE+(nextTarget?4:12);
   const r=create(words,{t2:a,t3:b,t1:DATA,s3:3,t8:target}),writes=[];
   // An earlier observational hook must not suppress the command hook.
   const observer=r.u.hook_add(uc.HOOK_MEM_WRITE,()=>writes.push(r.pc()),undefined,DATA,DATA+3);
   try{
    const result=mode==='step'?r.engine.stepDebugExecution():r.engine.runUntilMemoryWrite(DATA,[1,2,3,4],5000000,[BASE]);
    assert.equal(r.pc(),taken?target:BASE+8,'completed boundary, no next arithmetic');
    assert.equal(r.mm.getRegister('t5').value,0);
    assert.deepEqual(writes,taken?[]:[BASE+4],'forbidden slot only on fallthrough');
    assert.equal((result.memWriteEvent||result.memEvent)?.value,taken?undefined:3,'command reported exactly once');
    if(mode==='step')assert.deepEqual(result.executedAddresses,taken?[BASE]:[BASE,BASE+4]);
    else {assert.equal(result.stopReason,'breakpoint');assert.equal(result.breakpoint.address,BASE);}
    if(/alc$/.test(family.name))assert.equal(r.mm.getRegister('ra').value,BASE+4,'link semantics');
    assert.equal(r.activeHooks.size,1,'temporary hooks removed');
   }finally{r.u.hook_del(observer);r.close()}
  });
 }
});
for(const layer of ['frontend','backend'])test(`${layer}: compact slot restrictions and latched operands`,async t=>{
 const {create}=await loadRuntime(layer,'MIPS_R6');
 for(const mode of layer==='frontend'?['step','breakpoint']:['step']){
  await t.test(`untaken forbidden branch errors and releases hooks: ${mode}`,()=>{
   const r=create([0x214b0002,0x08004003,0,0,0],{t2:1,t3:2});
   try{assert.throws(()=>mode==='step'?r.engine.stepDebugExecution():r.engine.runUntilMemoryWrite(DATA,[1,2,3,4],5000000,[BASE]),/UC_ERR_EXCEPTION/);assert.equal(r.activeHooks.size,0)}finally{r.close()}
  });
  await t.test(`taken next target may legally be a branch: ${mode}`,()=>{
   const r=create([0x214b0000,0x08004003,0x25ad0001,0,0],{t2:1,t3:1});
   try{if(mode==='step')r.engine.stepDebugExecution();else r.engine.runUntilMemoryWrite(DATA,[1,2,3,4],5000000,[BASE]);assert.equal(r.pc(),BASE+4);r.engine.stepDebugExecution();assert.equal(r.pc(),BASE+12);assert.equal(r.mm.getRegister('t5').value,1)}finally{r.close()}
  });
 }
 await t.test('slot changes the operands after condition was latched',()=>{
  const r=create([0x214b0002,0x256a0000,0x25ad0001,0,0],{t2:1,t3:2});
  try{const result=r.engine.stepDebugExecution();assert.deepEqual(result.executedAddresses,[BASE,BASE+4]);assert.equal(r.pc(),BASE+8);assert.equal(r.mm.getRegister('t2').value,2)}finally{r.close()}
 });
});
