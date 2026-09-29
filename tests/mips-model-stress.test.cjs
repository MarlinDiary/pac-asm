const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {loadRuntime,loadSource,sourceRoot}=require('./helpers/emulator-runtime.cjs');
const {generate,source,names,BASE,DATA}=require('./helpers/mips-model.cjs');
const seeds=Number(process.env.MIPS_STRESS_CASES||64),first=Number(process.env.MIPS_STRESS_FIRST||1);
const modes=(process.env.MIPS_STRESS_MODES||'native,run,step,breakpoints,bounded,bare-step').split(',');
// Raw emu_start is checked with a code boundary hook; uninstrumented mode
// checks only public application APIs (the native end-address PC is stale).
const observe=process.env.MIPS_STRESS_OBSERVE!=='0';
const layers=(process.env.MIPS_STRESS_LAYERS||'frontend,backend').split(',');
for(const layer of layers)test(`${layer}: seeded MIPS architectural oracle`,async t=>{
 const {uc,create}=await loadRuntime(layer,'MIPS_R6');
 for(let seed=first;seed<first+seeds;seed++)for(const mode of modes.filter(mode=>(observe||mode!=='native')&&(layer==='frontend'||mode!=='breakpoints')))await t.test(`seed=${seed} mode=${mode}`,()=>{
  const program=generate(seed),expected=program.expected,r=create(program.words,program.registers),handles=[],writes=[],reads=[],commands=[],trace=[];
  r.u.mem_write(DATA,program.memory);let budget=0,guardFailed=false;
  try{
   const end=BASE+program.words.length*4;
   if(observe){
   handles.push(r.u.hook_add(uc.HOOK_MEM_WRITE,(_,type,addr,size,value)=>{let v=Number(value)>>>0;if(size<4)v&=(1<<(size*8))-1;writes.push({pc:r.pc(),address:Number(addr),size,value:v});},undefined,DATA,DATA+127));
   handles.push(r.u.hook_add(uc.HOOK_MEM_READ,(_,type,addr,size)=>reads.push({pc:r.pc(),address:Number(addr),size}),undefined,DATA,DATA+127));
   handles.push(r.u.hook_add(uc.HOOK_CODE,(_,addr)=>{if(Number(addr)===end||++budget>10000){guardFailed=budget>10000;r.u.emu_stop();return;}if(mode==='native')trace.push(Number(addr));},undefined,1,0));
   }
   if(mode==='native')r.u.emu_start(BASE,observe?end+4:end,0,0);
   else {let calls=0;
    while(r.pc()!==end&&calls++<1000){
     let result;
     if(mode==='step')result=r.engine.stepDebugExecution();
     else if(mode==='bounded')result=r.engine.runExecution(1);
     else if(mode==='bare-step'){r.engine.stepExecution();result={};}
     else result=r.engine.runUntilMemoryWrite(DATA,[1,2,3,4],5000000,mode==='breakpoints'?program.words.map((_,i)=>BASE+i*4).filter((_,i)=>i%3===seed%3):[]);
     if(result.memWriteEvent||result.memEvent)commands.push((result.memWriteEvent||result.memEvent).value);
     assert.equal(r.activeHooks.size,handles.length,'temporary hooks released at every pause');
    }assert.ok(calls<1000,'pausing execution must make progress');
   }
   assert.equal(guardFailed,false,'CPU instruction budget');
   for(const name of names)assert.equal(r.mm.getRegister(name).value>>>0,expected.registers[name],name);
   assert.deepEqual(Array.from(r.u.mem_read(DATA,128)),expected.memory,'all data bytes');
   if(observe){assert.deepEqual(writes,expected.writes,'every physical store, in order');assert.deepEqual(reads,expected.reads,'every physical load, in order');}
   assert.equal(r.pc(),end,'completed final command');
   if(mode==='native'&&observe)assert.deepEqual(trace,expected.trace,'instruction trace');
   else if(!['native','bounded','bare-step'].includes(mode))assert.deepEqual(commands,expected.commands,'no command lost across pauses');
  }catch(error){if(process.env.MIPS_STRESS_FAILURE_DIR){fs.mkdirSync(process.env.MIPS_STRESS_FAILURE_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.MIPS_STRESS_FAILURE_DIR,`${layer}-${mode}-${seed}.json`),JSON.stringify({layer,mode,program,source:source(program),actual:{writes,reads,commands,trace,pc:r.pc(),registers:r.mm.getAllRegisters()},error:String(error)},null,2));}throw error;}
  finally{for(const h of handles)r.u.hook_del(h);r.close();}
 });
});
test('oracle encoder agrees with the real R6 GAS assembler',async()=>{
 const {GASAssembler}=loadSource(path.join(sourceRoot,'backend/src/game/assembler.ts'));const a=new GASAssembler({target:'mips-linux-gnu',variant:'mips-r6'});await a.initialize();
 for(const seed of process.env.MIPS_STRESS_ASSEMBLE_ALL==='1'?Array.from({length:seeds},(_,i)=>first+i):[1,2,7,31,64]){const p=generate(seed),compiled=await a.assemble(source(p));const bytes=Buffer.from(compiled.machineCode);assert.deepEqual(p.words,Array.from({length:p.words.length},(_,i)=>bytes.readUInt32BE(i*4)),`seed ${seed}`);}
});
