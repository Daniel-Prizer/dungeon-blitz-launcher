const test=require('node:test'),path=require('node:path'),fs=require('node:fs'),{execFileSync}=require('node:child_process');
test('game accessibility shortcut guard restores settings without touching real Windows preferences',()=>{
 const root=path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(root,'.test-tools/accessibility-')),exe=path.join(folder,'probe.exe');
 execFileSync('C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe',['/nologo','/target:exe','/r:System.Web.Extensions.dll',`/out:${exe}`,path.join(root,'src/AccessibilityShortcuts.cs'),path.join(__dirname,'AccessibilityTests.cs')],{windowsHide:true});
 execFileSync(exe,[folder],{windowsHide:true,stdio:'inherit'});
});
