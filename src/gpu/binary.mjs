// Enabled only after an exhaustive native roundtrip probe. These bytes are
// individual PNG cache entries, never a final-game-frame render source.
export function nativeBytes(value,length){
 if(typeof value!=='string'||!Number.isInteger(length)||length<0||length>8*1024*1024||value.length>(length+1)*3||!/^(?:[A-Za-z0-9@*_+./-]|%[0-9A-Fa-f]{2}|%u[0-9A-Fa-f]{4})*$/.test(value))throw Error('Invalid native byte string');
 value=unescape(value);const bytes=new Uint8Array(length);let at=0;
 for(let i=0;i<value.length;i++){
  let word=value.charCodeAt(i);
  if(at>=length)throw Error('Native byte-string length mismatch');bytes[at++]=word&255;if(at<length)bytes[at++]=word>>>8;else if(word>>>8)throw Error('Nonzero native byte padding');
 }
 if(at!==length)throw Error('Native byte-string length mismatch');return bytes.buffer;
}
export function verifyBinaryProbe(probe){try{if(probe?.encoding!=='utf16-uri-v1'||probe.bytes!==131072)return false;const words=new DataView(nativeBytes(probe.data,probe.bytes));for(let i=0;i<65536;i++)if(words.getUint16(i*2,true)!==i)return false;return true;}catch{return false;}}
