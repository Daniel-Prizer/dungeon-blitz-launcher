'use strict';
// Optional offline experiment. Nothing here launches a game, captures a screen,
// sends input or ships in the executable. All models/binaries stay ignored.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Readable}=require('node:stream'),{pipeline}=require('node:stream/promises');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.test-tools/rife');
const release='20221029',url=`https://github.com/nihui/rife-ncnn-vulkan/releases/download/${release}/rife-ncnn-vulkan-${release}-windows.zip`;
(async()=>{
 fs.mkdirSync(dir,{recursive:true});const zip=path.join(dir,'release.zip');
 if(process.argv.includes('--download')){
  if(!fs.existsSync(zip)){const r=await fetch(url);if(!r.ok)throw Error('RIFE release download failed');await pipeline(Readable.fromWeb(r.body),fs.createWriteStream(zip));}
  const hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(zip))hash.update(chunk);
  fs.writeFileSync(path.join(dir,'provenance.json'),JSON.stringify({url,release,sha256:hash.digest('hex'),note:'Official release URL; upstream asset supplies no separate checksum. Offline experiment only; never bundled.'},null,2));
  execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Add-Type -AssemblyName System.IO.Compression.FileSystem
$rifeRoot=[IO.Path]::GetFullPath($env:BLITZ_RIFE_ROOT)
$rifeZip=[IO.Compression.ZipFile]::OpenRead((Join-Path $rifeRoot 'release.zip'))
try {foreach($relative in @('rife-ncnn-vulkan.exe','rife-v4.6/flownet.bin','rife-v4.6/flownet.param')) {
 $target=[IO.Path]::GetFullPath((Join-Path $rifeRoot $relative))
 if(-not $target.StartsWith($rifeRoot+'\\',[StringComparison]::OrdinalIgnoreCase)){throw 'Outside research directory'}
 [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target)) | Out-Null
 $entry=$rifeZip.GetEntry('rife-ncnn-vulkan-20221029-windows/'+$relative)
 if(-not $entry){throw 'Missing selected release file'}
 [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$target,$true)
}} finally {$rifeZip.Dispose()}`],{windowsHide:true,env:{...process.env,BLITZ_RIFE_ROOT:dir}});
  console.log('Downloaded official RIFE release for offline experiments.');return;
 }
 const exe=path.join(dir,'rife-ncnn-vulkan.exe'),model=path.join(dir,'rife-v4.6');
 execFileSync(path.join(root,'.test-tools/PrivateDesktop.exe'),['--check'],{windowsHide:true});
 if(!fs.existsSync(exe))throw Error('Download and extract the selected official RIFE executable/model first.');
 const width=process.env.BLITZ_RIFE_WIDTH==='640'?640:1280,height=width*9/16,count=96,encode=require('./png.cjs'),scale=width/1280;
 const input=path.join(dir,'input-'+width),output=path.join(dir,'output-'+width);fs.mkdirSync(input,{recursive:true});fs.mkdirSync(output,{recursive:true});
 for(let i=0;i<count;i++){
  const rgba=Buffer.alloc(width*height*3);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const o=(y*width+x)*3,moving=x>=(80+i*8)*scale&&x<(160+i*8)*scale&&y>=280*scale&&y<360*scale;
   rgba[o]=moving?215:72;rgba[o+1]=moving?165:73;rgba[o+2]=moving?65:85;
  }
  fs.writeFileSync(path.join(input,String(i).padStart(4,'0')+'.png'),encode(width,height,rgba,3));
 }
 const start=process.hrtime.bigint();
 const run=require('node:child_process').spawnSync(exe,['-i',input,'-o',output,'-n',String(count*2-1),'-m',model,'-g','0','-j','1:1:1'],{windowsHide:true,timeout:180000,maxBuffer:2*1024*1024,encoding:'utf8'});
 if(run.error||run.status!==0)throw run.error||Error(run.stderr);const log=run.stdout+run.stderr;
 const seconds=Number(process.hrtime.bigint()-start)/1e9;
 const names=fs.readdirSync(output).filter(n=>n.endsWith('.png')).sort();
 const positions=names.slice(0,5).map(name=>{const im=require('./decode-png.cjs')(fs.readFileSync(path.join(output,name)));let sum=0,n=0;for(let y=280*scale;y<360*scale;y++)for(let x=0;x<width;x++){const at=(y*width+x)*im.channels;if(im.pixels[at]>170&&im.pixels[at+1]>130){sum+=x;n++;}}return sum/n;});
 // RIFE distributes output timestamps across the input duration. Added frames
 // must occupy intermediate positions, never advance the simulation clock.
 require('node:assert/strict')(positions[1]>positions[0]+scale&&positions[1]<positions[2]-scale,'The neural intermediate must lie between real source positions');
 const result={width,height,inputFrames:count,outputFrames:names.length,firstPositions:positions,sourceDurationSeconds:(count-1)/60,interpolatedDurationSeconds:(names.length-1)/120,wallSeconds:seconds,generatedFramesPerSecond:(count-1)/seconds,model:'rife-v4.6',log,limit:'Offline bulk interpolation includes model load, file decoding/encoding and source copies. This is not live latency or game performance. A resident live GPU implementation and input-to-display measurements are still required.'};
 require('node:assert/strict').equal(result.sourceDurationSeconds,result.interpolatedDurationSeconds);
 fs.writeFileSync(path.join(dir,'results-'+width+'.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
})().catch(e=>{fs.writeFileSync(path.join(dir,'error.log'),String(e.stack));console.error(e);process.exitCode=1;});
