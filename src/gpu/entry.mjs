import {GpuSession} from './session.mjs';
import {AutorunShortcut,MountShortcut,rasterPlan} from './input.mjs';
import {LocalCursor} from './cursor.mjs';
let settings={},verified=false,integrated=false,visible=true,foreground=false,session=null,closingSession=null,applied='',zoom=1,revision=0,stopped=false;
function stopSession(){if(!session)return closingSession;const old=session;session=null;closingSession=old.stop().catch(()=>{}).finally(()=>{closingSession=null;});return closingSession;}
const host=window.chrome?.webview;
const send=data=>host?.postMessage(data);
const localCursor=new LocalCursor({send});
const call=(name,...args)=>{try{return document.querySelector('ruffle-player')?.ruffle().callExternalInterface(name,...args);}catch{return null;}};
const autorun=new AutorunShortcut(()=>foreground&&document.hasFocus()&&visible&&integrated?call('BlitzAutorun'):false,()=>call('BlitzStopAutorun'));
const mount=new MountShortcut(()=>foreground&&document.hasFocus()&&visible&&integrated?call('BlitzMount'):false);
const input=e=>({type:e.type==='keydown'?'keyDown':'keyUp',key:e.key,code:e.code,isAutoRepeat:e.repeat,control:e.ctrlKey,alt:e.altKey,meta:e.metaKey,shift:e.shiftKey});
for(const type of ['keydown','keyup'])addEventListener(type,e=>{if(!foreground||!visible||!document.hasFocus())return;autorun.input(input(e));mount.input(input(e));},true);
addEventListener('blur',()=>{autorun.blur();mount.reset();void localCursor.update(settings.crosshair||{style:'default'},{visible,focused:false}).catch(()=>{});});
async function configure(){
 autorun.configure(settings.autorun!==false,settings.autorunKey||'ö');mount.configure(settings.shiftMount===true);
 const key=JSON.stringify([settings,integrated,innerWidth,innerHeight,devicePixelRatio]);if(key!==applied&&integrated){
  const r=++revision,plan=rasterPlan(innerWidth*zoom,innerHeight*zoom,settings.gameZoom||1,devicePixelRatio/zoom,settings.renderResolution||1);
  const okay=call('BlitzSetWidescreen',settings.experimentalWidescreen===true);
  if(okay===true){call('BlitzSetCenteredHotbar',settings.centeredHotbar===true);call('BlitzSetCenteredCamera',settings.centeredCamera===true);call('BlitzSetMountShortcut',settings.shiftMount===true);call('BlitzShowFPS',settings.showFPS===true);
   const mix=settings.audioMix||{};call('BlitzSetAudio',...['player','music','environment','creatures'].map(k=>mix[k]??100));
   call('BlitzSetPictureZoom',settings.gameZoom||1,plan.browserZoom);send({type:'browser-zoom',value:plan.browserZoom});if(r===revision)applied=key;
   send({type:'client-integration',value:true});send({type:'audio-integration',value:true});
  }
 }
 await localCursor.update(settings.crosshair||{style:'default'},{visible,focused:foreground&&document.hasFocus()});
 if(!session&&!closingSession&&verified&&visible&&foreground&&settings.hardwareAcceleration!==false){session=new GpuSession({cap:settings.gpuFrameCap||1000,verified:()=>verified&&visible&&foreground&&!stopped,onStatus:status=>send({type:'gpu-status',status})});void session.start();}
}
host?.addEventListener('message',async({data})=>{
 if(!data||typeof data!=='object')return;
 localCursor.receive(data);
 if(data.type==='settings'){settings=data.value||{};if(session)void session.setCap(settings.gpuFrameCap||1000).catch(()=>{});applied='';}
 else if(data.type==='foreground'){foreground=data.value===true;if(!foreground){autorun.blur();mount.reset();void stopSession();}}
 else if(data.type==='assets'){verified=data.verified===true;integrated=data.integrated===true;if(!integrated){autorun.reset();mount.reset();}if(!verified){void stopSession();call('BlitzGpuNativeView',false);}}
 else if(data.type==='visibility'){visible=data.value===true;if(!visible){autorun.reset();mount.reset();call('BlitzStopAutorun');await stopSession();}}
 else if(data.type==='focus'){document.querySelector('ruffle-player')?.focus();}
 else if(data.type==='zoom'){zoom=Number(data.value)||1;}
 else if(data.type==='stop-autorun')autorun.reset();
 else if(data.type==='quit'){stopped=true;autorun.reset();await stopSession();clearInterval(timer);localCursor.close();return;}
 await configure();
});
const timer=setInterval(()=>{if(!stopped)void configure().catch(()=>{});},250);
send({type:'frontend-ready'});
