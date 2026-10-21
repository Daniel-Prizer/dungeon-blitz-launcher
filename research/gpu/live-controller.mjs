import {GpuSceneRenderer} from './renderer.mjs';
import {ScenePlayer} from './player.mjs';
import {NativeSceneStream} from './native-stream.mjs';
import {verifyBinaryProbe} from './binary.mjs';
// Separate-account private QA harness. No production preference, clock,
// keymap, packet or window changes. Native HUD/input remain above the GPU view.
export async function startLiveProbe({clock,cap=1000,assetContractVerified=false}={}){
 if(!assetContractVerified)throw Error('Native artwork provenance is unverified');
 const element=document.querySelector('ruffle-player'),native=element?.ruffle();if(!native)throw Error('Native runtime missing');
 const call=(name,...args)=>native.callExternalInterface(name,...args);
 if(!verifyBinaryProbe(call('BlitzGpuBinaryProbe')))throw Error('Lossless native byte probe failed');call('BlitzGpuSetBinary',true);
 const geometry=call('BlitzGpuNativeView',false);if(!geometry?.supported)throw Error('Native geometry unavailable');
 const renderer=await GpuSceneRenderer.create({width:geometry.bitmapWidth||Math.round(geometry.width),height:geometry.bitmapHeight||Math.round(geometry.height),individualArtwork:true}),canvas=document.createElement('canvas');
 // The page must be loaded with Ruffle's transparent mode for native UI above
 // this world-only canvas. A full native framebuffer is never sampled here.
 const container=document.querySelector('#game-container');container.style.background='transparent';container.style.position='relative';container.style.zIndex='2';
 Object.assign(canvas.style,{position:'fixed',pointerEvents:'none',zIndex:'1',visibility:'hidden'});document.body.appendChild(canvas);
 const place=()=>{const g=call('BlitzGpuNativeView',false),rect=element.getBoundingClientRect();if(!g?.supported||Math.round(g.width)!==renderer.width||Math.round(g.height)!==renderer.height)throw Error('Native world resized');Object.assign(canvas.style,{left:(rect.left+g.x*rect.width/g.stageWidth)+'px',top:(rect.top+g.y*rect.height/g.stageHeight)+'px',width:(g.width*rect.width/g.stageWidth)+'px',height:(g.height*rect.height/g.stageHeight)+'px'});};place();
 let running=true,collector=null,fault='',started=null,firstNative=call('BlitzGpuStructure').afterDrawCalls;
 const restore=()=>{canvas.style.visibility='hidden';call('BlitzGpuNativeView',false);};
 let recoveries=0;const player=new ScenePlayer(renderer,{cap,delayMs:40,mode:'unlocked',clock,onReady:()=>{call('BlitzGpuNativeView',true);canvas.style.visibility='visible';if(started===null)started=performance.now();},onNative:restore,onFault:e=>{if(e.message.includes('stale')){recoveries++;}else{fault=e.message;running=false;}}}),stream=new NativeSceneStream(player,{assetContractVerified,workers:2});
 let packets=0,captureMs=0,first=performance.now(),fresh=0;
 const collect=async()=>{while(running){const requestedAt=performance.now(),request=call('BlitzGpuRequestFrame',stream.known,false);if(!request)throw Error('Native collector refused');let packet;
   for(let i=0;i<200&&running;i++){await new Promise(r=>setTimeout(r,1));packet=call('BlitzGpuFrameResult');if(packet?.request===request)break;}
   if(!running)break;if(!packet?.supported||packet.request!==request)throw Error(packet?.reason||'Native collector timed out');
   const sampledAt=Math.max(requestedAt,performance.now()-packet.captureMs);await stream.publish(packet,sampledAt);packets++;captureMs+=packet.captureMs;
   fresh=performance.now()-sampledAt<80?fresh+1:0;if(!player.running&&!player.loop&&packets>=12&&fresh>=3){player.start(canvas);}
  }};
 collector=collect().catch(async e=>{fault=e.message;running=false;await player.stop();restore();});
 const status=()=>{const elapsed=started===null?0:performance.now()-started;return {running,fault,recoveries,cap,elapsedMs:elapsed,completedFrames:player.stats.completedFrames,completedCanvasFPS:elapsed?player.stats.completedFrames*1000/elapsed:0,physicalDisplayFPS:null,nativeDrawCalls:call('BlitzGpuStructure').afterDrawCalls-firstNative,packets,captureMs,resources:stream.stats,atlasBytes:renderer.atlasBytes,textureSlots:renderer.art.length,workerCount:stream.pool.workers.length,gpu:renderer.adapterInfo,skippedUnchanged:renderer.stats.skippedUnchanged||0,firstPacketDelayMs:started===null?null:started-first,scope:'Live own-account native leaf art; distinct GPU canvas completions, not physical scanout or faster simulation'};};
 return {status,async stop(){running=false;await collector;await player.stop();const result=status();stream.close();await player.close();renderer.close();canvas.remove();call('BlitzGpuRelease');return result;}};
}
export async function startWorkerLiveProbe({cap=1000,assetContractVerified=false}={}){
 if(!assetContractVerified)throw Error('Native artwork provenance is unverified');const element=document.querySelector('ruffle-player'),native=element?.ruffle();if(!native)throw Error('Native runtime missing');const call=(name,...args)=>native.callExternalInterface(name,...args);
 if(!verifyBinaryProbe(call('BlitzGpuBinaryProbe')))throw Error('Lossless native byte probe failed');call('BlitzGpuSetBinary',true);const geometry=call('BlitzGpuNativeView',false);if(!geometry?.supported)throw Error('Native geometry unavailable');
 const canvas=document.createElement('canvas'),container=document.querySelector('#game-container'),rect=element.getBoundingClientRect();container.style.background='transparent';container.style.position='relative';container.style.zIndex='2';Object.assign(canvas.style,{position:'fixed',pointerEvents:'none',zIndex:'1',visibility:'hidden',left:(rect.left+geometry.x*rect.width/geometry.stageWidth)+'px',top:(rect.top+geometry.y*rect.height/geometry.stageHeight)+'px',width:(geometry.width*rect.width/geometry.stageWidth)+'px',height:(geometry.height*rect.height/geometry.stageHeight)+'px'});document.body.appendChild(canvas);
 const worker=new Worker(new URL('./render-worker.mjs',import.meta.url),{type:'module'}),pending=new Map();let next=0,running=true,fault='',latest={},known=[],packets=0,captureMs=0,collector,firstNative=call('BlitzGpuStructure').afterDrawCalls;
 const restore=()=>{canvas.style.visibility='hidden';call('BlitzGpuNativeView',false);};
 const request=(action,args={},transfer=[])=>new Promise((resolve,reject)=>{const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(Error('Render worker timeout'));},15000);pending.set(id,{resolve,reject,timer});worker.postMessage({channel:'blitz-gpu-render-v1',id,action,...args},transfer);});
 worker.onmessage=({data})=>{if(data?.channel!=='blitz-gpu-render-v1')return;if(data.event==='native')restore();else if(data.event==='ready'){call('BlitzGpuNativeView',true);canvas.style.visibility='visible';}else if(data.event==='status')latest=data.status;else {const task=pending.get(data.id);if(!task)return;pending.delete(data.id);clearTimeout(task.timer);if(data.error)task.reject(Error(data.error));else if(!data.result)task.reject(Error('Render worker omitted operation result'));else task.resolve(data.result);}};
 worker.onerror=()=>{fault='GPU render worker failed';running=false;restore();for(const task of pending.values()){clearTimeout(task.timer);task.reject(Error(fault));}pending.clear();};
 const artWorkerSource=(await(await fetch(new URL('./binary.mjs',import.meta.url))).text()).replaceAll('export function','function')+'\n'+(await(await fetch(new URL('./art-worker.mjs',import.meta.url))).text()).replace("import {nativeBytes} from './binary.mjs';",'');
 try {const offscreen=canvas.transferControlToOffscreen();latest=await request('init',{canvas:offscreen,width:geometry.bitmapWidth||Math.round(geometry.width),height:geometry.bitmapHeight||Math.round(geometry.height),cap,assetContractVerified,artWorkerSource,clockMode:"cooperative",clockUrl:window.__ownClockUrl},[offscreen]);}catch(error){worker.terminate();canvas.remove();throw error;}
 collector=(async()=>{while(running){const before=performance.now(),id=call('BlitzGpuRequestFrame',known,false);if(!id)throw Error('Native collector refused');let packet;for(let i=0;i<200&&running;i++){await new Promise(r=>setTimeout(r,1));packet=call('BlitzGpuFrameResult');if(packet?.request===id)break;}if(!running)break;if(!packet?.supported||packet.request!==id)throw Error(packet?.reason||'Native collector timed out');const sampledAt=Math.max(before,performance.now()-packet.captureMs),result=await request('frame',{packet,time:performance.timeOrigin+sampledAt});known=result.known;latest=result.status;packets++;captureMs+=packet.captureMs;}})().catch(error=>{fault=error.message;running=false;restore();});
 const status=()=>({...latest,running,fault:fault||latest.fault,cap,nativeDrawCalls:call('BlitzGpuStructure').afterDrawCalls-firstNative,packets,captureMs,scope:'Live own-account leaf-art GPU worker; completed changing canvas renders, not physical scanout or simulation FPS'});
 return {status,async stop(){running=false;await collector;try{latest=await request('stop');}finally{restore();worker.terminate();canvas.remove();call('BlitzGpuRelease');}return status();}};
}
