'use strict';
// Build dependency only. Pin the official SDK bytes; never download a compiler
// or executable from the game page. Its loader is checked with Windows trust.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),folder=path.join(root,'.test-tools/webview2-sdk'),file=path.join(folder,'sdk.zip');
const url='https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/1.0.4258.31/microsoft.web.webview2.1.0.4258.31.nupkg',expected='56f7f4b8bf9aee4b8efefbbdd4f67d5f74ebd1b100ed0806da71bf76af481aa9';
module.exports=async()=>{fs.mkdirSync(folder,{recursive:true});if(!fs.existsSync(file)){const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(30000)});if(!response.ok||Number(response.headers.get('content-length'))>16*1024*1024)throw Error('Official WebView2 SDK unavailable');const parts=[];let size=0;for await(const part of response.body){size+=part.length;if(size>16*1024*1024)throw Error('WebView2 SDK too large');parts.push(part);}const bytes=Buffer.concat(parts);if(crypto.createHash('sha256').update(bytes).digest('hex')!==expected)throw Error('WebView2 SDK hash changed');fs.writeFileSync(file,bytes,{flag:'wx'});}
 if(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==expected)throw Error('Cached WebView2 SDK verification failed');
 const packageDir=path.join(folder,'package');execFileSync('pwsh.exe',['-NoProfile','-NonInteractive','-File',path.join(__dirname,'unpack-webview-sdk.ps1'),file,packageDir],{windowsHide:true});return packageDir;
};
if(require.main===module)module.exports().then(()=>console.log('Verified official WebView2 SDK')).catch(error=>{console.error(error.message);process.exitCode=1;});
