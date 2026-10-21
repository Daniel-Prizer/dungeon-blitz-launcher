'use strict';
const {EventEmitter}=require('node:events'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {LegacyRuntime}=require('./legacy-runtime.cjs');
const {adaptGpuClient}=require('./gpu/client-adapter.cjs');
const recipe=require('./gpu/adapter.json');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function modernAddress(value){try{const u=new URL(value);if(u.protocol!=='https:'||u.port||u.username||u.password||!['/','/web','/web/'].includes(u.pathname)||!['dungeonblitzr.theminesa.studio','dungeonblitz.theminesa.studio'].includes(u.hostname))return null;const url=new URL('https://dungeonblitz.theminesa.studio/web'),lang=u.searchParams.get('lang');if(lang&&/^[a-z-]{2,8}$/i.test(lang))url.searchParams.set('lang',lang);return url.href;}catch{return null;}}
async function publicBytes(url,limit,signal){const response=await fetch(url,{redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(25000)]):AbortSignal.timeout(25000),credentials:'omit'});if(!response.ok||Number(response.headers.get('content-length'))>limit)throw Error('Public game resource unavailable');const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>limit)throw Error('Public game resource exceeds limit');chunks.push(chunk);}return Buffer.concat(chunks);}
class ModernRuntime extends EventEmitter{
 constructor(root,parent,test,privateDesktop,address,acceleration=true){super();this.root=root;this.closed=false;this.pending=[];this.abort=new AbortController();this.scratch=fs.mkdtempSync(path.join(os.tmpdir(),'blitz-gpu-'));void this.initialize(parent,test,privateDesktop,address,acceleration).catch(error=>{if(!this.closed)this.emit('failure',error.message);this.cleanup();});}
 async initialize(parent,test,privateDesktop,address,acceleration){
  const url=modernAddress(address);if(!url)throw Error('GPU rendering currently supports the official multiplayer game. Choose Original for a local server.');
  const html=(await publicBytes(url,1024*1024,this.abort.signal)).toString('utf8'),match=html.match(/(?:https:\/\/(?:dungeonblitzr|dungeonblitz)\.theminesa\.studio)?\/p\/[a-z]{3}\/DungeonBlitz\.swf\?[^\s"'<>`$]+/);if(!match)throw Error('Official game client address changed. Choose Original while compatibility is reviewed.');
  const source=await publicBytes(new URL(match[0].replaceAll('&amp;','&'),url).href,4*1024*1024,this.abort.signal),patched=adaptGpuClient(source,recipe),file=path.join(this.scratch,'client.swf');if(patched)fs.writeFileSync(file,patched,{flag:'wx'});
  const config=path.join(this.scratch,'host.json');fs.writeFileSync(config,JSON.stringify({url,resources:path.join(this.root,'modern/resources'),profile:path.join(process.env.APPDATA,test?'BlitzBrowser-Gpu-Test':'BlitzBrowser-Gpu'),sourceHash:recipe.sourceSha256,patched:file,patchedHash:patched?hash(patched):'',engineHash:'5822ddb03354ef0bf3ecaac38d52516ec2a616124be1f10f38ca5d2a9d64508f'}),{flag:'wx'});
  if(this.closed){this.cleanup();return;}
  const child=this.inner=new LegacyRuntime(this.root,parent,test,privateDesktop,url,acceleration,{modern:true,config,onExit:()=>this.cleanup()});
  for(const name of ['ready','failure','status','event','cursor-setting','key'])child.on(name,(...args)=>{if(name==='event'&&args[0]?.type==='gpu-status')this.gpuStatus=args[0].status;if(!this.closed)this.emit(name,...args);});
  for(const [method,args]of this.pending)child[method](...args);this.pending=[];
 }
 dispatch(method,args){if(this.closed)return;if(this.inner)this.inner[method](...args);else if(this.pending.length<100)this.pending.push([method,args]);}
 configure(...args){this.dispatch('configure',args);}resize(...args){this.dispatch('resize',args);}focus(){this.dispatch('focus',[]);}send(...args){this.dispatch('send',args);}testHost(...args){this.dispatch('testHost',args);}
 close(){if(this.closed)return;this.closed=true;this.abort.abort();this.inner?.close();if(!this.inner)this.cleanup();else setTimeout(()=>this.cleanup(),4000).unref();}
 cleanup(){// Only this class's newly created temporary directory is removable.
  if(this.scratch&&path.dirname(this.scratch)===os.tmpdir()&&path.basename(this.scratch).startsWith('blitz-gpu-'))try{fs.rmSync(this.scratch,{recursive:true,force:true});}catch{}
 }
}
for(const key of ['clientIntegration','audioIntegration','cursorState','audioState','originalPointer'])Object.defineProperty(ModernRuntime.prototype,key,{get(){return this.inner?.[key];},set(value){if(this.inner)this.inner[key]=value;}});
module.exports={ModernRuntime,modernAddress,publicBytes};
