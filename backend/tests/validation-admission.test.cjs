// Real HTTP routes + real queue. Controlled judge/auth/storage fixtures; real WASM
// workers are used only by the two sequential Level 1 validation smoke cases.
const test=require('node:test'), assert=require('node:assert/strict'), path=require('node:path');
const root=path.resolve(process.env.QUEUE_PROJECT_ROOT || path.join(__dirname,'../..')), backend=root+'/backend';
process.chdir(backend);
process.env.GAME_VALIDATION_CONCURRENCY='3'; process.env.GAME_VALIDATION_MAX_PENDING='0'; process.env.GAME_VALIDATION_RETRY_AFTER='7';
const game=require(backend+'/dist/game/game-runner'), actualValidate=game.validateGame;
const auth=require(backend+'/dist/lib/github-auth');
const Submission=require(backend+'/dist/models/submission').default;
const {heavyValidationQueue:q}=require(backend+'/dist/lib/game-validation-queue');
const {MAPS}=require(backend+'/dist/game/maps');
const nativeFetch=global.fetch;
global.fetch=()=>{throw Error('Unexpected external network request in isolated admission test');};
let records=[],seen=[],active=0,peak=0,gate,server,base,serial=100;
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const wait=async(fn,label)=>{const until=Date.now()+5000;while(!fn()){if(Date.now()>until)throw Error('Timed out: '+label);await new Promise(r=>setTimeout(r,5));}};
const fixtureValidate=async options=>{seen.push(options);active++;peak=Math.max(peak,active);try{await gate.promise;if(options.sourceCode==='fixture-failure')throw Error('fixture judge failure');return {levelId:options.levelId,architecture:options.architecture,attempts:[],summary:{pass:true,metrics:{cycleCount:66}}};}finally{active--;}};
auth.requireVerifiedGitHubIdentity=async req=>{const token=req.headers.authorization;if(!token||!/^Bearer fixture-\d+$/.test(token))throw new auth.GitHubAuthError(401,'Fixture authentication required');return {githubId:token.slice(15),name:'Fixture Student'};};
auth.syncVerifiedGitHubUser=async i=>({record:{githubId:i.githubId},submissionUserId:'fixture:'+i.githubId,submissionUserName:i.name});
Submission.create=async d=>{const doc={...d,id:'fixture-'+records.length,createdAt:new Date(0),updatedAt:new Date(0)};records.push(doc);return doc;};
game.validateGame=fixtureValidate;
const app=require(backend+'/dist/app').default;
const body=(levelId='level4',architecture='MIPS_R6',sourceCode='nop')=>({sourceCode,levelId,architecture});
async function request(route,body,token){const res=await nativeFetch(base+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer fixture-'+token}:{})},body:body?JSON.stringify(body):undefined});return {status:res.status,retryAfter:res.headers.get('Retry-After'),body:await res.json()};}
const submit=(level='level4',id=++serial,source='nop')=>request('/game/submit',body(level,'MIPS_R6',source),id);
async function jobsDone(submitted){const jobs=[];for(const s of submitted){assert.equal(s.status,202);let job;for(let i=0;i<500;i++){job=(await request('/game/job/'+s.body.jobId)).body;if(['done','failed'].includes(job.status))break;await new Promise(r=>setTimeout(r,5));}assert.ok(['done','failed'].includes(job.status));jobs.push(job);}return jobs;}
test.before(async()=>{server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;});
test.beforeEach(()=>{records=[];seen=[];active=0;peak=0;gate=deferred();gate.resolve();game.validateGame=fixtureValidate;});
test.afterEach(async()=>{gate.resolve();await wait(()=>active===0&&q.runningCount===0&&q.pendingCount===0,'queue cleanup');game.validateGame=fixtureValidate;});
test.after(async()=>{global.fetch=nativeFetch;await new Promise(r=>server.close(r));});

for(const architecture of ['ARM','MIPS_R6']) for(const levelId of ['level1','level2','level3','level4','challenge']) {
 test(`idle anonymous validation preserves result/options for ${levelId}/${architecture}`,async()=>{
   const r=await request('/game/validate',{...body(levelId,architecture),maxSteps:'300',includeRegisters:'true'});
   assert.equal(r.status,200);assert.equal(r.retryAfter,null);
   assert.deepEqual(r.body,{levelId,architecture,attempts:[],summary:{pass:true,metrics:{cycleCount:66}}});
   assert.deepEqual(seen,[{sourceCode:'nop',levelId,architecture,maxSteps:300,includeRegisters:true}]);
   assert.equal(records.length,0);assert.equal(q.runningCount,0);
 });
}

test('all levels/architectures reject excess anonymous validation without starting judges or creating records',async()=>{
 gate=deferred();const submitted=await Promise.all([submit(),submit(),submit()]);await wait(()=>active===3,'three submitted jobs');
 for(const architecture of ['ARM','MIPS_R6'])for(const level of ['level1','level2','level3','level4','challenge']){
   const r=await request('/game/validate',body(level,architecture));assert.equal(r.status,429);assert.equal(r.retryAfter,'7');assert.match(r.body.error,/busy/);
 }
 assert.equal(seen.length,3);assert.equal(peak,3);assert.equal(q.pendingCount,0);assert.equal(records.length,0);
 gate.resolve();assert.ok((await jobsDone(submitted)).every(j=>j.status==='done'));
});

test('simultaneous anonymous requests use only three shared slots and do not build a queue',async()=>{
 gate=deferred();const responses=[];
 const requests=Array.from({length:12},()=>request('/game/validate',body()).then(r=>{responses.push(r);return r;}));
 try{await wait(()=>responses.length===9,'nine immediate overload replies');assert.ok(responses.every(r=>r.status===429));assert.equal(active,3);assert.equal(q.runningCount,3);assert.equal(q.pendingCount,0);}
 finally{gate.resolve();await Promise.all(requests);}
 assert.equal(responses.filter(r=>r.status===200).length,3);assert.equal(peak,3);assert.equal(records.length,0);
});

test('queued formal submissions keep priority and ticket positions when validation holds capacity',async()=>{
 gate=deferred();const validations=[1,2,3].map(i=>request('/game/validate',body('level4','ARM','validation-'+i)));
 await wait(()=>active===3,'validation slots');const submitted=[await submit(),await submit()];
 const queued=await Promise.all(submitted.map(s=>request('/game/job/'+s.body.jobId)));
 assert.deepEqual(queued.map(j=>j.body),[{status:'queued',pending:0},{status:'queued',pending:1}]);
 const extra=await request('/game/validate',body());assert.equal(extra.status,429);assert.equal(q.pendingCount,2);
 gate.resolve();assert.ok((await Promise.all(validations)).every(r=>r.status===200));assert.ok((await jobsDone(submitted)).every(j=>j.status==='done'));
 assert.equal(seen.length,5);assert.equal(peak,3);
});

test('same-user latest queued submission replacement still works',async()=>{
 gate=deferred();const blockers=await Promise.all([submit(),submit(),submit()]);await wait(()=>active===3,'blockers');
 const older=await submit('level4',9999,'older'),newer=await submit('level4',9999,'newer');
 assert.equal(q.pendingCount,2);gate.resolve();const jobs=await jobsDone([...blockers,older,newer]);
 assert.equal(jobs[3].status,'failed');assert.equal(jobs[3].error,'Replaced by a newer submission');assert.equal(jobs[4].status,'done');
 assert.ok(!seen.some(o=>o.sourceCode==='older'));assert.ok(seen.some(o=>o.sourceCode==='newer'));assert.equal(records.length,4);
});

test('judge failure keeps the existing 500 contract and frees capacity for the next request',async()=>{
 const failed=await request('/game/validate',body('level1','ARM','fixture-failure'));assert.equal(failed.status,500);assert.equal(failed.retryAfter,null);assert.equal(q.runningCount,0);
 const recovered=await request('/game/validate',body('level1','ARM'));assert.equal(recovered.status,200);assert.equal(q.runningCount,0);
});

test('non-finite and malformed maxSteps fail before judge admission; finite/default options remain compatible',async()=>{
 for(const value of ['Infinity','-Infinity','1e999','NaN','not-a-number']){const r=await request('/game/validate',{...body('level1'),maxSteps:value});assert.equal(r.status,400);}
 assert.equal(seen.length,0);assert.equal(q.runningCount,0);
 for(const value of [undefined,0,1,1.5,-1,300,1000000]){const r=await request('/game/validate',{...body('level1'),maxSteps:value});assert.equal(r.status,200);assert.equal(seen.at(-1).maxSteps,value);}
});

test('anonymous formal submission still requires authentication and light submits remain unchanged',async()=>{
 assert.equal((await request('/game/submit',body())).status,401);assert.equal(seen.length,0);
 gate=deferred();const light=await Promise.all(Array.from({length:4},()=>submit('level1')));await wait(()=>active===4,'legacy light-submit behavior');assert.equal(q.runningCount,0);
 gate.resolve();assert.ok((await jobsDone(light)).every(j=>j.status==='done'));assert.equal(records.length,4);
});

for(const architecture of ['ARM','MIPS_R6'])test(`real ${architecture} Level 1 validation retains judge output without storing a submission`,async()=>{
 game.validateGame=actualValidate;
 const sourceCode=MAPS.find(m=>m.id==='level1').initialCode[architecture];
 const r=await request('/game/validate',{sourceCode,levelId:'level1',architecture});
 assert.equal(r.status,200);assert.equal(r.body.summary.pass,true);assert.equal(r.body.summary.metrics.cycleCount,architecture==='ARM'?66:20);
 assert.equal(records.length,0);assert.equal(q.runningCount,0);
});
