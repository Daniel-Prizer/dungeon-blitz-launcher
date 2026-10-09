const fs=require('node:fs'),path=require('node:path'),https=require('node:https');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.test-tools/focus'),jar=path.join(dir,'ffdec/ffdec.jar');
const source='https://dungeonblitzr.theminesa.studio/p/cbp/DungeonBlitz.swf?fv=cbp&gv=cbp&clientrev=swf-d7fadc1f5c3f';
function download(url,file){return new Promise((resolve,reject)=>{https.get(url,{headers:{'User-Agent':'DungeonBlitzLauncher-tests'}},response=>{
  if(response.statusCode>=300&&response.statusCode<400&&response.headers.location){response.resume();return download(new URL(response.headers.location,url).href,file).then(resolve,reject);}
  if(response.statusCode!==200){response.resume();return reject(new Error('Fixture download failed: '+response.statusCode));}
  const stream=fs.createWriteStream(file);response.pipe(stream);stream.on('finish',()=>stream.close(resolve));stream.on('error',reject);
}).on('error',reject);});}
(async()=>{
 fs.mkdirSync(dir,{recursive:true});
 if(!fs.existsSync(jar)){
  const zip=path.join(dir,'ffdec.zip');await download('https://github.com/jindrapetrik/jpexs-decompiler/releases/download/version26.3.0/ffdec_26.3.0.zip',zip);
  execFileSync('powershell.exe',['-NoProfile','-Command',`Expand-Archive -LiteralPath '${zip.replaceAll("'","''")}' -DestinationPath '${path.join(dir,'ffdec').replaceAll("'","''")}' -Force`],{windowsHide:true,stdio:'inherit'});
 }
 if(!fs.existsSync(path.join(dir,'live.swf')))await download(source,path.join(dir,'live.swf'));
 execFileSync('java',['-Djava.awt.headless=true','-jar',jar,'-importScript',path.join(dir,'live.swf'),path.join(dir,'input-probe.swf'),path.join(root,'test/fixtures')],{windowsHide:true,stdio:'inherit'});
 console.log('Prepared isolated Flash stage input fixture.');
})().catch(e=>{console.error(e);process.exitCode=1});
