'use strict';
const {patchAdaptiveClient}=require('./adaptive-patch.cjs'),{patchClient}=require('./client-patch.cjs'),{patchAudio}=require('./audio-patch.cjs');
function localAddress(address){try{const u=new URL(address);return !u.username&&!u.password&&u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname);}catch{return false;}}
// Local contracts cannot enable a different adapter on a multiplayer origin.
// Both recipes keep their complete pool/interface/body/binding guards.
function adaptClient(bytes,address,{multiplayer,singleplayer,audioDeltas=[]}){
 const adaptive=patchAdaptiveClient(bytes,multiplayer)||(localAddress(address)&&patchAdaptiveClient(bytes,singleplayer));
 const presentation=adaptive||patchClient(bytes),audio=adaptive||(presentation&&audioDeltas.map(delta=>patchAudio(presentation,delta)).find(Boolean));
 return {patched:audio||presentation,audio:!!audio,mode:adaptive?'contract':presentation?'revision':'original'};
}
module.exports={adaptClient,localAddress};
