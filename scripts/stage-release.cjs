'use strict';
// Build into a fresh workspace. The active original runtime and canonical
// executable copies are never changed by preparation or package generation.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),version=require('../package.json').version;
const artifacts=path.join(root,'artifacts');fs.mkdirSync(artifacts,{recursive:true});
const stage=fs.mkdtempSync(path.join(artifacts,`release-staging-${version}-`));
for(const dir of ['src','assets','scripts','research','test','runtime'])fs.cpSync(path.join(root,dir),path.join(stage,dir),{recursive:true,errorOnExist:true});
for(const file of ['package.json','package-lock.json','README.md','SECURITY.md'])fs.copyFileSync(path.join(root,file),path.join(stage,file));
fs.mkdirSync(path.join(stage,'docs'));
for(const dir of ['node_modules','.test-tools'])fs.symlinkSync(path.join(root,dir),path.join(stage,dir),'junction');
fs.writeFileSync(path.join(root,'.test-tools/release-stage.json'),JSON.stringify({root,stage,version,createdAt:new Date().toISOString()},null,2));
console.log(stage);
