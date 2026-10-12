'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const pins={
 'BlitzGame.exe':'de34d5b8f7bec7a9312fff053e3a1481da32698320b1b2d8652c711b67244205',
 'resources/pepflashplayer64.dll':'4acafedca8bb62529527029aeb485318866e4fd71bf298e73f735bc75f6d720d'
};
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function verifyImported(target,files,required=pins){
 if(!files||typeof files!=='object'||Array.isArray(files)||Object.keys(files).length>256)throw Error('Missing complete imported runtime inventory');
 for(const [name,expected]of Object.entries(required))if(files[name]!==expected)throw Error('Unreviewed imported runtime: '+name);
 for(const [name,expected]of Object.entries(files)){
  if(!/^[A-Za-z0-9._ /-]+$/.test(name)||name.startsWith('/')||name.split('/').some(part=>!part||part==='.'||part==='..')||!/^[a-f0-9]{64}$/.test(expected))throw Error('Invalid imported runtime inventory');
  let current=target;
  for(const part of name.split('/')){current=path.join(current,part);if(fs.lstatSync(current).isSymbolicLink())throw Error('Linked imported runtime path');}
  if(!fs.statSync(current).isFile()||hash(current)!==expected)throw Error('Imported runtime missing or altered: '+name);
 }
 return files;
}
function inventorySource(source){
 const files={};
 function visit(relative){const file=path.join(source,relative);const stat=fs.lstatSync(file);if(stat.isSymbolicLink())throw Error('Linked source runtime');
  if(stat.isDirectory())for(const child of fs.readdirSync(file))visit(path.join(relative,child));
  else if(stat.isFile())files[relative==='Dungeon Blitz R.exe'?'BlitzGame.exe':relative.replaceAll('\\','/')]=hash(file);
 }
 for(const name of fs.readdirSync(source))if(!['resources','Uninstall Dungeon Blitz R.exe'].includes(name))visit(name);
 files['resources/pepflashplayer64.dll']=hash(path.join(source,'resources/vendor/flash/win32/pepflashplayer64.dll'));
 return files;
}
module.exports={verifyImported,inventorySource};
