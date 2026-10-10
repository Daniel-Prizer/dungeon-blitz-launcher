'use strict';
const crypto=require('node:crypto');
const path=require('node:path');
const REPO='Daniel-Prizer/dungeon-blitz-launcher';
function version(value){if(typeof value!=='string'||!/^\d{1,5}\.\d{1,5}\.\d{1,5}$/.test(value))throw Error('Invalid update version');return value.split('.').map(Number);}
function newer(a,b){const x=version(a),y=version(b);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i];return false;}
function safePath(value){
 if(typeof value!=='string'||value.length>240||value.includes('\\')||value.startsWith('/')||/[\x00-\x1f:]/.test(value))return false;
 return value.split('/').every(part=>part&&part!=='.'&&part!=='..'&&!/[. ]$/.test(part)&&!/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part));
}
function verifyManifest(envelope,key,current){
 if(!envelope||typeof envelope.payload!=='string'||typeof envelope.signature!=='string'||envelope.payload.length>4000000)throw Error('Invalid signed update manifest');
 const payload=Buffer.from(envelope.payload,'base64'),signature=Buffer.from(envelope.signature,'base64');
 if(signature.length!==64||signature.toString('base64')!==envelope.signature||payload.toString('base64')!==envelope.payload||!crypto.verify(null,payload,key,signature))throw Error('Update signature verification failed');
 const m=JSON.parse(payload);if(m.schema!==1||m.platform!=='win32-x64'||!newer(m.version,current))throw Error('Update platform/version rejected');
 const expected=`Dungeon-Blitz-Launcher-${m.version}-win64.zip`;
 if(m.zip?.name!==expected||!Number.isSafeInteger(m.zip.size)||m.zip.size<1||m.zip.size>600000000||!/^[a-f0-9]{64}$/.test(m.zip.sha256))throw Error('Invalid update archive');
 if(!Array.isArray(m.files)||!m.files.length||m.files.length>8000)throw Error('Invalid update file list');
 let bytes=0;const paths=new Set();for(const file of m.files){
  if(!safePath(file.path)||(!file.path.startsWith(`release/${m.version}/Dungeon Blitz Launcher-win32-x64/`)&&file.path!=='Dungeon Blitz Launcher.exe')||paths.has(file.path.toLowerCase())||!Number.isSafeInteger(file.size)||file.size<0||!/^[a-f0-9]{64}$/.test(file.sha256))throw Error('Invalid update file');
  paths.add(file.path.toLowerCase());bytes+=file.size;
 }
 if(bytes>1800000000||!paths.has('dungeon blitz launcher.exe')||!paths.has(`release/${m.version}/dungeon blitz launcher-win32-x64/dungeon blitz launcher.exe`))throw Error('Incomplete update payload');
 return m;
}
function releaseAsset(version,name){return `https://github.com/${REPO}/releases/download/v${version}/${name}`;}
function allowedDownload(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.port&&!u.username&&!u.password&&(u.hostname==='github.com'||u.hostname==='api.github.com'||u.hostname==='release-assets.githubusercontent.com'||u.hostname==='objects.githubusercontent.com');}catch{return false;}}
function installationRoot(executable,current){
 version(current);const folder=path.dirname(path.resolve(executable)),releaseVersion=path.dirname(folder),releases=path.dirname(releaseVersion);
 if(path.basename(executable).toLowerCase()!=='dungeon blitz launcher.exe'||path.basename(folder).toLowerCase()!=='dungeon blitz launcher-win32-x64'||path.basename(releaseVersion)!==current||path.basename(releases).toLowerCase()!=='release')return null;
 return path.dirname(releases);
}
module.exports={REPO,version,newer,safePath,verifyManifest,releaseAsset,allowedDownload,installationRoot};
