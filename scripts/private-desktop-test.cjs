const fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const log=path.join(root,'docs/private-desktop-test.log');fs.writeFileSync(log,'');
console.log=(...v)=>fs.appendFileSync(log,v.map(x=>typeof x==='string'?x:JSON.stringify(x)).join(' ')+'\n');
console.error=(...v)=>console.log(...v.map(x=>x?.stack||x));
execFileSync(path.join(root,'.test-tools/PrivateDesktop.exe'),['--check'],{windowsHide:true});
process.env.BLITZ_NATIVE_TEST='1';
require(process.env.BLITZ_PRIVATE_TEST==='neural'?'./neural-test.cjs':process.env.BLITZ_PRIVATE_TEST==='focus'?'./native-focus-test.cjs':process.env.BLITZ_PRIVATE_TEST==='margins'?'./margin-test.cjs':process.env.BLITZ_PRIVATE_TEST==='window'?'./window-test.cjs':'./launcher-test.cjs');
