'use strict';
const path=require('node:path'),fs=require('node:fs'),{EventEmitter}=require('node:events');
const {ports}=require('./legacy/singleplayer-network.cjs');
const environment=source=>Object.fromEntries(Object.entries(source).filter(([key])=>/^(SYSTEMROOT|WINDIR|SYSTEMDRIVE|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|LANG|LC_ALL|TZ)$/i.test(key)));
class Singleplayer extends EventEmitter{
 constructor({bundle,dataDir,fork,entry=path.join(__dirname,'singleplayer-child.cjs')}){super();Object.assign(this,{bundle,dataDir,fork,entry});this.status={phase:'stopped'};}
 update(status){this.status=status;this.emit('status');}
 start(){
  if(this.stopping)return this.stopping.then(()=>this.start());
  if(this.starting)return this.starting;
  if(this.connection)return Promise.resolve(this.connection);
  if(this.child)return this.exited.then(()=>this.start());
  this.starting=this.launch().finally(()=>{this.starting=null;});return this.starting;
 }
 async launch(){
  if(!fs.existsSync(path.join(this.bundle,'provenance.json')))throw Error('The singleplayer server is missing. Install the complete launcher using Setup.');
  this.update({phase:'starting'});
  const child=this.fork(this.entry,[this.bundle,this.dataDir,String(process.pid)],{env:environment(process.env),stdio:'ignore',serviceName:'Dungeon Blitz singleplayer'});this.child=child;
  const send=message=>{try{if(child.postMessage)child.postMessage(message);else if(child.connected)child.send(message,()=>{});}catch{}};this.send=send;
  this.exited=new Promise(resolve=>child.once('exit',code=>{clearInterval(this.ping);this.child=null;this.connection=null;this.update({phase:this.stopping?'stopped':'error',...(this.stopping?{}:{error:'Singleplayer stopped. Reconnect to start it again.'})});resolve(code);}));
  this.ping=setInterval(()=>send({type:'ping'}),2000);this.ping.unref();
  return new Promise((resolve,reject)=>{
   let settled=false;
   const fail=message=>{if(settled)return;settled=true;clearTimeout(timer);this.update({phase:'error',error:message});send({type:'stop'});reject(Error(message));};
   const timer=setTimeout(()=>fail('Singleplayer took too long to start. Reconnect to retry.'),30000);
   child.once('exit',()=>fail('The private singleplayer server could not start.'));
   child.on('message',message=>{
    if(message?.type==='failure'){if(!settled)fail(String(message.message).slice(0,200));else this.update({phase:'error',error:'Singleplayer encountered an error. Reconnect to retry.'});return;}
    if(message?.type!=='ready'||settled)return;
    if(!ports(message.ports)||message.url!==`http://localhost:${message.ports.http}/`||message.pid!==child.pid)return fail('Invalid singleplayer startup acknowledgement.');
    settled=true;clearTimeout(timer);this.connection={url:message.url,ports:message.ports};this.update({phase:'running'});resolve(this.connection);
   });
  });
 }
 stop(){
  if(this.stopping)return this.stopping;
  if(!this.child)return Promise.resolve();
  this.update({phase:'stopping'});this.send({type:'stop'});
  this.stopping=this.exited.finally(()=>{this.stopping=null;this.update({phase:'stopped'});});return this.stopping;
 }
}
module.exports={Singleplayer,environment};
