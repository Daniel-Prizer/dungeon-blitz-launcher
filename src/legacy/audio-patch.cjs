'use strict';
const crypto=require('crypto'),zlib=require('zlib');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function patchAudio(input,delta){
 try{
  if(!Buffer.isBuffer(input)||!delta||delta.format!==1||!Array.isArray(delta.operations)||delta.operations.length>10000||!Number.isInteger(delta.outputLength)||delta.outputLength<1||delta.outputLength>3*1024*1024)return null;
  const before=zlib.inflateSync(input.subarray(8),{maxOutputLength:3*1024*1024});if(digest(before)!==delta.inputHash)return null;
  let length=0;const chunks=[];
  for(const op of delta.operations){let chunk;
   if(Array.isArray(op.copy)&&op.copy.length===2){const [start,count]=op.copy;if(!Number.isInteger(start)||!Number.isInteger(count)||start<0||count<1||start+count>before.length)return null;chunk=before.subarray(start,start+count);}
   else if(typeof op.data==='string'&&op.data.length<=4*1024*1024)chunk=Buffer.from(op.data,'base64');else return null;
   length+=chunk.length;if(length>delta.outputLength)return null;chunks.push(chunk);
  }
  const after=Buffer.concat(chunks);if(length!==delta.outputLength||digest(after)!==delta.outputHash)return null;
  const header=Buffer.from(input.subarray(0,8));header.writeUInt32LE(after.length+8,4);return Buffer.concat([header,zlib.deflateSync(after)]);
 }catch(_){return null;}
}
module.exports={patchAudio};
