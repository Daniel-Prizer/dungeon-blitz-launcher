'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),version=require('../package.json').version;
const output=path.join(root,'release',version);fs.mkdirSync(output,{recursive:true});const payload=fs.mkdtempSync(path.join(output,'update-payload-'));
const build=`release/${version}/Dungeon Blitz Launcher-win32-x64`;
fs.cpSync(path.join(root,build),path.join(payload,build),{recursive:true});fs.copyFileSync(path.join(root,'Dungeon Blitz Launcher.exe'),path.join(payload,'Dungeon Blitz Launcher.exe'));
const files=[];function walk(relative=''){for(const entry of fs.readdirSync(path.join(payload,relative),{withFileTypes:true})){const name=relative?relative+'/'+entry.name:entry.name;if(entry.isDirectory())walk(name);else{const data=fs.readFileSync(path.join(payload,name));files.push({path:name,size:data.length,sha256:crypto.createHash('sha256').update(data).digest('hex')});}}}walk();
const zip=path.join(output,`Dungeon-Blitz-Launcher-${version}-win64.zip`);
// Structured arguments to PowerShell; no string-built paths or commands.
execFileSync('powershell.exe',['-NoProfile','-File',path.join(__dirname,'zip-release.ps1'),payload,zip],{windowsHide:true,stdio:'inherit'});
const bytes=fs.readFileSync(zip),manifest=Buffer.from(JSON.stringify({schema:1,version,platform:'win32-x64',zip:{name:path.basename(zip),size:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')},files}));
const key=fs.readFileSync(path.join(process.env.USERPROFILE,'.codex/keys/dungeon-blitz-updates-ed25519.pem'));
const signed={payload:manifest.toString('base64'),signature:crypto.sign(null,manifest,key).toString('base64')};
require('../src/update-policy.cjs').verifyManifest(signed,fs.readFileSync(path.join(root,'src/update-key.pem')),'0.0.0');
fs.writeFileSync(path.join(output,`Dungeon-Blitz-Launcher-${version}-update.json`),JSON.stringify(signed));
fs.writeFileSync(zip+'.sha256',`${crypto.createHash('sha256').update(bytes).digest('hex')}  ${path.basename(zip)}\n`);
fs.rmSync(payload,{recursive:true,force:true});
console.log(`Signed ${files.length} packaged files for v${version}; private key remains outside the repository.`);
