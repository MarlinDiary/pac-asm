const test=require('node:test'),assert=require('node:assert/strict');
const {sourceRoot,loadSource,loadRuntime}=require('./helpers/emulator-runtime.cjs');
const {GASAssembler}=loadSource(sourceRoot+'/frontend/src/lib/assembler.ts');
const {GASAssembler:BackendAssembler}=loadSource(sourceRoot+'/backend/src/game/assembler.ts');
const {createHighlighter}=loadSource(sourceRoot+'/frontend/src/lib/highlighter.ts');
const opts={target:'mips-linux-gnu',variant:'mips-r6'},BASE=0x10000;
const inactiveHeaders=[
 ['unused macro','.macro unused\n.set noreorder\n.endm\n'],
 ['false .if','.if 0\n.set noreorder\n.endif\n'],
 ['inactive .else','.if 1\n.else\n.set noreorder\n.endif\n'],
 ['false .ifdef','.ifdef ABSENT\n.set noreorder\n.endif\n'],
 ['false .ifndef','.equ PRESENT,1\n.ifndef PRESENT\n.set noreorder\n.endif\n'],
 ['false .ifc','.ifc a,b\n.set noreorder\n.endif\n'],
 ['false .ifeq','.ifeq 1\n.set noreorder\n.endif\n'],
 ['nested inactive mode','.if 0\n.if 1\n.set noreorder\n.endif\n.endif\n'],
 ['unused mode inside macro call','.macro modes val\n.if \\val\n.set noreorder\n.endif\n.endm\nmodes 0\n'],
 ['active mode macro overrides raw definitions','.macro mode value\n.set \\value\n.endm\n.set noreorder\nmode reorder\n'],
 ['zero repeats','.rept 0\n.set noreorder\n.endr\n'],
 ['nested zero repeats','.rept 1\n.rept 0\n.set noreorder\n.endr\n.endr\n'],
 ['active repetition restores mode','.set noreorder\n.rept 1\n.set reorder\n.endr\n'],
 ['active parameter iteration restores mode','.set noreorder\n.irp mode,reorder\n.set \\mode\n.endr\n'],
];
for(const[name,header]of inactiveHeaders)for(const instruction of ['ori $t0,$zero,3','li $t0,0x12345678'])test(`active GAS mode: ${name}, ${instruction}`,async()=>{
 const source=header+`main:\n${instruction}\nj main\n`,line=source.split('\n').indexOf(instruction)+1;
 const h=createHighlighter(opts),bytes=await h.initialize(source),slot=instruction.startsWith('li')?BASE+8:BASE+4;
 assert.deepEqual(h.getAddressesForLine(line),instruction.startsWith('li')?[BASE,slot]:[slot]);
 const a=new GASAssembler(opts),b=new BackendAssembler(opts);await a.initialize();await b.initialize();
 const original=await a.assemble(source),other=await b.assemble(source),rows=await a.getLineMappingInfo(source);
 const candidates=await a.getMacroSlotCandidates();assert.ok(candidates.length);
 assert.deepEqual(original.objectFile,other.objectFile,'diagnostics do not change original ELF');assert.deepEqual(bytes,Array.from(other.machineCode));assert.deepEqual(await a.getLineMappingInfo(source),rows);
 const runtime=await loadRuntime('frontend','MIPS_R6'),buffer=Buffer.from(bytes),r=runtime.create(Array.from({length:buffer.length/4},(_,i)=>buffer.readUInt32BE(i*4)));
 try{const stop=r.engine.runUntilMemoryWrite(0x30000,[1,2,3,4],5000000,[slot]);assert.equal(stop.stopReason,'breakpoint');assert.equal(stop.breakpoint.address,slot);assert.equal(stop.pc,BASE);assert.equal(r.mm.getRegister('t0').value,instruction.startsWith('li')?0x12345678:3)}finally{r.close()}
});
for(const header of [
 '.if 1\n.set noreorder\n.else\n.set reorder\n.endif\n',
 '.rept 1\n.set noreorder\n.endr\n',
 '.macro mode value\n.set \\value\n.endm\nmode noreorder\n',
 '.set noreorder\n.macro unused\n.set reorder\n.endm\n',
])test('inactive reorder cannot turn raw slot data into a LI continuation: '+header,async()=>{
 const source=header+'main:\nli $t0,0x12340000\nj main\n.word 0x35085678\n';const line=source.split('\n').indexOf('li $t0,0x12340000')+1;const h=createHighlighter(opts);await h.initialize(source);
 assert.deepEqual(h.getAddressesForLine(line),[BASE]);assert.ok(!h.getAllMappings().some(r=>r.address===BASE+8));
});
test('unusable conditional listing does not guess source mode and new compilation clears the cache',async()=>{
 const source='.if 0\n.set noreorder\n.endif\nmain:\nori $t0,$zero,3\nj main\n';const a=new GASAssembler(opts);await a.initialize();await a.assemble(source);
 const original=a.gasInstance;let calls=0;a.gasInstance=async()=>{calls++;throw new Error('diagnostic unavailable')};
 assert.deepEqual(await Promise.all([a.getMacroSlotCandidates(),a.getMacroSlotCandidates()]),[[],[]]);assert.equal(calls,1);
 a.gasInstance=original;await a.assemble(source);assert.ok((await a.getMacroSlotCandidates()).length);
});
for(const [name,source,expected]of [
 ['symbol LA before pointer table','.set noreorder\nla $t0,table\nlw $t8,0($t0)\njr $t8\nnop\ntable: .word target\ntarget:nop\n',[BASE,BASE+4]],
 ['numeric LA before later raw data','.set noreorder\nla $t0,0x12345678\nori $t1,$zero,3\n.word 0x25085678\n',[BASE,BASE+4]],
 ['comments and labels between LA and next instruction','.set noreorder\nla $t0,table\n# gap\nnext:\nlw $t8,0($t0)\ntable: .word 7\n',[BASE,BASE+4]],
 ['one-word LA must not absorb raw data','.set noreorder\nla $t0,0x12340000\n.word 0x25085678\nori $t1,$zero,3\n',[BASE]],
 ['one-word LA must not absorb inline raw data','.set noreorder\nla $t0,0x12340000; .word 0x25085678\nori $t1,$zero,3\n',[BASE]],
 ['one-word LA must not absorb macro data','.set noreorder\nla $t0,0x12340000\n.macro data\n.word 0x25085678\n.endm\ndata\nori $t1,$zero,3\n',[BASE]],
])test('LA data-boundary mapping: '+name,async()=>{
 const h=createHighlighter(opts);await h.initialize(source);assert.deepEqual(h.getAddressesForLine(2),expected);
});
