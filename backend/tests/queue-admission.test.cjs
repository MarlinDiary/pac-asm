const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(process.env.QUEUE_PROJECT_ROOT || path.join(__dirname, '../..'));
const { AsyncTaskQueue, QueueOverloadedError } = require(root + '/backend/dist/lib/async-task-queue');
const deferred = () => { let resolve, reject; const promise = new Promise((r, j) => { resolve=r; reject=j; }); return {promise,resolve,reject}; };
const idle = async q => { for (let i=0;i<100 && q.runningCount;i++) await new Promise(r=>setImmediate(r)); assert.equal(q.runningCount,0); assert.equal(q.pendingCount,0); };

test('tryRun reserves synchronously, never queues excess requests, and returns retry metadata', async () => {
  const q=new AsyncTaskQueue({concurrency:3,retryAfterSeconds:7}), gate=deferred();
  let starts=0;
  const admitted=Array.from({length:3},()=>q.tryRun(async()=>{ starts++; await gate.promise; return 42; }));
  try {
    assert.equal(q.runningCount,3);
    const rejected=await Promise.all(Array.from({length:20},()=>q.tryRun(async()=>{starts++;}).then(()=>null,e=>e)));
    assert.ok(rejected.every(e=>e instanceof QueueOverloadedError && e.statusCode===429 && e.retryAfterSeconds===7));
    assert.equal(starts,3); assert.equal(q.pendingCount,0);
  } finally { gate.resolve(); await Promise.all(admitted); }
  await idle(q); assert.equal(await q.tryRun(async()=>42),42); await idle(q);
});

test('queued submissions retain FIFO priority after a best-effort slot releases', async () => {
  const q=new AsyncTaskQueue({concurrency:1}), gate=deferred(), order=[];
  const first=q.tryRun(async()=>{order.push('validation'); await gate.promise;});
  const second=q.enqueue(async()=>{order.push('submission-1');});
  const third=q.enqueue(async()=>{order.push('submission-2');});
  try { await assert.rejects(q.tryRun(async()=>order.push('overtake')),QueueOverloadedError); assert.equal(q.pendingCount,2); }
  finally { gate.resolve(); await Promise.all([first,second,third]); }
  assert.deepEqual(order,['validation','submission-1','submission-2']); await idle(q);
});

test('tryRun cannot take a running submit slot and rejection does not add pending work', async () => {
  const q=new AsyncTaskQueue({concurrency:1}), gate=deferred();
  const submitted=q.enqueue(()=>gate.promise);
  try { await assert.rejects(q.tryRun(async()=>{}),QueueOverloadedError); assert.equal(q.pendingCount,0); }
  finally { gate.resolve(); await submitted; }
  await idle(q);
});

for (const kind of ['synchronous','asynchronous']) {
  test(`tryRun releases its slot and drains FIFO after ${kind} failure`, async () => {
    const q=new AsyncTaskQueue({concurrency:1}), error=new Error('fixture failure');
    const bad=q.tryRun(()=>{ if(kind==='synchronous') throw error; return Promise.reject(error); });
    const rejection=assert.rejects(bad,e=>e===error);
    const next=q.enqueue(async()=> 'submission-completed');
    await rejection; assert.equal(await next,'submission-completed'); await idle(q);
    assert.equal(await q.tryRun(async()=> 'recovered'),'recovered'); await idle(q);
  });
}

test('mixed submit/validation bursts cannot exceed shared concurrency', async () => {
  const q=new AsyncTaskQueue({concurrency:3,maxPending:0}), gate=deferred(); let active=0,peak=0;
  const work=async()=>{active++;peak=Math.max(peak,active);try{await gate.promise;return 'ok';}finally{active--;}};
  const submitted=Array.from({length:12},()=>q.enqueue(work));
  const attempted=Array.from({length:30},()=>q.tryRun(work).then(()=> 'accepted',e=> e.statusCode));
  try { assert.deepEqual(await Promise.all(attempted),Array(30).fill(429)); assert.equal(q.pendingCount,9); }
  finally {gate.resolve();await Promise.all(submitted);}
  assert.equal(peak,3); assert.equal(active,0); await idle(q);
});

test('configured FIFO pending bound and error metadata remain unchanged', async () => {
  const q=new AsyncTaskQueue({concurrency:1,maxPending:2,retryAfterSeconds:11}), gate=deferred();
  const queued=Array.from({length:3},()=>q.enqueue(()=>gate.promise));
  try {
    await assert.rejects(q.enqueue(async()=>{}),e=>e instanceof QueueOverloadedError && e.retryAfterSeconds===11);
    assert.equal(q.runningCount,1); assert.equal(q.pendingCount,2);
  } finally {gate.resolve();await Promise.all(queued);}
  await idle(q);
});
