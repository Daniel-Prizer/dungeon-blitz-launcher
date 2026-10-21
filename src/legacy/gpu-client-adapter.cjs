'use strict';
const crypto=require('crypto'),zlib=require('zlib');
const {patchAudio}=require('./audio-patch.cjs');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
// Exact-source or byte-identical recompression admission. No new hash approval,
// pool relocation or speculative observer adaptation is performed at runtime.
function adaptGpuClient(input,recipe){
 if(!Buffer.isBuffer(input)||input.length<8||input.length>4*1024*1024||!recipe||recipe.format!==1||recipe.contract!=='native-scene-writers-v1'||!/^[a-f0-9]{64}$/.test(recipe.sourceSha256)||recipe.writerSites!==395||recipe.writerMethods!==99||recipe.preservationVerified!==true)return null;
 if(hash(input)!==recipe.sourceSha256){try{if(!/^[a-f0-9]{64}$/.test(recipe.sourceBodySha256)||input.subarray(0,8).toString('hex')!==recipe.sourceHeader||hash(zlib.inflateSync(input.subarray(8),{maxOutputLength:4*1024*1024}))!==recipe.sourceBodySha256)return null;}catch{return null;}}
 return patchAudio(input,recipe.delta);
}
module.exports={adaptGpuClient};
