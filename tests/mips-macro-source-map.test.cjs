const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {sourceRoot,loadSource,loadRuntime}=require('./helpers/emulator-runtime.cjs');
const {createHighlighter,getHighlightFromStepResult}=loadSource(path.join(sourceRoot,'frontend/src/lib/highlighter.ts'));
const {GASAssembler}=loadSource(path.join(sourceRoot,'frontend/src/lib/assembler.ts'));
const {GASAssembler:ReferenceAssembler}=loadSource(path.join(sourceRoot,'backend/src/game/assembler.ts'));
const options={target:'mips-linux-gnu',variant:'mips-r6'},BASE=0x10000;
const wrap=(body,call='work',header='.macro work')=>`${header}\n${body}\n.endm\nmain:\n${call}\nj main\n`;
const cases=[
 ['multiple instructions',wrap('li $t0,0x12345678\nori $t1,$zero,3'),[0,4,12]],
 ['dotted macro name',wrap('li $t0,0x12345678\nori $t1,$zero,3','.work','.macro .work'),[0,4,12]],
 ['store tail',wrap('li $t0,0x12345678\nsw $s3,0($t1)'),[0,4,12]],
 ['conditional true',wrap('.if \\val\nli $t0,0x12345678\n.else\nli $t0,0x87654321\n.endif','work 1','.macro work val'),[0,8]],
 ['conditional false',wrap('.if \\val\nli $t0,0x12345678\n.else\nli $t0,0x87654321\n.endif','work 0','.macro work val'),[0,8]],
 ['nested calls','.macro inner v\nli $t0,\\v\nori $t1,$zero,3\n.endm\n'+wrap('inner 0x12345678'),[0,4,12]],
 ['repetition',wrap('.rept 2\nli $t0,0x12345678\n.endr'),[0,4,8,16]],
 ['zero repetitions',wrap('ori $t0,$zero,2\n.rept 0\nori $t1,$zero,3\n.endr'),[4]],
 ['semicolon statements',wrap('ori $t0,$zero,2; ori $t1,$zero,3'),[0,8]],
 ['argument iteration',wrap('.irp reg,$t0,$t1\nori \\reg,$zero,3\n.endr'),[0,8]],
 ['string conditional',wrap('.ifc \\reg,$t0\nli \\reg,0x12345678\n.else\nori \\reg,$zero,3\n.endif','work $t0','.macro work reg'),[0,8]],
 ['unused noreorder definition','.macro unused\n.set noreorder\n.endm\n'+wrap('li $t0,0x12345678\nori $t1,$zero,3'),[0,4,12]],
];
for(const[name,source,offsets]of cases)test(`GAS macro ownership: ${name}`,async()=>{
 const h=createHighlighter(options),bytes=await h.initialize(source);
 const lines=source.trimEnd().split('\n'),callLine=lines.length-1,branchLine=lines.length;
 assert.deepEqual(h.getAddressesForLine(callLine).sort((a,b)=>a-b),offsets.map(n=>BASE+n));
 const branch=h.getAddressesForLine(branchLine)[0],slot=branch+4;
 assert.deepEqual(h.getHighlightForAddresses([branch,slot]).lineNumbers,[branchLine,callLine]);
 assert.ok(h.getAddressesForLine(callLine).includes(slot));
 // A source breakpoint on the macro's displaced tail is executable, not just a decoration.
 const {create}=await loadRuntime('frontend','MIPS_R6');
 const buffer=Buffer.from(bytes),words=Array.from({length:buffer.length/4},(_,i)=>buffer.readUInt32BE(i*4));
 const r=create(words,{t1:0x30000,s3:3});
 try{const result=r.engine.runUntilMemoryWrite(0x30000,[1,2,3,4],5000000,[slot]);assert.equal(result.stopReason,'breakpoint');assert.equal(result.breakpoint.address,slot);assert.equal(result.pc,BASE);if(name==='store tail')assert.equal(result.memEvent.value,3);}
 finally{r.close()}
 const a=new GASAssembler(options),reference=new ReferenceAssembler(options);await a.initialize();await reference.initialize();
 const result=await a.assemble(source),original=await reference.assemble(source),dwarfBefore=await a.getLineMappingInfo(source);
 assert.deepEqual(result.objectFile,original.objectFile,'original ELF, including DWARF and relocations, is unchanged');
 assert.deepEqual(bytes,Array.from(original.machineCode),'executable bytes are unchanged');
 const candidates=await a.getMacroSlotCandidates();assert.ok(candidates.length);
 assert.deepEqual(await a.getLineMappingInfo(source),dwarfBefore,'diagnostic listing never replaces original DWARF');
 a.destroy();
});
const guards=[
 ['raw data after macro',wrap('li $t0,0x12345678\n.word 0x34090003'),[8,16]],
 ['macro leaves noreorder',wrap('.set noreorder\nli $t0,0x12345678')+'.word 0x35085678\n',[12]],
 ['noreorder slot explicitly owned',wrap('.set noreorder\nli $t0,0x12345678')+'ori $t2,$zero,7\n',[12]],
 ['mode push and pop',wrap('.set push\n.set noreorder\nli $t0,0x12345678\nori $t1,$zero,3\n.set pop'),[16]],
 ['branch operand hazard',wrap('li $t0,0x12345678\nori $t1,$zero,3').replace('j main','beq $t1,$zero,main'),[16]],
 ['compact branch',wrap('li $t0,0x12345678\nori $t1,$zero,3').replace('j main','bc main'),[16]],
];
for(const[name,source,forbidden]of guards)test(`no phantom macro tail: ${name}`,async()=>{
 const h=createHighlighter(options);await h.initialize(source);
 const callLine=source.split('\n').findIndex(s=>s==='work')+1;
 for(const offset of forbidden)assert.ok(!h.getAddressesForLine(callLine).includes(BASE+offset));
});
test('explicit .loc remains authoritative with a complex macro',async()=>{
 const source='.file 1 "in.s"\n.macro work\nli $t0,0x12345678\nori $t1,$zero,3\n.endm\n.loc 1 7\nwork\n.loc 1 9\nj main\nmain: nop\n';
 const a=new GASAssembler(options);await a.initialize();await a.assemble(source);const rows=await a.getLineMappingInfo(source);
 const h=createHighlighter(options);await h.initialize(source);
 assert.deepEqual(h.getAllMappings().map(({address,lineNumber})=>({address,lineNumber})),rows.map(({address,lineNumber})=>({address,lineNumber})));
});
test('listing is lazy, cached, reset with the source and ignores mismatched diagnostic code',async()=>{
 const a=new GASAssembler(options),b=new ReferenceAssembler(options);await a.initialize();await b.initialize();
 const other=await b.assemble(wrap('li $t0,0x87654321\nori $t1,$zero,3'));
 const source=wrap('li $t0,0x12345678\nori $t1,$zero,3');await a.assemble(source);const rows=await a.getLineMappingInfo(source);
 const original=a.gasInstance;let calls=0;
 a.gasInstance=async args=>{calls++;return original({...args,postRun:[m=>{m.FS.writeFile('out.o',other.objectFile);for(const callback of args.postRun)callback(m)}]});};
 assert.deepEqual(await Promise.all([a.getMacroSlotCandidates(),a.getMacroSlotCandidates()]),[[],[]]);assert.equal(calls,1);
 assert.deepEqual(await a.getLineMappingInfo(source),rows);
 a.gasInstance=original;await a.assemble(source);assert.ok((await a.getMacroSlotCandidates()).length);
 await a.assemble('nop\n');assert.deepEqual(await a.getMacroSlotCandidates(),[]);
 await assert.rejects(()=>a.assemble('this_is_not_an_instruction\n'));assert.deepEqual(await a.getMacroSlotCandidates(),[]);
 await assert.rejects(()=>a.getLineMappingInfo(source),/No object file/);
});
test('debugging highlights both the branch and conditional macro, across repeated executions',async()=>{
 const source=cases.find(c=>c[0]==='conditional true')[1],h=createHighlighter(options),bytes=Buffer.from(await h.initialize(source));
 const {create}=await loadRuntime('frontend','MIPS_R6'),r=create(Array.from({length:bytes.length/4},(_,i)=>bytes.readUInt32BE(i*4)));
 try{for(let cycle=0;cycle<3;cycle++){r.engine.stepDebugExecution();const step=r.engine.stepDebugExecution();assert.equal(step.pc,BASE);assert.equal(r.mm.getRegister('t0').value,0x12345678);assert.equal(getHighlightFromStepResult(step,h).lineNumbers.length,2);assert.equal(r.activeHooks.size,0);}}finally{r.close()}
});

test('a macro instruction-name parameter does not turn raw data into a preceding LI breakpoint',async()=>{
 const source='.macro emit op\n\\op 0x35085678\n.endm\nli $t0,0x12340000\nemit .word\nori $t1,$zero,3\n';
 const h=createHighlighter(options);await h.initialize(source);
 assert.deepEqual(h.getAddressesForLine(4),[BASE]);assert.ok(!h.getAllMappings().some(r=>r.address===BASE+4));
});
