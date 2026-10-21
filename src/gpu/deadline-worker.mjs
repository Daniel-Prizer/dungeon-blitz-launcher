// Worker-local sleep avoids nested window-timer clamping. No spin loop, global
// timer-resolution changes, simulation scheduling or queued pulse backlog.
const sleeper=typeof SharedArrayBuffer==='function'?new Int32Array(new SharedArrayBuffer(4)):null;
self.onmessage=async({data})=>{if(!data||!Number.isSafeInteger(data.id)||!Number.isFinite(data.deadline))return;const now=()=>performance.timeOrigin+performance.now();if(data.deadline-now()>1000)return;
 while(data.deadline>now()){const remaining=data.deadline-now();if(sleeper)Atomics.wait(sleeper,0,0,remaining);else await new Promise(resolve=>setTimeout(resolve,Math.max(1,Math.floor(remaining))));}
 self.postMessage({id:data.id,clock:sleeper?'worker-atomics-wait':'worker-timer'});
};
