const test=require('node:test'),assert=require('node:assert/strict');
const{sourceRoot,loadSource}=require('./helpers/emulator-runtime.cjs');
const{createHighlighter}=loadSource(sourceRoot+'/frontend/src/lib/highlighter.ts');
const{ARMAssembler}=loadSource(sourceRoot+'/frontend/src/lib/assembler.ts');
const options={target:'mips-linux-gnu',variant:'mips-r6'};
for(const [name,source,line,expected] of [
 ['sequential li','li $t0,0x12345678\nori $t1,$zero,3\n',1,[0x10000,0x10004]],
 ['sequential la','main:\nla $t0,0x12345678($t1)\nbc main\n',2,[0x10000,0x10004,0x10008]],
 ['last li excludes alignment padding','li $t0,0x12345678\n',1,[0x10000,0x10004]],
 ['raw data is not part of previous li','.set noreorder\nli $t0,0x12345678\n.word 0x35085678\n.space 16\nori $t1,$zero,3\n',2,[0x10000,0x10004]],
 ['macro li displaced into a branch slot','.macro make v\nli $t0,\\v\n.endm\nmain:\nmake 0x12345678\nj main\n',5,[0x10000,0x10008]],
 ['macro with multiple instructions','.macro work\nli $t0,0x12345678\nori $t1,$zero,3\n.endm\nwork\n',5,[0x10000,0x10004,0x10008]],
 ['nested macro invocation','.macro inner\nli $t0,0x12345678\n.endm\n.macro outer\ninner\n.endm\nouter\n',7,[0x10000,0x10004]],
])test(name,async()=>{
 const h=createHighlighter(options),machine=await h.initialize(source);
 assert.deepEqual(h.getAddressesForLine(line),expected);
 const a=new ARMAssembler(options);await a.initialize();try{assert.deepEqual(machine,Array.from((await a.assemble(source)).mc));}finally{a.destroy();}
 for(const address of expected)assert.ok(h.getHighlightLine(address).lineNumbers.includes(line));
});
test('external .loc file does not create breakpoints on unrelated editor lines',async()=>{
 const h=createHighlighter(options);await h.initialize('.file 1 "external.s"\n.loc 1 4\nnop\nnop\n');assert.deepEqual(h.getAllMappings(),[]);
});
test('a one-word LI must not absorb an ORI-shaped raw data word',async()=>{
 const h=createHighlighter(options);await h.initialize('li $t0,0x12340000\n.word 0x35085678\nori $t1,$zero,3\n');assert.deepEqual(h.getAddressesForLine(1),[0x10000]);
});
