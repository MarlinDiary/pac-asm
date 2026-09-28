const fs = require('node:fs');
const path = require('node:path');
const { performance, monitorEventLoopDelay } = require('node:perf_hooks');
const { AsyncLocalStorage } = require('node:async_hooks');
const { createHash } = require('node:crypto');
const [rootArg, output, suite = 'single', concurrencyArg = '3'] = process.argv.slice(2);
const root = path.resolve(rootArg); process.chdir(root);
const { NodeEmulator } = require(root + '/dist/game/emulator/node-emulator');
const assembler = require(root + '/dist/game/assembler');
const { AsyncTaskQueue } = require(root + '/dist/lib/async-task-queue');
const { MAPS } = require(root + '/dist/game/maps');
const { validateGame } = require(root + '/dist/game/game-runner');
const als = new AsyncLocalStorage();
const random = Math.random;
Math.random = () => { const s = als.getStore(); if (!s) return random(); s.randomCalls++; s.seed = (Math.imul(s.seed,1664525) + 1013904223) >>> 0; return s.seed / 4294967296; };
for (const [label, proto, names] of [
 ['emulator', NodeEmulator.prototype, ['initializeEmulator','reset','loadCode','writeMemory','getAllRegisters','getMemory','runUntilMemWrite','getCycleCount','close']],
 ['assembler', assembler.ARMAssembler.prototype, ['initialize','assemble']]
]) for (const name of names) {
 const original = proto[name]; proto[name] = async function(...args) {
   const start = performance.now(); try {return await original.apply(this,args)} finally {
     const s = als.getStore(); if (s) { const m = s.phases[label+'.'+name] ??= {calls:0,ms:0}; m.calls++; m.ms += performance.now()-start; }
   }
 };
}
function source(level, architecture) {
 let code = MAPS.find(m=>m.id === (level==='challenge'?'level3':level)).initialCode[architecture];
 if (level==='challenge') code = architecture==='ARM'
 ? code.replace('#169','#220').replace('#-14','#-21').replace('#12','#19')
 : code.replace('169','220').replace('-14(','-21(').replace('12(','19(');
 return code;
}
const baseCases = [];
for (const architecture of ['MIPS_R6','ARM']) for (const levelId of ['level1','level2','level3','level4','challenge']) {
 baseCases.push({name:architecture+'-'+levelId,options:{sourceCode:source(levelId,architecture),levelId,architecture,recordReplay:levelId==='challenge'}});
}
const cases = suite==='queue' ? Array.from({length:30},(_,i)=>({...baseCases.find(c=>c.name==='MIPS_R6-challenge'),name:'student-'+i+'-MIPS_R6-challenge'})) : baseCases;
const delay = monitorEventLoopDelay({resolution:10}); delay.enable();
let peakRss=process.memoryUsage().rss;
const timer = setInterval(()=>peakRss=Math.max(peakRss,process.memoryUsage().rss),20);
const cpu = process.cpuUsage(); const started = performance.now();
const queue = new AsyncTaskQueue({concurrency:suite==='queue'?Number(concurrencyArg):1,maxPending:0});
const results=[];
async function run(c, i) {
 const enqueued=performance.now();
 return queue.enqueue(async()=> {
  const start=performance.now(); const state={seed:12345+i,randomCalls:0,phases:{}};
  return als.run(state, async()=> {
   let result; try { result=await validateGame(c.options) } catch(e) { result={error:e.message} }
   const end=performance.now();
   const row={name:c.name,options:c.options,seed:12345+i,randomCalls:state.randomCalls,queueMs:start-enqueued,judgeMs:end-start,totalMs:end-enqueued,phases:state.phases,result,sha256:createHash('sha256').update(JSON.stringify(result)).digest('hex')};
   results.push(row);
   console.log(JSON.stringify({name:c.name,ms:row.judgeMs,attempts:result.attempts?.length,summary:result.summary,phases:state.phases}, (k,v)=>k==='cycleCounts'?`[${v.length} entries]`:v));
  });
 });
}
(async()=>{
 if (suite==='queue') await Promise.all(cases.map(run)); else for(let i=0;i<cases.length;i++) await run(cases[i],i);
 clearInterval(timer); delay.disable();
 const report={root,suite,concurrency:suite==='queue'?Number(concurrencyArg):1,node:process.version,platform:process.platform,arch:process.arch,elapsedMs:performance.now()-started,cpu:process.cpuUsage(cpu),peakRss,eventLoopP95Ms:delay.percentile(95)/1e6,eventLoopMaxMs:delay.max/1e6,results};
 fs.writeFileSync(output,JSON.stringify(report,null,2)); console.log(JSON.stringify({...report,results:results.map(r=>({name:r.name,ms:r.judgeMs,queueMs:r.queueMs,sha256:r.sha256}))}));
})().catch(e=>{console.error(e);process.exitCode=1;clearInterval(timer)});
