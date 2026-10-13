'use strict';
// Extract reviewed structural replacements from the independently compiled
// October 11 adapter. No compiler or downloaded patch recipe runs at runtime.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {readSWF}=require('../src/legacy/swf-contract.cjs'),{makeDelta}=require('./audio-delta.cjs');
const root=path.resolve(__dirname,'..'),hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex'),singleplayer=process.argv.includes('--singleplayer');
const suffix=singleplayer?'-singleplayer':'',sourceFile=path.join(root,'.test-tools/focus',singleplayer?'singleplayer.swf':'oct11.swf'),compiledFile=path.join(root,'.test-tools/audio'+(singleplayer?suffix:'-oct11')+'/audio.swf');
const {execFileSync}=require('node:child_process'),lib=path.join(root,'.test-tools/focus/ffdec/lib/*'),dir=path.join(root,'.test-tools/adaptive'+suffix);fs.mkdirSync(dir,{recursive:true});
execFileSync('javac',['-cp',lib,'-d',dir,path.join(__dirname,'ContractReferences.java')],{windowsHide:true,stdio:'inherit'});
execFileSync('java',['-Djava.awt.headless=true','-cp',dir+path.delimiter+lib,'ContractReferences',sourceFile,compiledFile,path.join(dir,'references.json')],{windowsHide:true,stdio:'inherit'});
const references=JSON.parse(fs.readFileSync(path.join(dir,'references.json')));
const input=fs.readFileSync(sourceFile);
if(hash(input)!==require(singleplayer?'../src/legacy/client-singleplayer.json':'../src/legacy/client-layout-oct11.json').inputHash)throw Error('Unreviewed contract source');
const source=readSWF(input),target=readSWF(fs.readFileSync(compiledFile));
const main=swf=>swf.tags.find(tag=>tag.abc&&tag.abc.bodies.some(body=>body.name==='Main.method_561'));
const before=main(source),after=main(target);if(!before||!after||!source.preamble.equals(target.preamble)||!before.lead.equals(after.lead))throw Error('Unsupported contract geometry');
const helpers=target.tags.filter(tag=>tag.abc&&!source.tags.some(old=>old.raw.equals(tag.raw))&&tag!==after);
if(helpers.length!==4||!source.tags.filter(tag=>tag!==before).every(tag=>target.tags.some(other=>other.raw.equals(tag.raw))))throw Error('Non-ABC game tags changed');
const edits=[],guards=[];for(const body of before.abc.bodies){const replacement=after.abc.bodies.find(other=>other.id===body.id);if(!replacement||replacement.name!==body.name)throw Error('Method identity changed');
  if(!replacement.bytes.equals(body.bytes))edits.push({id:body.id,name:body.name,delta:makeDelta(body.bytes,replacement.bytes),references:references.filter(entry=>entry.id===body.id).map(({offset,pool,index})=>({offset:replacement.codeOffset+offset,pool,index}))});
}
const expectedHooks=['class_119.OnCreateScreen','class_119.OnRefreshScreen','Camera.method_1073','SuperAnimData.method_200','Game.method_1946','class_23.method_1753','class_23.method_1389','Entity.method_831','Entity.BeginActive','Entity.method_1646','Entity.method_407','Entity.method_1862','Entity.TakeDamage','Entity.Plummet','Entity.method_864','Entity.method_1524','class_71.method_1156','ChatBubble.method_328','Main.method_561','ActivePower.method_872','ActivePower.method_243','SoundManager.method_218','SoundManager.method_1017','SoundManager.method_103','SoundManager.method_748','SoundManager.Play','Room.method_562','Room.method_1647','class_130.method_106','class_130.iinit','CombatState.method_884'];
if(edits.length!==expectedHooks.length||edits.some(edit=>!expectedHooks.includes(edit.name))||after.abc.bodies.length!==before.abc.bodies.length)throw Error('Unexpected body edits');
for(const name of ['Game.method_1880','Game.method_702','Game.method_1949','class_108.method_31','class_108.method_907','Game.method_1947']){const body=before.abc.bodies.find(body=>body.name===name);if(!body)throw Error('Missing dependency '+name);guards.push({id:body.id,name,hash:hash(body.bytes)});}
if(!before.abc.interfaceContract.equals(after.abc.interfaceContract))throw Error('Compiler changed game interfaces');
const pools={};for(const kind of Object.keys(before.abc.pools)){const original=before.abc.pools[kind],compiled=after.abc.pools[kind];if(JSON.stringify(compiled.slice(0,original.length))!==JSON.stringify(original))throw Error('Compiler changed original '+kind+' pool');pools[kind]={count:original.length,inputHash:hash(Buffer.from(JSON.stringify(original))),append:compiled.slice(original.length)};}
const recipe={format:2,sourceHash:hash(input),preambleHash:hash(source.preamble),leadHash:hash(before.lead),bindings:source.tags.filter(tag=>tag.type===76).map(tag=>hash(tag.raw)),interfaceHash:hash(before.abc.interfaceContract),pools,bodies:edits,guards,helpers:helpers.map(tag=>({hash:hash(tag.raw),data:tag.raw.toString('base64')}))};
const output=require('../src/legacy/adaptive-patch.cjs').patchAdaptiveClient(input,recipe);if(!output)throw Error('Contract rejected its reviewed source');
const parsed=readSWF(output),adapted=main(parsed);if(!adapted.abc.interfaceContract.equals(after.abc.interfaceContract)||JSON.stringify(adapted.abc.pools)!==JSON.stringify(after.abc.pools)||!adapted.abc.bodies.every(body=>body.bytes.equals(after.abc.bodies.find(other=>other.id===body.id).bytes))||!parsed.tags.filter(tag=>tag!==adapted).every(tag=>target.tags.some(other=>other.data.equals(tag.data)&&other.type===tag.type)))throw Error('Contract differs from compiled adapter');
const file=path.join(root,'runtime/game/resources/adaptive-contract'+suffix+'.json');fs.writeFileSync(file,JSON.stringify(recipe));console.log('Prepared guarded reusable adapter:',fs.statSync(file).size,'bytes;',edits.length,'method envelopes');
