const path=require('node:path'),fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),helper=path.join(root,'.test-tools/PrivateDesktop.exe');
fs.mkdirSync(path.dirname(helper),{recursive:true});
fs.writeFileSync(path.join(root,'docs/private-desktop-test.log'),'');
execFileSync('C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe',['/nologo','/target:exe','/platform:x64',`/out:${helper}`,path.join(__dirname,'PrivateDesktop.cs')],{stdio:'inherit',windowsHide:true});
if(process.argv.includes('--focus'))process.env.BLITZ_PRIVATE_TEST='focus';
if(process.argv.includes('--render'))process.env.BLITZ_PRIVATE_TEST='render';
if(process.argv.includes('--fps'))process.env.BLITZ_PRIVATE_TEST='fps';
if(process.argv.includes('--transition')){process.env.BLITZ_PRIVATE_TEST='transition';execFileSync(process.execPath,[path.join(__dirname,'prepare-transition-fixture.cjs')],{windowsHide:true,stdio:'inherit'});}
if(process.argv.includes('--window'))process.env.BLITZ_PRIVATE_TEST='window';
if(process.argv.includes('--margins')){process.env.BLITZ_PRIVATE_TEST='margins';execFileSync(process.execPath,[path.join(__dirname,'prepare-margin-fixture.cjs')],{windowsHide:true,stdio:'inherit'});}
try{execFileSync(helper,[process.execPath,path.join(__dirname,'private-desktop-test.cjs')],{stdio:'inherit',windowsHide:true,timeout:245000})}
finally{const log=path.join(root,'docs/private-desktop-test.log');if(fs.existsSync(log))process.stdout.write(fs.readFileSync(log))}
