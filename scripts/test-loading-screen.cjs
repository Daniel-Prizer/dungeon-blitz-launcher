'use strict';
// Native loading artwork and controllers, exercised through a genuinely
// independent fixture on an inactive desktop. No accounts or OS input.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),net=require('node:net'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawn,execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){for(let i=0;i<300;i++){const v=await fn();if(v)return v;await wait(100);}throw Error('Timed out: '+label);}
async function run(config){
 execFileSync(path.join(root,'.test-tools/PrivateDesktop.exe'),['--check'],{windowsHide:true});
 const {out,executable}=config,records=[];
 for(const mode of ['before','after']){
  const web=http.createServer((req,res)=>{const file=req.url==='/DungeonBlitz.swf'?path.join(root,'.test-tools/loading-oct21',mode+'.swf'):req.url.startsWith('/assets/')?path.join(root,'.test-tools/wide-live-assets',path.basename(req.url)):null;if(file){res.setHeader('Content-Type','application/x-shockwave-flash');res.end(fs.readFileSync(file));}else res.end('<html><head><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#484955}object{width:100vw;height:100vh;display:block}</style></head><body><object id="DungeonBlitz" type="application/x-shockwave-flash" data="/DungeonBlitz.swf"><param name="allowScriptAccess" value="always"><param name="wmode" value="direct"></object></body></html>');});
  await new Promise(r=>web.listen(0,'127.0.0.1',r));let child,pipe;const token=crypto.randomBytes(32).toString('hex'),channel='\\\\.\\pipe\\loading-layout-fixture-'+crypto.randomBytes(16).toString('hex'),messages=[];
  const server=net.createServer(socket=>{pipe=socket;let b='';socket.on('error',()=>{});socket.on('data',part=>{b+=part;while(b.includes('\n')){const i=b.indexOf('\n'),m=JSON.parse(b.slice(0,i));b=b.slice(i+1);if(m.type==='auth')assert.equal(m.token,token);else messages.push(m);}});});await new Promise(r=>server.listen(channel,r));
  try{
   const env=require('../src/game-environment.cjs').gameEnvironment(process.env,true);Object.assign(env,{BLITZ_HOST_TEST:'1',BLITZ_CURSOR_DRY_RUN:'1',BLITZ_GAME_ACCELERATION:'0',BLITZ_GAME_URL:'http://localhost:'+web.address().port+'/',BLITZ_HOST_CHANNEL:channel,BLITZ_HOST_TOKEN:token});
   child=spawn(executable,[],{env,windowsHide:true,stdio:'ignore'});await until(()=>messages.some(m=>m.type==='ready'),'fixture ready');const send=m=>pipe.write(JSON.stringify(m)+'\n');
   send({type:'test-transition-fixture'});await until(()=>messages.some(m=>m.type==='client-integration'&&m.value),'native fixture initialized');
   send({type:'visibility',value:true});send({type:'widescreen',value:true});
   async function sample(name){const file=path.join(out,mode+'-'+name+'.png');send({type:'capture',path:file});return until(()=>{try{if(!fs.existsSync(file))return;const r=JSON.parse(fs.readFileSync(file+'.json'));assert(r.renderProbe?.fixture&&!r.renderProbe.fixture.snapshotError,JSON.stringify(r.renderProbe));records.push({mode,name,...r});return r.renderProbe;}catch(e){if(e.code==='ENOENT'||e instanceof SyntaxError)return;throw e;}},'capture '+name);}
   await wait(300);let p=await sample('startup');assert.equal(p.widescreen.active,false);assert.equal(p.fixture.loading.x,0,'Startup keeps the original authored origin');
   for(const [width,height] of [[1600,900],[1920,1080],[2560,1440]]){
    send({type:'test-viewport',width,height});send({type:'test-transition-control',play:true,transition:false});await wait(300);
    for(const phase of ['Login','None','Transfer']){
     send({type:'test-transition-control',play:false,transition:true,phase});await wait(250);p=await sample(width+'-'+phase);const half=(p.widescreen.logicalWidth-1152)/2;assert(half>0);assert(Math.abs(p.fixture.loading.x-(mode==='after'?half:0))<.051,'The negative control reproduces the missing centering offset; corrected positions retain Flash twip quantization');assert.equal(p.fixture.loading.scaleX,1);assert.equal(p.fixture.loading.scaleY,1);const matte=p.fixture.loading.children.find(c=>c.type==='flash.display::Shape'&&c.height===768);assert(matte);if(mode==='after')assert(matte.width*matte.scaleX>=p.widescreen.logicalWidth,'The passive full-height loading matte covers the entire wider view');
    }
    send({type:'test-transition-control',play:true,transition:true,transfer:true});await wait(250);p=await sample(width+'-pending');assert(p.fixture.pendingLoading);assert(Math.abs(p.fixture.pendingLoading.x-(mode==='after'?(p.widescreen.logicalWidth-1152)/2:0))<.051,'Pending game loading artwork uses the same viewport');
   }
   send({type:'widescreen',value:false});await wait(300);p=await sample('restored');assert.equal(p.fixture.loading.x,0);assert.equal(p.fixture.loading.scaleX,1);assert.equal(p.widescreen.active,false);
   assert(!messages.some(m=>m.type==='error'),JSON.stringify(messages.filter(m=>m.type==='error')));send({type:'quit'});await new Promise(r=>child.once('exit',r));child=null;
  }finally{if(child&&pipe){pipe.write('{"type":"quit"}\n');await new Promise(r=>child.once('exit',r));}pipe?.destroy();await new Promise(r=>server.close(r));await new Promise(r=>web.close(r));}
 }
 fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify({ok:true,scope:'Real loading artwork/controller, prior-helper negative control, startup and Login/None/Transfer/pending games, three native viewports, no authentication or OS input',records},null,2));console.log('PASS loading alignment: '+out);
}
if(process.argv[2]==='--run')run(JSON.parse(fs.readFileSync(process.argv[3]))).catch(e=>{console.error(e);process.exitCode=1;});
else{
 const executable=path.resolve(process.argv[2]);assert.equal(path.basename(executable),'LocalWorldCompatibilityFixture.exe','Use the independently packaged compatibility fixture');assert(fs.existsSync(executable));const out=fs.mkdtempSync(path.join(root,'artifacts/loading-layout-')),config=path.join(out,'config.json'),runner=path.join(out,'run.cjs'),log=path.join(out,'test.log');fs.writeFileSync(config,JSON.stringify({out,executable}));fs.writeFileSync(runner,`const fs=require('fs');console.log=(...v)=>fs.appendFileSync(${JSON.stringify(log)},v.map(x=>x?.stack||String(x)).join(' ')+'\\n');console.error=console.log;process.argv=[process.argv[0],${JSON.stringify(__filename)},'--run',${JSON.stringify(config)}];require(${JSON.stringify(__filename)});`);try{execFileSync(path.join(root,'.test-tools/PrivateDesktop.exe'),[process.execPath,runner],{stdio:'inherit',windowsHide:true,timeout:200000});}finally{if(fs.existsSync(log))process.stdout.write(fs.readFileSync(log));}
}
