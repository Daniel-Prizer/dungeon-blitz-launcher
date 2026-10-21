'use strict';
// Replace only the staging workspace's cache junction with an independent test
// directory. Native install/cleanup checks correctly reject junction ancestors.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),record=JSON.parse(fs.readFileSync(path.join(root,'.test-tools/release-stage.json'))),stage=fs.realpathSync(record.stage),artifacts=fs.realpathSync(path.join(root,'artifacts'));
if(path.dirname(stage)!==artifacts||!path.basename(stage).startsWith('release-staging-'))throw Error('Unexpected staging directory');
const original=path.join(root,'.test-tools'),tools=path.join(stage,'.test-tools');
if(!fs.lstatSync(tools).isSymbolicLink()||fs.realpathSync(tools)!==fs.realpathSync(original))throw Error('Expected only this workspace cache junction');
fs.unlinkSync(tools);fs.mkdirSync(tools);
for(const name of ['inno-7.1.0','innosetup-7.1.0-x64.exe','PrivateDesktop.exe'])fs.cpSync(path.join(original,name),path.join(tools,name),{recursive:true});
console.log('Independent staging test directory prepared; original cache retained.');
