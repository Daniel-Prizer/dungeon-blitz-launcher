const fs=require('node:fs'),path=require('node:path'),https=require('node:https');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.test-tools/focus'),jar=path.join(dir,'ffdec/ffdec.jar');
const latest=process.argv.includes('--latest'),current=process.argv.includes('--current');
if(latest&&current)throw Error('Choose one reviewed client revision');
const revision=latest?'latest':current?'current':'live';
const clientrev=latest?'7a3486bf928a':current?'7a652582ebf5':'d7fadc1f5c3f';
const source='https://dungeonblitzr.theminesa.studio/p/cbp/DungeonBlitz.swf?fv=cbp&gv=cbp&clientrev=swf-'+clientrev;
function download(url,file){return new Promise((resolve,reject)=>{https.get(url,{headers:{'User-Agent':'DungeonBlitzLauncher-tests'}},response=>{
  if(response.statusCode>=300&&response.statusCode<400&&response.headers.location){response.resume();return download(new URL(response.headers.location,url).href,file).then(resolve,reject);}
  if(response.statusCode!==200){response.resume();return reject(new Error('Fixture download failed: '+response.statusCode));}
  const stream=fs.createWriteStream(file);response.pipe(stream);stream.on('finish',()=>stream.close(resolve));stream.on('error',reject);
}).on('error',reject);});}
(async()=>{
 fs.mkdirSync(dir,{recursive:true});
 if(!fs.existsSync(jar)){
  const zip=path.join(dir,'ffdec.zip');await download('https://github.com/jindrapetrik/jpexs-decompiler/releases/download/version26.3.0/ffdec_26.3.0.zip',zip);
  if(require('node:crypto').createHash('sha256').update(fs.readFileSync(zip)).digest('hex')!=='35f4930eb7c380afe66f2117f90b006deac0631473ad7500bb39c78f68645ecd')throw Error('JPEXS release checksum mismatch');
  execFileSync('powershell.exe',['-NoProfile','-Command',`Expand-Archive -LiteralPath '${zip.replaceAll("'","''")}' -DestinationPath '${path.join(dir,'ffdec').replaceAll("'","''")}' -Force`],{windowsHide:true,stdio:'inherit'});
 }
 const file=path.join(dir,revision+'.swf');
 if(!fs.existsSync(file))await download(source,file);
 const expected=require('../src/legacy/client-layout'+(revision==='live'?'':'-'+revision)+'.json').inputHash;
 if(require('node:crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==expected)throw Error('Source client changed; review the new revision before building adapters');
 if(current||latest){console.log('Verified '+revision+' reviewed game revision.');return;}
 execFileSync('java',['-Djava.awt.headless=true','-jar',jar,'-importScript',path.join(dir,'live.swf'),path.join(dir,'input-probe.swf'),path.join(root,'test/fixtures')],{windowsHide:true,stdio:'inherit'});
 console.log('Prepared isolated Flash stage input fixture.');
})().catch(e=>{console.error(e);process.exitCode=1});
