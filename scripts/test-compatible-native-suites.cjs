'use strict';
// Reuse the existing camera/transition suites with the genuine independent
// shared-host fixture. Production game executables/profiles are never opened.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),record=JSON.parse(fs.readFileSync(path.join(root,'.test-tools/release-stage.json'))),stage=record.stage;
const executable=path.resolve(process.argv[2]);if(path.basename(executable)!=='LocalWorldCompatibilityFixture.exe'||!fs.existsSync(executable))throw Error('An independently packaged shared-host fixture is required');
const out=fs.mkdtempSync(path.join(root,'artifacts/controller-suites-')),entry=path.join(out,'entry.cjs');
fs.writeFileSync(entry,`const cp=require('child_process'),path=require('path'),{app}=require('electron');const realSpawn=cp.spawn;cp.spawn=(file,args,options)=>realSpawn(path.resolve(file)===${JSON.stringify(path.join(stage,'runtime/game/BlitzGame.exe'))}?${JSON.stringify(executable)}:file,args,options);const setPath=app.setPath.bind(app);app.setPath=(name,value)=>setPath(name,name==='userData'?${JSON.stringify(path.join(out,'empty-shell-profile'))}:value);require(${JSON.stringify(path.join(stage,'src/main.cjs'))});`);
require('../research/gpu/background.cjs').lowerSelf();
execFileSync(process.execPath,[path.join(stage,'scripts/prepare-transition-fixture.cjs')],{cwd:stage,stdio:'inherit',windowsHide:true,timeout:100000});
for(const suite of ['camera-map-test.cjs','transition-test.cjs']){
 const runner=path.join(out,suite),log=path.join(out,suite+'.log');fs.writeFileSync(runner,`const fs=require('fs');console.log=(...v)=>fs.appendFileSync(${JSON.stringify(log)},v.map(x=>x?.stack||String(x)).join(' ')+'\\n');console.error=console.log;const {_electron}=require(${JSON.stringify(require.resolve('playwright'))});const launch=_electron.launch.bind(_electron);_electron.launch=options=>launch({...options,args:[${JSON.stringify(entry)},...options.args.slice(1)]});require(${JSON.stringify(path.join(stage,'scripts',suite))});`);
 try{execFileSync(path.join(root,'.test-tools/PrivateDesktop.exe'),[process.execPath,runner],{windowsHide:true,stdio:'inherit',timeout:240000});}finally{if(fs.existsSync(log))process.stdout.write(fs.readFileSync(log));}
}
console.log('PASS existing camera/transition suites through independent shared native host: '+out);
