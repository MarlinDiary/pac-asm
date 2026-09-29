// Strict native regression. Run explicitly with node --test; expect exit 0.
const test=require('node:test'),assert=require('node:assert/strict');
const {loadRuntime}=require('../helpers/emulator-runtime.cjs');
for(const layer of ['frontend','backend'])test(layer,async t=>{const {uc,C,create}=await loadRuntime(layer,'MIPS_R6');
 for(const [name,offset,value] of [['ordinary data',16,3],['ignored command value',0,9]])await t.test(`own-slot ${name}: no duplicate store under runUntilMemoryWrite`,()=>{
  const r=create([0x08004001,(0xad2e0000|offset)>>>0,0x34130002,0xad330000,0],{t1:C.DATA_BASE,t6:value});const writes=[];
  const h=r.u.hook_add(uc.HOOK_MEM_WRITE,(_,type,address,size,v)=>{if(Number(address)===C.DATA_BASE+offset && Number(v)===value)writes.push(Number(v));},undefined,1,0);
  try {const result=r.engine.runUntilMemoryWrite(C.DATA_BASE,[1,2,3,4],5000000);assert.equal(result.memEvent.value,2);assert.deepEqual(writes,[value,value]);r.u.hook_del(h);assert.equal(r.activeHooks.size,0);}finally{r.close();}
 });
});
