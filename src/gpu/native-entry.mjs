import {GpuSession} from './session.mjs';
// The native host continues to own settings, input, audio and scale. No browser
// keyboard handlers or game update loop are added by this presentation module.
let state={verified:false,foreground:false,visible:false,enabled:false,cap:1000},session=null,closing=null,stopped=false,blocked=false,resources={};
const status=()=>session?.status||{phase:'native',completedCanvasFPS:0,...(blocked?{reason:'GPU cleanup did not acknowledge; Original is retained until reconnect'}:{})};
async function stop(){if(!session)return closing;const old=session;session=null;closing=old.stop().catch(()=>{}).finally(()=>{blocked=blocked||old.quarantined;closing=null;});return closing;}
async function configure(value){state={...state,...value};if(stopped||blocked||session?.quarantined)return;if(!state.verified||!state.foreground||!state.visible||!state.enabled){await stop();return;}if(session){await session.setCap(state.cap);return;}if(closing){await closing;return configure({});}session=new GpuSession({cap:state.cap,nativeFlash:true,workerURL:resources.workerURL,artWorkerSource:resources.art,verified:()=>state.verified&&state.foreground&&state.visible&&state.enabled&&!stopped});await session.start();}
addEventListener('blur',()=>{state.foreground=false;void stop();});
addEventListener('pagehide',()=>{stopped=true;void stop().finally(()=>URL.revokeObjectURL(resources.workerURL));});
export function initializeNativeGpu(value){resources={...value,workerURL:URL.createObjectURL(new Blob([value.worker],{type:'text/javascript'}))};window.__blitzNativeGpu={configure,status,stop:async()=>{stopped=true;await stop();}};return true;}
