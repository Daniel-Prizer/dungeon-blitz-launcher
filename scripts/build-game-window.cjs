const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),cache=path.join(root,'.test-tools');
const archive=path.join(cache,'zig.zip'),compiler=path.join(cache,'zig/zig-windows-x86_64-0.13.0/zig.exe');
const checksum='d859994725ef9402381e557c60bb57497215682e355204d754ee3df75ee3c158';
async function download(url,file){const response=await fetch(url);if(!response.ok)throw Error('Build download failed: '+response.status);fs.writeFileSync(file,Buffer.from(await response.arrayBuffer()));}
module.exports=async function buildGameWindow(){
 fs.mkdirSync(cache,{recursive:true});
 if(!fs.existsSync(compiler)){
  if(!fs.existsSync(archive))await download('https://ziglang.org/download/0.13.0/zig-windows-x86_64-0.13.0.zip',archive);
  if(crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex')!==checksum)throw Error('Compiler checksum mismatch');
  execFileSync('powershell.exe',['-NoProfile','-Command','Expand-Archive -LiteralPath $env:BLITZ_COMPILER_ZIP -DestinationPath $env:BLITZ_COMPILER_DIR -Force'],{env:{...process.env,BLITZ_COMPILER_ZIP:archive,BLITZ_COMPILER_DIR:path.join(cache,'zig')},windowsHide:true,stdio:'inherit'});
 }
 const headers=path.join(cache,'node-api');fs.mkdirSync(headers,{recursive:true});
 for(const name of ['node_api.h','node_api_types.h','js_native_api.h','js_native_api_types.h']){
  const file=path.join(headers,name);if(!fs.existsSync(file))await download('https://raw.githubusercontent.com/nodejs/node/v24.19.0/src/'+name,file);
 }
 const target=path.join(root,'runtime/game/resources/game-window.node'),built=path.join(cache,'native-build/game-window.node');
 fs.mkdirSync(path.dirname(target),{recursive:true});fs.mkdirSync(path.dirname(built),{recursive:true});
 execFileSync(compiler,['cc','-target','x86_64-windows-gnu','-shared','-O2','-s','-Wall','-Wextra','-Wno-unused-parameter','-std=c11','-I',headers,path.join(root,'src/GameWindow.c'),'-o',built,'-lcomctl32','-luser32','-lkernel32'],{windowsHide:true,stdio:'inherit'});
 fs.copyFileSync(built,target);
 const importLibrary=path.join(path.dirname(target),'GameWindow.lib');if(fs.existsSync(importLibrary))fs.unlinkSync(importLibrary);
 console.log('Built game window input boundary.');
};
