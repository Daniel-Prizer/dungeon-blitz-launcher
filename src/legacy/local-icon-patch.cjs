'use strict';
const crypto=require('crypto');
const {readSWF,writeSWF}=require('./swf-contract.cjs');
const {localAddress}=require('./client-adapter.cjs');
const reviewed=require('./local-icon-fallback.json');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const aliases=[['a_PowerIcon_MeteorROR','a_PowerIcon_Meteor'],['a_PowerIcon_CrimsonShot','a_PowerIcon_FireBall']];
function defines(swf,name){return swf.tags.some(tag=>tag.abc&&tag.abc.bodies.some(body=>body.name===name+'.iinit'));}
function localIconAsset(address,request){try{return localAddress(address)&&new URL(address).origin===new URL(request).origin&&/\/UI_1\.swf$/i.test(new URL(request).pathname);}catch{return false;}}
// A separate presentation repair for two missing local asset names. This does
// not enable an unsupported main-client adapter or modify any original method,
// artwork, ability metadata, save, socket, cooldown or input handler.
function patchLocalIcons(input,address,recipe=reviewed){
 try{
  if(!localAddress(address)||!Buffer.isBuffer(input)||input.length>2*1024*1024||!recipe||recipe.format!==1||!Array.isArray(recipe.sources)||recipe.sources.length>8||!recipe.sources.includes(hash(input))||!Array.isArray(recipe.helpers)||recipe.helpers.length!==aliases.length)return null;
  const source=readSWF(input),helpers=[];
  for(let i=0;i<aliases.length;i++){
   const [name,fallback]=aliases[i],helper=recipe.helpers[i];
   if(helper.name!==name||helper.fallback!==fallback||defines(source,name)||!defines(source,fallback)||typeof helper.data!=='string'||helper.data.length>16384)return null;
   const raw=Buffer.from(helper.data,'base64');if(raw.length>8192||hash(raw)!==helper.hash)return null;
   helpers.push(raw);
  }
  const tags=[];let inserted=false;
  for(const tag of source.tags){if(!inserted&&tag.type===1){tags.push(...helpers);inserted=true;}tags.push(tag.raw);}
  if(!inserted)return null;
  const output=writeSWF(source,tags),result=readSWF(output);
  if(result.tags.length!==source.tags.length+helpers.length||!source.tags.every(tag=>result.tags.some(other=>other.raw.equals(tag.raw)))||!aliases.every(([name])=>defines(result,name)))return null;
  return output;
 }catch(_){return null;}
}
module.exports={patchLocalIcons,localIconAsset};
