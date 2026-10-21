import {GpuSceneRenderer} from './renderer.mjs';
import {GlSceneRenderer} from './renderer-gl.mjs';
import {ScenePlayer} from './player.mjs';
import {NativeSceneStream} from './native-stream.mjs';
import {PulseClock} from './pulse-clock.mjs';
import {CooperativeClock} from './cooperative-clock.mjs';
let player,stream,renderer,canvas,busy=false,fresh=0,started=null,recoveries=0,fault='',timer,idle,releaseIdle,nativeGl=false,stopping=false,sourceStarted=null;
const status=()=>{const elapsed=started===null?0:performance.now()-started,sourceElapsed=sourceStarted===null?0:performance.now()-sourceStarted;return {elapsedMs:elapsed,completedFrames:player?.stats.completedFrames||0,completedCanvasFPS:elapsed?player.stats.completedFrames*1000/elapsed:0,sourceSnapshotsFPS:sourceElapsed?stream.stats.packets*1000/sourceElapsed:0,physicalDisplayFPS:null,resources:stream?.stats,atlasBytes:renderer?.atlasBytes,textureSlots:renderer?.art.length,workerCount:stream?.pool.workers.length,gpu:renderer?.adapterInfo,skippedUnchanged:renderer?.stats.skippedUnchanged||0,recoveries,fault};};
self.onmessage=async({data})=>{if(data?.channel!=='blitz-gpu-render-v1')return;const {id,action}=data;const send=value=>self.postMessage({channel:'blitz-gpu-render-v1',...value});
 if(action==='cap'){try{player.setCap(data.cap);send({id,result:status()});}catch(error){send({id,error:error.message});}return;}
 try{
 if(action==='stop'){stopping=true;if(busy)await idle;}
 if(busy)throw Error('Render worker transaction already pending');busy=true;
 idle=new Promise(resolve=>{releaseIdle=resolve;});
 if(action==='init'){canvas=data.canvas;nativeGl=data.backend==='native-flash-webgl2';renderer=nativeGl?await GlSceneRenderer.create({width:data.width,height:data.height,canvas}):await GpuSceneRenderer.create({width:data.width,height:data.height,individualArtwork:true});let clock;if(data.clockMode==='cooperative')clock=new CooperativeClock();else{const socket=new WebSocket(data.clockUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});clock=new PulseClock(socket);}
  player=new ScenePlayer(renderer,{cap:data.cap,delayMs:data.delayMs??40,mode:'unlocked',clock,onReady:()=>{if(started===null)started=performance.now();send({event:'ready'});},onSceneReady:()=>send({event:'ready'}),onNative:()=>send({event:'native'}),onFault:error=>{if(error.message.includes('stale'))recoveries++;else fault=error.message;}});stream=new NativeSceneStream(player,{assetContractVerified:data.assetContractVerified,workers:2,workerSource:data.artWorkerSource});timer=setInterval(()=>send({event:'status',status:status()}),200);send({id,result:status()});
 }else if(action==='frame'){const time=data.time-performance.timeOrigin;await stream.publish(data.packet,time);if(sourceStarted===null)sourceStarted=time;fresh=performance.now()-time<80?fresh+1:0;if(!stopping&&!fault&&!player.running&&!player.loop&&stream.stats.packets>=12&&fresh>=3)player.start(canvas);if(fault)throw Error(fault);send({id,result:{known:stream.known,status:status()}});
 }else if(action==='stop'){clearInterval(timer);if(player)await player.stop();const result=status();stream?.close();if(player)await player.close();if(!nativeGl)renderer?.close();send({id,result});if(nativeGl)setTimeout(()=>self.close(),0);}else throw Error('Unknown render worker operation');
 }catch(error){fault=String(error?.message||error);send({event:'native'});send({id,error:fault});}finally{busy=false;releaseIdle?.();}};
