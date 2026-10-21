'use strict';
// A private launcher utility process, never an externally attachable service.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const bundle=path.resolve(process.argv[2]),world=path.resolve(process.argv[3]),parentPID=Number(process.argv[4]);
const send=m=>process.parentPort?process.parentPort.postMessage(m):process.send?.(m);
const receive=fn=>process.parentPort?process.parentPort.on('message',e=>fn(e.data)):process.on('message',fn);
let stopping=false,lastPing=Date.now(),lock,staticServer,gameServer;
const sockets=new Set(),pendingSaves=new Set();
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function directory(dir){if(fs.existsSync(dir)){if(fs.lstatSync(dir).isSymbolicLink()||!fs.statSync(dir).isDirectory())throw Error('Linked singleplayer data directory');}else{directory(path.dirname(dir));fs.mkdirSync(dir);}}
function safeFile(file){directory(path.dirname(file));if(fs.existsSync(file)&&(!fs.lstatSync(file).isFile()||fs.lstatSync(file).isSymbolicLink()))throw Error('Linked singleplayer data file');}
async function stop(){
 if(stopping)return;stopping=true;send({type:'stopping'});
 try{
  for(const socket of sockets)socket.end();
  const timer=setTimeout(()=>{for(const socket of sockets)socket.destroy();},1500);
  await Promise.all([staticServer?.stop(),gameServer?.stop()]);clearTimeout(timer);
  while(pendingSaves.size)await Promise.allSettled([...pendingSaves]);
  send({type:'stopped'});process.exit(0);
 }catch{send({type:'failure',message:'Singleplayer could not finish saving. Its data has been retained.'});process.exit(1);}
}
function boot(){
 if(!Number.isInteger(parentPID)||parentPID<1||world===bundle||world.startsWith(bundle+path.sep))throw Error('Invalid singleplayer instance');
 directory(world);const lockFile=path.join(world,'instance.lock');safeFile(lockFile);
 try{lock=fs.openSync(lockFile,'wx');}catch(e){
  if(e.code!=='EEXIST')throw e;
  const old=JSON.parse(fs.readFileSync(lockFile,'utf8'));if(!Number.isInteger(old.pid)||old.pid<1)throw Error('Invalid singleplayer lock');
  try{process.kill(old.pid,0);throw Error('Singleplayer saves are already open in another launcher.');}catch(check){if(check.code!=='ESRCH')throw check;}
  fs.unlinkSync(lockFile);lock=fs.openSync(lockFile,'wx');
 }
 fs.writeFileSync(lock,JSON.stringify({pid:process.pid,ownerPID:parentPID}));
 process.on('exit',()=>{try{fs.closeSync(lock);if(JSON.parse(fs.readFileSync(lockFile)).pid===process.pid)fs.unlinkSync(lockFile);}catch{}});
 const provenance=JSON.parse(fs.readFileSync(path.join(bundle,'provenance.json'),'utf8'));
 for(const [name,expected]of Object.entries(provenance.files)){
  if(!/^[a-zA-Z0-9_ .\/-]+$/.test(name)||name.split('/').includes('..'))throw Error('Invalid singleplayer bundle');
  const source=path.join(bundle,name);if(fs.lstatSync(source).isSymbolicLink()||hash(fs.readFileSync(source))!==expected)throw Error('Singleplayer bundle changed');
  if(name.startsWith('server/data/')&&!name.endsWith('.js')){const target=path.join(world,name.slice(7));safeFile(target);fs.copyFileSync(source,target);}
 }
 for(const name of ['data/Accounts.json','data/saves','Accounts.json','saves']){
  const file=path.join(world,name);if(fs.existsSync(file)&&fs.lstatSync(file).isSymbolicLink())throw Error('Linked singleplayer saves');
 }
 process.chdir(world);
 send({type:'phase',value:'data-ready'});
 // Never inherit a developer .env, database, Discord service or API credential.
 for(const name of Object.keys(process.env))delete process.env[name];
 Object.assign(process.env,{MULTIPLAYER_MODE:'false',ENABLE_POLICY_SERVER:'false',ENABLE_MONGO_GAME_DATA:'false',DISCORD_SOCIAL_BRIDGE_ENABLED:'false',DISCORD_SOCIAL_NATIVE_BRIDGE_ENABLED:'false',STATIC_PORT:'0',GAME_PORT:'0',NODE_ENV:'production',DOTENV_CONFIG_PATH:path.join(bundle,'empty.env')});
 // Upstream logging includes account identifiers; this process emits only its
 // small fixed lifecycle messages, with no raw stdout/stderr or save contents.
 for(const name of ['log','warn','error','info','debug'])console[name]=()=>{};
 const load=name=>require(path.join(bundle,'server',name));
 const {Config}=load('core/config.js');Object.assign(Config,{DATA_DIR:world,BIND_HOST:'127.0.0.1',HOST:'localhost',STATIC_PORT:0,PORTS:[0],ENABLE_POLICY_SERVER:false,ENABLE_MONGO_GAME_DATA:false});
 send({type:'phase',value:'config-ready'});
 const {JsonAdapter}=load('database/JsonAdapter.js');
 for(const name of ['saveCharacterSnapshot','createAccount','saveUser']){
  const original=JsonAdapter.prototype[name];if(!original)continue;
  JsonAdapter.prototype[name]=function(...args){const promise=Promise.resolve().then(()=>original.apply(this,args));pendingSaves.add(promise);promise.then(()=>pendingSaves.delete(promise),()=>pendingSaves.delete(promise));return promise;};
 }
 // Restore in-game account creation only in this loopback-only owned world.
 // Its original challenge, password KDF, character creation and saves remain.
 const {LoginHandler}=load('handlers/LoginHandler.js'),auth=load('auth/PasswordAuth.js');let creation=Promise.resolve();
 LoginHandler.handleLoginCreate=function(client,data){const task=creation.then(async()=>{
  await client.resetForLoginCycle('local account creation');const payload=LoginHandler.parseLoginPayload(data);
  if(!payload)return LoginHandler.sendPopup(client,'Enter a local email and password.',false);
  if(await LoginHandler.db.getAccount(payload.email))return LoginHandler.sendPopup(client,'That local account already exists. Use Log In.',false);
  const record=await auth.hashClientPasswordInput(auth.unmaskChallengeXorClientPassword(payload.password,client.challengeStr));
  const account=await LoginHandler.db.createAccount(payload.email,record);
  await LoginHandler.completeAuthentication(client,account,'local account creation',true);
 });creation=task.catch(()=>{});return task;};
 // Match upstream's import spelling; Windows Node treats differently cased
 // request paths as distinct module-cache entries even on the same file.
 const Static=load('core/StaticServer.js'),Game=load('core/server.js');
 const originalStatic=Static.StaticServer,originalGame=Game.GameServer;let count=0;
 function ready(){send({type:'phase',value:'listener-ready'});if(++count===2){Config.PUBLIC_BASE_URL=`http://localhost:${Config.STATIC_PORT}`;send({type:'ready',url:Config.PUBLIC_BASE_URL+'/',ports:{http:Config.STATIC_PORT,game:Config.PORTS[0]},pid:process.pid});}}
 const watch=server=>server.on('connection',socket=>{sockets.add(socket);socket.on('error',()=>{});socket.once('close',()=>sockets.delete(socket));});
 Static.StaticServer=class extends originalStatic{
  constructor(){super(0,path.join(bundle,'content'),'127.0.0.1');staticServer=this;}
  start(){super.start();watch(this.server);this.server.once('listening',()=>{Config.STATIC_PORT=this.server.address().port;ready();});}
 };
 Game.GameServer=class extends originalGame{
  constructor(_port,router){super(0,router,'127.0.0.1');gameServer=this;watch(this.server);}
  start(){this.server.once('listening',()=>{Config.PORTS[0]=this.server.address().port;ready();});super.start();}
 };
 // The exact previously reviewed local client, before launcher enhancements.
 const client=fs.readFileSync(path.join(bundle,'client.swf'));
 load('core/DungeonBlitzSwf.js').buildDungeonBlitzSwfVariantBuffer=()=>client;
 require(path.join(bundle,'server/main.js'));
 send({type:'phase',value:'main-ready'});
 // We own shutdown; wait for the original disconnect persistence promises.
 for(const signal of ['SIGINT','SIGTERM','SIGBREAK','SIGHUP']){process.removeAllListeners(signal);process.once(signal,stop);}
 receive(message=>{if(message?.type==='ping')lastPing=Date.now();if(message?.type==='stop')void stop();});
 process.on('disconnect',stop);
 setInterval(()=>{try{process.kill(parentPID,0);}catch{void stop();}if(Date.now()-lastPing>30000)void stop();},2000).unref();
}
process.on('uncaughtException',()=>{send({type:'failure',message:'The private singleplayer server failed. Reconnect to try again.'});void stop();});
process.on('unhandledRejection',()=>{send({type:'failure',message:'Singleplayer encountered a server error. Its saves have been retained.'});void stop();});
try{boot();}catch(e){send({type:'failure',message:e.message==='Singleplayer saves are already open in another launcher.'?e.message:'Singleplayer could not start. Check the bundled server and local save folder.'});process.exit(1);}
