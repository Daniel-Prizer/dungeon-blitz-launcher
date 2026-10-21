'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
function prepare(){
 const sdk=path.join(root,'.test-tools/webview2-sdk/package'),out=path.join(root,'runtime/modern'),resources=path.join(out,'resources');fs.mkdirSync(resources,{recursive:true});
 const libraries=['Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll'];
 for(const file of libraries)fs.copyFileSync(path.join(sdk,'lib/net462',file),path.join(out,file));fs.copyFileSync(path.join(sdk,'runtimes/win-x64/native/WebView2Loader.dll'),path.join(out,'WebView2Loader.dll'));
 for(const file of ['LICENSE.txt','NOTICE.txt'])fs.copyFileSync(path.join(sdk,file),path.join(out,'WebView2-'+file));
 execFileSync('C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe',['/nologo','/target:winexe','/platform:x64','/r:System.Net.Http.dll','/r:System.Web.Extensions.dll','/r:System.Drawing.dll','/r:System.Windows.Forms.dll',...libraries.map(n=>'/r:'+path.join(out,n)),'/out:'+path.join(out,'BlitzGpuHost.exe'),path.join(root,'src/gpu/GameHost.cs'),path.join(root,'src/gpu/NativeGameView.cs')],{stdio:'inherit',windowsHide:true,timeout:30000});
 for(const name of fs.readdirSync(path.join(root,'src/gpu')))if(name.endsWith('.mjs')||['assets.json','runtime.json','bootstrap.js'].includes(name))fs.copyFileSync(path.join(root,'src/gpu',name),path.join(resources,name));
 fs.copyFileSync(path.join(root,'src/crosshair.js'),path.join(resources,'crosshair.js'));
 // Reuse the tested local input classes in a browser module; no remote require.
 let binding=fs.readFileSync(path.join(root,'src/autorun-binding.js'),'utf8'),autorun=fs.readFileSync(path.join(root,'src/legacy/autorun-shortcut.cjs'),'utf8'),mount=fs.readFileSync(path.join(root,'src/legacy/mount-shortcut.cjs'),'utf8'),raster=fs.readFileSync(path.join(root,'src/legacy/rendering.cjs'),'utf8');
 binding='{const module={exports:{}};'+binding+';globalThis.__blitzBinding=module.exports;}\n';autorun=autorun.replace("const binding=require('./autorun-binding.js');","const binding=globalThis.__blitzBinding;").replace('module.exports={AutorunShortcut};','');mount=mount.replace('module.exports={MountShortcut};','');raster=raster.replace('module.exports={rasterPlan};','');fs.writeFileSync(path.join(resources,'input.mjs'),binding+autorun+mount+raster+'\nexport {AutorunShortcut,MountShortcut,rasterPlan};\n');
 return out;
}
if(require.main===module)console.log(prepare());module.exports=prepare;
