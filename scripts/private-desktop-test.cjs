const fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const log=path.join(root,'docs/private-desktop-test.log');fs.writeFileSync(log,'');
console.log=(...v)=>fs.appendFileSync(log,v.map(x=>typeof x==='string'?x:JSON.stringify(x)).join(' ')+'\n');
console.error=(...v)=>console.log(...v.map(x=>x?.stack||x));
execFileSync(path.join(root,'.test-tools/PrivateDesktop.exe'),['--check'],{windowsHide:true});
process.env.BLITZ_NATIVE_TEST='1';
if(process.env.BLITZ_PRIVATE_TEST==='map-fullscreen'){require('./camera-map-test.cjs');return;}
if(process.env.BLITZ_PRIVATE_TEST==='autorun'){require('./autorun-test.cjs');return;}
if(process.env.BLITZ_PRIVATE_TEST==='singleplayer'){require('./singleplayer-test.cjs');return;}
if(process.env.BLITZ_PRIVATE_TEST==='local-icons'){require('./local-icon-test.cjs');return;}
require(process.env.BLITZ_PRIVATE_TEST==='camera'?'./camera-map-test.cjs':process.env.BLITZ_PRIVATE_TEST==='transition'?'./transition-test.cjs':process.env.BLITZ_PRIVATE_TEST==='fps'?'./fps-test.cjs':process.env.BLITZ_PRIVATE_TEST==='render'?'./render-test.cjs':process.env.BLITZ_PRIVATE_TEST==='focus'?'./native-focus-test.cjs':process.env.BLITZ_PRIVATE_TEST==='margins'?'./margin-test.cjs':process.env.BLITZ_PRIVATE_TEST==='window'?'./window-test.cjs':'./launcher-test.cjs');
