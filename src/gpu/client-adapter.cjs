'use strict';
const crypto=require('node:crypto');
const {patchAudio}=require('../legacy/audio-patch.cjs');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
// The GPU adapter includes a reviewed cache-writer inventory and reversible
// observers. Changed clients must remain native until that review is repeated;
// accepting a new hash without reconstructing the patch is not sufficient.
function adaptGpuClient(input,recipe){
 if(!Buffer.isBuffer(input)||input.length>4*1024*1024||!recipe||recipe.format!==1||recipe.contract!=='native-scene-writers-v1'||!/^[a-f0-9]{64}$/.test(recipe.sourceSha256)||hash(input)!==recipe.sourceSha256||recipe.writerSites!==395||recipe.writerMethods!==99||recipe.preservationVerified!==true)return null;
 return patchAudio(input,recipe.delta);
}
module.exports={adaptGpuClient};
