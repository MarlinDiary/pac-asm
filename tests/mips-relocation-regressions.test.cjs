const test=require('node:test'),assert=require('node:assert/strict');
const {sourceRoot,loadSource,loadRuntime}=require('./helpers/emulator-runtime.cjs');
const options={target:'mips-linux-gnu',variant:'mips-r6'},BASE=0x10000;
const layers=['frontend','backend'];
for(const layer of layers){
 let a,runtime;
 async function ready(){if(!a){const {GASAssembler}=loadSource(sourceRoot+(layer==='frontend'?'/frontend/src/lib/assembler.ts':'/backend/src/game/assembler.ts'));a=new GASAssembler(options);await a.initialize();runtime=await loadRuntime(layer,'MIPS_R6');}}
 for(const branch of ['beq $t0,$t1,','beqc $t0,$t1,','beqzc $t0,','bc '])for(const delta of [0,4,-4])test(`${layer}: ${branch} target${delta>=0?'+':''}${delta} preserves address expression`,async()=>{
  await ready();const source=`.set noreorder\n${branch}target${delta>=0?'+':''}${delta}\nnop\nnop\ntarget: ori $s0,$zero,7\nori $s1,$zero,9\nnop\n`;
  const code=Buffer.from((await a.assemble(source)).machineCode),words=Array.from({length:code.length/4},(_,i)=>code.readUInt32BE(i*4));
  const r=runtime.create(words);try{r.engine.stepDebugExecution();assert.equal(r.pc(),BASE+12+delta,source)}finally{r.close()}
 });
 test(`${layer}: movement run honors the same branch offset`,async()=>{
  await ready();const source='.set noreorder\nbc target+4\nnop\nnop\ntarget: ori $s3,$zero,1\nori $s3,$s3,2\nsw $s3,0($t1)\nnop\n';
  const code=Buffer.from((await a.assemble(source)).machineCode),r=runtime.create(Array.from({length:code.length/4},(_,i)=>code.readUInt32BE(i*4)),{t1:0x30000});
  try{assert.equal(r.engine.runUntilMemoryWrite(0x30000,[1,2,3,4]).memEvent?.value,2)}finally{r.close()}
 });
 test(`${layer}: an absolute label stored in .text is relocated`,async()=>{
  await ready();const source='.set noreorder\nla $t0,table\nlw $t1,0($t0)\njr $t1\nnop\ntable: .word target\ntarget: ori $s0,$zero,7\nnop\n';
  const code=Buffer.from((await a.assemble(source)).machineCode);assert.equal(code.readUInt32BE(20),BASE+24,'R_MIPS_32 pointer must include loaded code base');
 });
 test(`${layer}: unsupported data-section relocation is an error, not successful empty code`,async()=>{
  await ready();await assert.rejects(()=>a.assemble('.data\nvalue: .word 3\n.text\nla $t0,value\n'),/relocation|section/i);
 });
 test(`${layer}: plain numeric .word is preserved`,async()=>{
  await ready();assert.equal(Buffer.from((await a.assemble('.word 0x12345678\n')).machineCode).readUInt32BE(0),0x12345678);
 });
}
const {createHighlighter}=loadSource(sourceRoot+'/frontend/src/lib/highlighter.ts');
for(const [name,header]of Object.entries({plain:'',unusedMode:'.macro unused\n.set noreorder\n.endm\n',inactiveMode:'.if 0\n.set noreorder\n.endif\n',balancedMode:'.macro unused\n.set push\n.set noreorder\n.set pop\n.endm\n',inactiveData:'.if 0\n.word 42\n.endif\n'}))test(`mapping: ${name} must not change active assembler mode`,async()=>{
 const source=header+'main:\nori $t0,$zero,3\nj main\n',h=createHighlighter(options);const bytes=await h.initialize(source);
 const line=source.split('\n').indexOf('ori $t0,$zero,3')+1;
 assert.equal(Buffer.from(bytes).readUInt32BE(4),0x34080003,'real GAS places ORI in the slot');
 assert.deepEqual(h.getAddressesForLine(line),[BASE+4]);
});
