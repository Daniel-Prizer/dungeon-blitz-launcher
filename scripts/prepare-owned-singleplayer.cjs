'use strict';
// Import an immutable, allowlisted public source snapshot. Never read the
// checkout's working files, environment, accounts, saves or lab installation.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const commit='a409ee06a3231a67acc22f4d953c77d5b92e17b9';
function prepare(source){
  source=path.resolve(source);
  const git=args=>execFileSync('git',args,{cwd:source,maxBuffer:250*1024*1024,windowsHide:true});
  if(git(['rev-parse',commit+'^{commit}']).toString().trim()!==commit)throw Error('Missing reviewed singleplayer snapshot');
  const output=path.join(root,'runtime/singleplayer');
  if(fs.existsSync(output))throw Error('Singleplayer runtime already exists; preserve it and prepare in a fresh staging workspace.');
  const entries=git(['ls-tree','-rz','--full-tree',commit,'src/server','src/client/content/localhost','LICENSE','package.json']).toString().split('\0').filter(Boolean).map(row=>{const m=row.match(/^100644 blob ([a-f0-9]{40})\t(.+)$/);return m&&{oid:m[1],name:m[2]};}).filter(Boolean).filter(({name})=>{
    if(name==='LICENSE'||name==='package.json')return true;
    if(name.startsWith('src/client/content/localhost/'))return !/\.(bak|map)$/.test(name);
    if(/\/(?:Accounts\.json|saves|node_modules|dist|test|tools|native_bridge)(?:\/|$)/i.test(name)||/\.env|discord.*\.json|launcher\.config\.json/.test(name))return false;
    if(name.startsWith('src/server/scripts/'))return name==='src/server/scripts/swfPatchUtils.ts';
    return /\.(ts|json)$/.test(name)&&!name.endsWith('.d.ts');
  });
  const objects=execFileSync('git',['cat-file','--batch'],{cwd:source,input:entries.map(x=>x.oid+'\n').join(''),maxBuffer:250*1024*1024,windowsHide:true});
  const ts=require(require.resolve('typescript',{paths:[path.join(source,'src/server')]}));
  fs.mkdirSync(output,{recursive:true});let offset=0;const files={};
  for(const entry of entries){
    const end=objects.indexOf(10,offset),header=objects.subarray(offset,end).toString().split(' '),size=Number(header[2]);
    if(header[0]!==entry.oid||header[1]!=='blob'||!Number.isSafeInteger(size))throw Error('Invalid Git object');
    let bytes=objects.subarray(end+1,end+1+size);offset=end+size+2;
    // The main module imports core/server in lowercase. Normalize its output
    // filename too: archive lookup is case-sensitive even on Windows.
    const name=entry.name.replace(/^src\/server\//,'server/').replace(/^src\/client\/content\/localhost\//,'content/').replace(/\.ts$/,'.js').replace('server/core/Server.js','server/core/server.js');
    if(entry.name.endsWith('.ts'))bytes=Buffer.from(ts.transpileModule(bytes.toString(),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,resolveJsonModule:true}}).outputText);
    const file=path.join(output,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);
    files[name]=crypto.createHash('sha256').update(bytes).digest('hex');
  }
  // Install only pinned runtime dependencies, in this newly created import.
  execFileSync(process.platform==='win32'?'npm.cmd':'npm',['ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],{cwd:path.join(output,'server'),stdio:'inherit',windowsHide:true,shell:process.platform==='win32'});
  const client=fs.readFileSync(path.join(root,'.test-tools/focus/singleplayer.swf'));
  if(crypto.createHash('sha256').update(client).digest('hex')!==require('../src/legacy/client-singleplayer.json').inputHash)throw Error('Missing reviewed local client');
  fs.writeFileSync(path.join(output,'client.swf'),client);files['client.swf']=crypto.createHash('sha256').update(client).digest('hex');
  fs.writeFileSync(path.join(output,'empty.env'),'');files['empty.env']=crypto.createHash('sha256').update('').digest('hex');
  fs.writeFileSync(path.join(output,'provenance.json'),JSON.stringify({source:'https://github.com/Daniel-Prizer/dungeon-blitz-r',commit,version:JSON.parse(fs.readFileSync(path.join(output,'server/package.json'))).version,files},null,2));
  console.log(JSON.stringify({output,commit,files:entries.length}));
}
if(require.main===module)prepare(process.argv[2]||'C:/Users/Daniel/Downloads/db r/dungeon-blitz-r');
module.exports={prepare,commit};
