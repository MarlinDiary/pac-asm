// Small independent architectural oracle. It evaluates the generated AST,
// not Unicorn output and not the application's instruction/branch decoder.
const BASE=0x10000, DATA=0x30000;
const names='zero at v0 v1 a0 a1 a2 a3 t0 t1 t2 t3 t4 t5 t6 t7 s0 s1 s2 s3 s4 s5 s6 s7 t8 t9 k0 k1 gp sp fp ra'.split(' ');
const rr={addu:33,subu:35,and:36,or:37,xor:38,nor:39,slt:42,sltu:43};
const shifts={sll:0,srl:2,sra:3};
const imm={addiu:9,andi:12,ori:13,xori:14,lui:15};
const mem={lb:[32,1,true],lh:[33,2,true],lw:[35,4,false],lbu:[36,1,false],lhu:[37,2,false],sb:[40,1,false],sh:[41,2,false],sw:[43,4,false]};
const delayed=new Set(['j','jal','jalr','beq','bne','blez','bgtz','bltz','bgez']);
const compact=new Set(['beqc','bnec','bc']);
function encode(a,i){const {op,d=0,s=0,t=0,v=0,target=0}=a;let w;
 if(op==='nop')w=0;
 else if(op in rr)w=s<<21|t<<16|d<<11|rr[op];
 else if(op in shifts)w=t<<16|d<<11|v<<6|shifts[op];
 else if(op in imm)w=imm[op]<<26|(op==='lui'?0:s)<<21|d<<16|v&65535;
 else if(op in mem)w=mem[op][0]<<26|9<<21|d<<16|v&65535;
 else if(op==='j'||op==='jal')w=(op==='j'?2:3)<<26|(BASE+target*4)>>>2;
 else if(op==='jalr')w=24<<21|31<<11|9;
 else if(op==='beq'||op==='bne')w=(op==='beq'?4:5)<<26|s<<21|t<<16|(target-i-1)&65535;
 else if(op==='blez'||op==='bgtz')w=(op==='blez'?6:7)<<26|s<<21|(target-i-1)&65535;
 else if(op==='bltz'||op==='bgez')w=1<<26|s<<21|(op==='bgez'?1:0)<<16|(target-i-1)&65535;
 else if(op==='beqc'||op==='bnec')w=(op==='beqc'?8:24)<<26|10<<21|11<<16|(target-i-1)&65535;
 else if(op==='bc')w=50<<26|(target-i-1)&0x3ffffff;
 else throw Error('Unsupported oracle instruction '+op);
 return w>>>0;
}
function run(program){const r=new Uint32Array(32), bytes=Uint8Array.from(program.memory), trace=[],writes=[],reads=[],commands=[];
 for(const [name,v]of Object.entries(program.registers))r[names.indexOf(name)]=v>>>0;
 let pc=0;
 function one(a,i){const {op,d=0,s=0,t=0,v=0}=a;let out;
  if(op==='nop')return;
  if(op in mem){const [,size,signed]=mem[op];if(v<0||v+size>bytes.length||v%size)throw Error('Bad generated access');
   if(op[0]==='s'){let value=r[d];for(let j=0;j<size;j++)bytes[v+j]=value>>>((size-j-1)*8)&255;
    value=size===4?value:value&((1<<(size*8))-1);writes.push({pc:BASE+i*4,address:DATA+v,size,value});if(v<4)commands.push(value);
   }else{let value=0;for(let j=0;j<size;j++)value=(value*256+bytes[v+j])>>>0;
    reads.push({pc:BASE+i*4,address:DATA+v,size});if(signed)value=value<<(32-size*8)>>(32-size*8);r[d]=value>>>0;r[0]=0;}
   return;
  }
  switch(op){case'addu':out=r[s]+r[t];break;case'subu':out=r[s]-r[t];break;
   case'and':out=r[s]&r[t];break;case'or':out=r[s]|r[t];break;case'xor':out=r[s]^r[t];break;case'nor':out=~(r[s]|r[t]);break;
   case'slt':out=(r[s]|0)<(r[t]|0)?1:0;break;case'sltu':out=r[s]<r[t]?1:0;break;
   case'sll':out=r[t]<<v;break;case'srl':out=r[t]>>>v;break;case'sra':out=r[t]>>v;break;
   case'addiu':out=r[s]+(v<<16>>16);break;case'andi':out=r[s]&(v&65535);break;case'ori':out=r[s]|v&65535;break;case'xori':out=r[s]^v&65535;break;case'lui':out=v<<16;break;
   default:throw Error('Control transfer in generated slot: '+op);
  }r[d]=out>>>0;r[0]=0;
 }
 while(pc<program.ast.length){if(trace.length>2000)throw Error('Oracle program did not terminate');const a=program.ast[pc],i=pc;trace.push(BASE+i*4);
  if(delayed.has(a.op)||compact.has(a.op)){
   let take=true;const s=r[a.s??0]|0;
   if(a.op==='beq')take=r[a.s]===r[a.t];if(a.op==='bne')take=r[a.s]!==r[a.t];
   if(a.op==='blez')take=s<=0;if(a.op==='bgtz')take=s>0;if(a.op==='bltz')take=s<0;if(a.op==='bgez')take=s>=0;
   if(a.op==='beqc')take=r[10]===r[11];if(a.op==='bnec')take=r[10]!==r[11];
   const target=a.op==='jalr'?(r[24]-BASE)/4:a.target;
   if(a.op==='jal'||a.op==='jalr')r[31]=BASE+i*4+8;
   if(delayed.has(a.op)){trace.push(BASE+(i+1)*4);one(program.ast[i+1],i+1);pc=take?target:i+2;}
   else pc=take?target:i+1;
  }else{one(a,i);pc++;}
 }
 return {registers:Object.fromEntries(names.map((n,i)=>[n,r[i]])),memory:Array.from(bytes),trace,writes,reads,commands,pc:BASE+pc*4};
}
function generate(seed){let state=seed>>>0;const next=()=>state=(Math.imul(state,1664525)+1013904223)>>>0, pick=a=>a[next()%a.length];
 const pool=[0,8,10,11,12,13,14], nonzero=pool.slice(1), ast=[];
 const edge=[0,1,0xffffffff,0x7fffffff,0x80000000,0x8000,0xffff,0x12345678];
 const registers={t1:DATA,s3:seed%4+1,sp:0x20ffc};for(const reg of nonzero)registers[names[reg]]=pick(edge);
 const memory=Array.from({length:128},()=>next()>>>24);memory.fill(0,0,4);
 function simple(){const op=pick(['addiu','addu','subu','and','or','xor','nor','slt','sltu','sll','srl','sra','andi','ori','xori','lui',...Object.keys(mem)]),d=pick(pool),s=pick(nonzero),t=pick(nonzero);
  if(op in mem){const size=mem[op][1];return {op,d,v:16+(next()%Math.floor(96/size))*size};}
  return {op,d,s,t,v:op in shifts?next()%32:next()&65535};
 }
 function command(){const op=pick(['sw','sh','sb']);return{op,d:19,v:op==='sw'?0:op==='sh'?2:3};}
 // Labels, own-slot targets, target=fallthrough, condition/target-register
 // clobbers in slots, compact forbidden slots and memory access permutations.
 for(let block=0;block<5;block++){
  ast.push(simple());const op=pick([...delayed,...compact]);
  if(op==='jalr'){const targetIndex=ast.length+2+pick([1,2,4]);ast.push({op:'lui',d:24,v:(BASE+targetIndex*4)>>>16},{op:'ori',d:24,s:24,v:(BASE+targetIndex*4)&65535});}
  const i=ast.length,target=i+pick([1,2,4]);
  if(op==='jalr'){ast[i-2].v=(BASE+target*4)>>>16;ast[i-1].v=(BASE+target*4)&65535;}
  ast.push({op,s:10,t:11,target});
  ast.push(next()%3===0?command():simple(),simple(),simple(),simple());
  if(next()%2)ast.push(command());
 }
 ast.push({op:'ori',d:15,s:0,v:1+seed%5});const loop=ast.length;
 ast.push(simple(),{op:'addiu',d:15,s:15,v:-1},{op:'bne',s:15,t:0,target:loop},seed%2?command():simple());
 ast.push({op:'sw',d:19,v:0});
 const result={seed,ast,registers,memory,words:ast.map(encode)};result.expected=run(result);return result;
}
function source(program){return '.set noreorder\n.text\n'+program.ast.map((a,i)=>{const {op,d=0,s=0,t=0,v=0,target=0}=a;let ins;
 if(op==='nop')ins=op;else if(op in rr)ins=`${op} $${names[d]},$${names[s]},$${names[t]}`;
 else if(op in shifts)ins=`${op} $${names[d]},$${names[t]},${v}`;
 else if(op in mem)ins=`${op} $${names[d]},${v}($t1)`;
 else if(op in imm)ins=op==='lui'?`${op} $${names[d]},${v}`:`${op} $${names[d]},$${names[s]},${op==='addiu'?(v<<16>>16):v}`;
 else if(op==='jalr')ins='jalr $ra,$t8';else if(['j','jal','bc'].includes(op))ins=`${op} L${target}`;
 else if(['beqc','bnec'].includes(op))ins=`${op} $t2,$t3,L${target}`;
 else if(['beq','bne'].includes(op))ins=`${op} $${names[s]},$${names[t]},L${target}`;
 else ins=`${op} $${names[s]},L${target}`;
 return `L${i}: ${ins}`;}).join('\n')+'\n';}
module.exports={generate,run,source,names,BASE,DATA};
