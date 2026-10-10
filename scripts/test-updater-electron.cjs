'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
if(process.argv.includes('--private')){
 execFileSync(path.join(root,'.test-tools/PrivateDesktop.exe'),['--check'],{windowsHide:true});
 const config=process.env.BLITZ_UPDATER_TEST_CONFIG;
 if(!config||path.dirname(path.dirname(config))!==path.join(root,'.test-tools'))throw Error('Invalid updater test directory');
 try{execFileSync(require('electron'),[path.join(__dirname,'updater-electron-fixture.cjs')],{windowsHide:true,stdio:'pipe',timeout:30000});}
 finally{const log=path.join(path.dirname(config),'result.json');if(fs.existsSync(log))process.stdout.write(fs.readFileSync(log,'utf8')+'\n');}
}else (async()=>{
 const directory=fs.mkdtempSync(path.join(root,'.test-tools/electron-updater-')),source=path.join(directory,'source'),version='9.9.9';
 const build=`release/${version}/Dungeon Blitz Launcher-win32-x64`,content=path.join(directory,'asar-content');fs.mkdirSync(content);fs.writeFileSync(path.join(content,'example.txt'),'archive contents must never be walked or executed');
 for(const file of ['Dungeon Blitz Launcher.exe',`${build}/Dungeon Blitz Launcher.exe`]){const full=path.join(source,file);fs.mkdirSync(path.dirname(full),{recursive:true});fs.writeFileSync(full,'non-executable fixture');}
 const archivePath=`${build}/resources/app.asar`;fs.mkdirSync(path.dirname(path.join(source,archivePath)),{recursive:true});await require('@electron/asar').createPackage(content,path.join(source,archivePath));
 const zip=path.join(directory,'payload.zip');execFileSync('powershell.exe',['-NoProfile','-File',path.join(__dirname,'zip-release.ps1'),source,zip],{windowsHide:true});
 const digest=data=>crypto.createHash('sha256').update(data).digest('hex'),bytes=fs.readFileSync(zip);
 const files=['Dungeon Blitz Launcher.exe',`${build}/Dungeon Blitz Launcher.exe`,archivePath].map(relative=>{const data=fs.readFileSync(path.join(source,relative));return {path:relative,size:data.length,sha256:digest(data)};});
 const manifest={schema:1,platform:'win32-x64',version,zip:{name:`Dungeon-Blitz-Launcher-${version}-win64.zip`,size:bytes.length,sha256:digest(bytes)},files},pair=crypto.generateKeyPairSync('ed25519'),payload=Buffer.from(JSON.stringify(manifest));
 const config={directory,source,zip,manifest,publicKey:pair.publicKey.export({type:'spki',format:'pem'}),envelope:{payload:payload.toString('base64'),signature:crypto.sign(null,payload,pair.privateKey).toString('base64')},helper:path.join(root,'runtime/UpdateInstaller.exe'),module:process.argv.includes('--packaged')?path.join(root,`release/${require('../package.json').version}/Dungeon Blitz Launcher-win32-x64/resources/app.asar/src/updater.cjs`):path.join(root,'src/updater.cjs')};
 const configFile=path.join(directory,'config.json');fs.writeFileSync(configFile,JSON.stringify(config));process.env.BLITZ_UPDATER_TEST_CONFIG=configFile;
 const helper=path.join(root,'.test-tools/PrivateDesktop.exe');execFileSync('C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe',['/nologo','/target:exe','/platform:x64',`/out:${helper}`,path.join(__dirname,'PrivateDesktop.cs')],{windowsHide:true});
 try{execFileSync(helper,[process.execPath,path.join(__dirname,'updater-electron-private.cjs')],{windowsHide:true,stdio:'inherit',timeout:45000});}
 finally{const log=path.join(directory,'result.json');if(fs.existsSync(log))console.log(fs.readFileSync(log,'utf8'));}
 const result=JSON.parse(fs.readFileSync(path.join(directory,'result.json')));if(!result.passed)throw Error(result.error);console.log('PASS actual Electron ASAR update verification, tamper rejection and cleanup');
})().catch(error=>{console.error(error);process.exitCode=1;});
