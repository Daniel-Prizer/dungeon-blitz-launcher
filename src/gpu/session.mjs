import {verifyBinaryProbe} from './binary.mjs';

// One world stream, one render worker and bounded decode workers. The native
// world owns every unsupported state and stays visible until a GPU fence has
// completed. No game update, timer, input or packet is driven by this session.
export class GpuSession {
 constructor({cap=1000,verified=()=>false,onStatus=()=>{}}={}){this.cap=cap;this.verified=verified;this.onStatus=onStatus;this.running=false;this.current=null;this.binaryVerified=new WeakSet();this.status={phase:'native',completedCanvasFPS:0};}
 report(value){this.status={...this.status,...value};this.onStatus(this.status);}
 async start(){if(this.running)return;this.running=true;this.loop=this.run();}
 async stop(){this.running=false;this.current?.cancel();clearTimeout(this.sleepTimer);this.wake?.();await this.loop;}
 async setCap(cap){if(!Number.isInteger(cap)||cap<15||cap>1000)throw Error('Invalid GPU frame cap');this.cap=cap;await this.current?.cap(cap);}
 async run(){let failures=0;while(this.running){
  if(document.hidden||!this.verified()){this.report({phase:'native'});await this.sleep(250);continue;}
  try{await this.world();failures=0;}catch(error){const reason=String(error?.message||error).slice(0,160);failures=/GPU|worker|transport|device/i.test(reason)?Math.min(failures+1,6):0;this.report({phase:'native',reason});}
  if(this.running)await this.sleep(Math.min(30000,500*2**Math.max(0,failures-1)));
 }}
 sleep(ms){return new Promise(resolve=>{this.wake=resolve;this.sleepTimer=setTimeout(()=>{this.wake=null;resolve();},ms);});}
 async world(){
  const element=document.querySelector('ruffle-player'),native=element?.ruffle();if(!native)throw Error('Waiting for native runtime');
  const call=(name,...args)=>native.callExternalInterface(name,...args);
  if(element.loadedConfig?.wmode!=='transparent')throw Error('Transparent native presentation unavailable');
  const structure=call('BlitzGpuStructure');if(structure?.games?.length!==1||structure.games[0].play!==true)throw Error('Waiting for native world');
  if(!this.binaryVerified.has(element)){if(!verifyBinaryProbe(call('BlitzGpuBinaryProbe')))throw Error('Native byte transport unavailable');this.binaryVerified.add(element);}
  call('BlitzGpuSetBinary',true);const geometry=call('BlitzGpuNativeView',false);if(!geometry?.supported)throw Error('Waiting for native world');
  const canvas=document.createElement('canvas'),container=document.querySelector('#game-container');if(!container)throw Error('Game container unavailable');
  const old={background:container.style.background,position:container.style.position,zIndex:container.style.zIndex};Object.assign(container.style,{background:'transparent',position:'relative',zIndex:'2'});
  Object.assign(canvas.style,{position:'fixed',pointerEvents:'none',zIndex:'1',visibility:'hidden'});document.body.appendChild(canvas);
  const width=geometry.bitmapWidth||Math.round(geometry.width),height=geometry.bitmapHeight||Math.round(geometry.height),pending=new Map();this.report({generation:(this.status.generation||0)+1});
  let active=true,next=0,known=[],failure=null,worker,initialized=false,lastWorker=performance.now();const abort=new AbortController();
  const restore=()=>{canvas.style.visibility='hidden';try{call('BlitzGpuNativeView',false);}catch{}};
  const place=(g)=>{const rect=element.getBoundingClientRect();if(!g?.supported||g.bitmapWidth!==width||g.bitmapHeight!==height)throw Error('World dimensions changed');Object.assign(canvas.style,{left:(rect.left+g.x*rect.width/g.stageWidth)+'px',top:(rect.top+g.y*rect.height/g.stageHeight)+'px',width:(g.width*rect.width/g.stageWidth)+'px',height:(g.height*rect.height/g.stageHeight)+'px'});};
  try{place(geometry);worker=new Worker(new URL('./render-worker.mjs',import.meta.url),{type:'module'});}catch(error){restore();canvas.remove();Object.assign(container.style,old);throw error;}
  const request=(action,args={},transfer=[])=>new Promise((resolve,reject)=>{const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(Error('GPU worker timed out'));},action==='init'?10000:action==='stop'?500:1500);pending.set(id,{resolve,reject,timer});try{worker.postMessage({channel:'blitz-gpu-render-v1',id,action,...args},transfer);}catch(error){clearTimeout(timer);pending.delete(id);reject(error);}});
  const rejectPending=error=>{for(const task of pending.values()){clearTimeout(task.timer);task.reject(error);}pending.clear();};
  worker.onmessage=({data})=>{if(data?.channel!=='blitz-gpu-render-v1')return;lastWorker=performance.now();
   if(data.event==='native'){restore();this.report({phase:'native'});}
   else if(data.event==='ready'){if(!active||document.hidden||!this.verified())return;try{const g=call('BlitzGpuNativeView',true);place(g);if(g.hidden===true){canvas.style.visibility='visible';this.report({phase:'gpu',reason:''});}}catch(error){failure=error;active=false;restore();}}
   else if(data.event==='status'){this.report(data.status);if(data.status?.fault){failure=Error(data.status.fault);active=false;restore();}}
   else{const task=pending.get(data.id);if(!task)return;pending.delete(data.id);clearTimeout(task.timer);if(data.error)task.reject(Error(data.error));else task.resolve(data.result);}
  };
  const fail=message=>{failure=Error(message);active=false;restore();rejectPending(failure);};
  worker.onerror=()=>fail('GPU worker failed');worker.onmessageerror=()=>fail('GPU worker transport failed');
  const watchdog=setInterval(()=>{if(initialized&&active&&performance.now()-lastWorker>750)fail('GPU worker stopped responding; native rendering restored');},100);
  this.current={cancel:()=>{active=false;restore();abort.abort();rejectPending(Error('GPU stream cancelled'));clearTimeout(this.sleepTimer);this.wake?.();},cap:cap=>initialized?request('cap',{cap}):Promise.resolve()};
  try{
   const binary=await fetch(new URL('./binary.mjs',import.meta.url),{signal:abort.signal}),art=await fetch(new URL('./art-worker.mjs',import.meta.url),{signal:abort.signal});if(!binary.ok||!art.ok)throw Error('Artwork workers unavailable');
   const artWorkerSource=(await binary.text()).replaceAll('export function','function')+'\n'+(await art.text()).replace("import {nativeBytes} from './binary.mjs';",'');
   const offscreen=canvas.transferControlToOffscreen();await request('init',{canvas:offscreen,width,height,cap:this.cap,assetContractVerified:true,artWorkerSource,clockMode:'cooperative'},[offscreen]);initialized=true;await request('cap',{cap:this.cap});this.report({phase:'warming',completedFrames:0,completedCanvasFPS:0,elapsedMs:0,fault:'',reason:''});
   while(active&&this.running&&!document.hidden&&this.verified()){
    const before=performance.now(),id=call('BlitzGpuRequestFrame',known,false);if(!id)throw Error('Native collector unavailable');let packet;
    for(let i=0;i<200&&active&&this.running;i++){await new Promise(r=>setTimeout(r,1));packet=call('BlitzGpuFrameResult');if(packet?.request===id)break;}
    if(!active||!this.running)break;if(!packet?.supported||packet.request!==id)throw Error(packet?.reason||'Native collector timed out');
    if(packet.width!==width||packet.height!==height)throw Error('World dimensions changed');
    const sampledAt=Math.max(before,performance.now()-packet.captureMs),result=await request('frame',{packet,time:performance.timeOrigin+sampledAt});known=result.known;
   }
   if(failure)throw failure;
  }finally{
   active=false;restore();this.current=null;clearInterval(watchdog);abort.abort();
   try{await request('stop');}catch{}rejectPending(Error('GPU stream closed'));worker.terminate();canvas.remove();try{call('BlitzGpuRelease');}catch{}Object.assign(container.style,old);
  }
 }
}
