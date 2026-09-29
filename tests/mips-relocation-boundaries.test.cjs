const test = require('node:test');
const assert = require('node:assert/strict');
const {sourceRoot,loadSource,loadRuntime} = require('./helpers/emulator-runtime.cjs');
const opts={target:'mips-linux-gnu',variant:'mips-r6'};
const moduleFor=layer=>loadSource(sourceRoot+(layer==='frontend'?'/frontend/src/lib/assembler.ts':'/backend/src/game/assembler.ts'));
const words=code=>Array.from({length:code.length/4},(_,i)=>Buffer.from(code).readUInt32BE(i*4));
const branches=['beq $t0,$t1,','beqc $t0,$t1,','beqzc $t0,','bc '];

// Transform a real GAS ELF's .rel.text into equivalent RELA records. Keep its
// symbol table and instruction opcodes; poison implicit fields to prove that
// explicit addends, not residual instruction/data bits, drive RELA relocation.
function relaObject(input, customize = () => {}) {
 const b=Buffer.from(input),shoff=b.readUInt32BE(32),stride=b.readUInt16BE(46),count=b.readUInt16BE(48);let extension=[];
 const masks={10:0xffff,60:0x1fffff,61:0x3ffffff};
 for(let i=0;i<count;i++){
  const h=shoff+i*stride;if(b.readUInt32BE(h+4)!==9)continue;
  const target=shoff+b.readUInt32BE(h+28)*stride;
  // Only the allocated/executable .text, not debug-info relocation sections.
  if((b.readUInt32BE(target+8)&4)===0)continue;
  const textOff=b.readUInt32BE(target+16),offset=b.readUInt32BE(h+16),size=b.readUInt32BE(h+20),entries=[];
  for(let at=offset;at<offset+size;at+=8){
   const rOffset=b.readUInt32BE(at),info=b.readUInt32BE(at+4),type=info&255,word=b.readUInt32BE(textOff+rOffset);
   const symSection=shoff+b.readUInt32BE(h+24)*stride;
   const symbolAt=b.readUInt32BE(symSection+16)+(info>>>8)*b.readUInt32BE(symSection+36);
   const symbolValue=b.readUInt32BE(symbolAt+4);
   let addend;
   if(type===2)addend=word|0;
   else {assert.ok(type in masks,'fixture only needs PC branches and absolute words');const bits=type===10?16:type===60?21:26;addend=((word<<(32-bits))>>(32-bits))*4;}
   const record={rOffset,info,addend,symbolValue};customize(record,type);
   const e=Buffer.alloc(12);e.writeUInt32BE(record.rOffset,0);e.writeUInt32BE(record.info>>>0,4);e.writeInt32BE(record.addend|0,8);entries.push(e);
   b.writeUInt32BE(type===2?0xfeedcafe:((word&~masks[type])|5)>>>0,textOff+rOffset);
  }
  const data=Buffer.concat(entries);b.writeUInt32BE(4,h+4);b.writeUInt32BE(b.length+extension.reduce((n,x)=>n+x.length,0),h+16);b.writeUInt32BE(data.length,h+20);b.writeUInt32BE(12,h+36);extension.push(data);
 }
 return Uint8Array.from(Buffer.concat([b,...extension]));
}
function replaceOutput(a,object){const original=a.gasInstance;a.gasInstance=async args=>original({...args,postRun:[m=>{m.FS.writeFile('out.o',object);for(const callback of args.postRun)callback(m)}]});return()=>{a.gasInstance=original};}

for(const layer of ['frontend','backend']){
 test(`${layer}: expression branches match explicit labels across placement, binding and load base`,async t=>{
  const {GASAssembler}=moduleFor(layer);
  for(const baseAddress of [0x10000,0x24000,0x10000000]){
   const a=new GASAssembler({...opts,baseAddress});await a.initialize();
   for(const branch of branches)for(const back of [false,true])for(const global of [false,true])for(const delta of [-12,-4,0,4,12])await t.test(`${branch} base=${baseAddress} back=${back} global=${global} delta=${delta}`,async()=>{
    const body=Array.from({length:7},(_,i)=>`${i===3?'target: ':''}${i===3+delta/4?'dest: ':''}nop`).join('\n');
    const program=operand=>`${global?'.globl target\n':''}.set noreorder\n${back?body+'\n':''}${branch}${operand}\nnop\n${back?'':body+'\n'}`;
    const expression=await a.assemble(program(`target${delta>=0?'+':''}${delta}`)),reference=await a.assemble(program('dest'));
    assert.deepEqual(expression.machineCode,reference.machineCode);
    const p=back?28:0,target=(back?0:8)+12+delta;
    const encoded=Buffer.from(expression.machineCode).readUInt32BE(p),bits=branch.startsWith('bc ')?26:branch.startsWith('beqzc')?21:16;
    assert.equal(((encoded<<(32-bits))>>(32-bits))*4,target-(p+4));
   });
  }
 });
 test(`${layer}: absolute text pointers preserve symbol offsets, constants and load bases`,async t=>{
  const {GASAssembler}=moduleFor(layer);
  for(const baseAddress of [0x10000,0x24000,0x10000000])for(const global of [false,true])await t.test(`base=${baseAddress} global=${global}`,async()=>{
   const a=new GASAssembler({...opts,baseAddress});await a.initialize();const source=`${global?'.globl target\n':''}.word target,target+4,target-4,0,0xffffffff,target-target\ntarget: nop\n`;
   const result=await a.assemble(source);assert.deepEqual(words(result.machineCode).slice(0,6),[baseAddress+24,baseAddress+28,baseAddress+20,0,0xffffffff,0]);
  });
 });
 test(`${layer}: a relocated jump table executes in run, debug and breakpoint modes`,async t=>{
  const {GASAssembler}=moduleFor(layer),a=new GASAssembler(opts);await a.initialize();const result=await a.assemble('.set noreorder\nla $t0,table\nlw $t8,0($t0)\njr $t8\nnop\ntable: .word target\ntarget: ori $s3,$zero,2\nsw $s3,0($t1)\nnop\n');const {create}=await loadRuntime(layer,'MIPS_R6');
  for(const mode of layer==='frontend'?['run','debug','breakpoint']:['run','debug'])await t.test(mode,()=>{
   const r=create(words(result.machineCode),{t1:0x30000});try{
    let event;
    if(mode==='breakpoint'){const stop=r.engine.runUntilMemoryWrite(0x30000,[1,2,3,4],5000000,[0x1000c]);assert.equal(stop.pc,0x10018);assert.equal(stop.stopReason,'breakpoint');}
    if(mode==='debug'){for(let i=0;i<8&&!event;i++)event=r.engine.stepDebugExecution().memWriteEvent;}
    else event=r.engine.runUntilMemoryWrite(0x30000,[1,2,3,4]).memEvent;
    assert.equal(event?.value,2);assert.equal(r.mm.getRegister('t8').value,0x10018);assert.equal(r.activeHooks.size,0);
   }finally{r.close()}
  });
 });
 test(`${layer}: RELA uses explicit addends, unknown relocations fail, NONE is a no-op`,async()=>{
  const {GASAssembler}=moduleFor(layer),a=new GASAssembler(opts);await a.initialize();
  const source='.set noreorder\nbeq $t0,$t1,target+4\nnop\nbeqzc $t0,target-4\nnop\nbc target+8\nnop\ntarget: nop\n.word target+4\nnop\nnop\n';const reference=await a.assemble(source);
  let restore=replaceOutput(a,relaObject(reference.objectFile));try{assert.deepEqual((await a.assemble(source)).machineCode,reference.machineCode)}finally{restore()}
  restore=replaceOutput(a,relaObject(reference.objectFile,(r,type)=>{if(type===2)r.info=(r.info&0xffffff00)|127}));try{await assert.rejects(()=>a.assemble(source),/LINK_ERROR:.*Unsupported relocation type 127/);await assert.rejects(()=>a.getLineMappingInfo(source),/No object file/)}finally{restore()}
  restore=replaceOutput(a,relaObject(reference.objectFile,(r,type)=>{if(type===2)r.info=0}));try{const r=await a.assemble(source);assert.equal(Buffer.from(r.machineCode).readUInt32BE(28),0xfeedcafe)}finally{restore()}
  assert.deepEqual((await a.assemble(source)).machineCode,reference.machineCode,'failure does not poison the next compile');
 });
 test(`${layer}: PC relocation range and alignment errors propagate`,async t=>{
  const {GASAssembler}=moduleFor(layer),a=new GASAssembler(opts);await a.initialize();
  for(const [branch,bits]of [['beq $t0,$t1,',16],['beqzc $t0,',21],['bc ',26]]){
   const source=`.set noreorder\n${branch}target\nnop\ntarget: nop\n`,reference=await a.assemble(source);
   for(const delta of [-(2**(bits-1))*4,(2**(bits-1)-1)*4,-(2**(bits-1)+1)*4,2**(bits-1)*4,1])await t.test(`${branch} delta=${delta}`,async()=>{
    const restore=replaceOutput(a,relaObject(reference.objectFile,r=>{r.addend=delta-r.symbolValue+r.rOffset}));
    try{if(delta%4)await assert.rejects(()=>a.assemble(source),/LINK_ERROR:.*misaligned/);else if(delta/4<-(2**(bits-1))||delta/4>=2**(bits-1))await assert.rejects(()=>a.assemble(source),/LINK_ERROR:.*out of range/);else{const r=await a.assemble(source),w=Buffer.from(r.machineCode).readUInt32BE(0);assert.equal(((w<<(32-bits))>>(32-bits))*4,delta)}}finally{restore()}
   });
  }
 });
 test(`${layer}: empty sources remain empty; unsupported sections, GPREL and undefined symbols are explicit errors`,async()=>{
  const {GASAssembler}=moduleFor(layer),a=new GASAssembler(opts);await a.initialize();
  for(const source of ['', '# comment\n', '.text\n'])assert.equal((await a.assemble(source)).size,0);
  for(const source of ['.data\nvalue: .word 3\n.text\nla $t0,value\n','.set noreorder\nori $t0,$zero,1\nlw $t1,%gp_rel(target)($gp)\ntarget:nop\n','bc missing_label\n']){
   await assert.rejects(()=>a.assemble(source),/LINK_ERROR:/);await assert.rejects(()=>a.getLineMappingInfo(source),/No object file/);
   assert.equal((await a.assemble('ori $t0,$zero,7\n')).size,16);
  }
 });
}
