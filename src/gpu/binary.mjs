// Enabled only after an exhaustive native roundtrip probe. These bytes are
// individual PNG cache entries, never a final-game-frame render source.
export function nativeBytes(value,length){
 if(typeof value!=='string'||!Number.isInteger(length)||length<0||length>8*1024*1024||value.length>(length+1)*3)throw Error('Invalid native byte string');
 // Do not run a repeating-alternation RegExp across multi-megabyte cache
 // transfers. V8's backtracking stack grows with the input even on valid data;
 // legacy Chromium can crash instead of reporting a catchable JS exception.
 // Decode the bounded ASCII escape grammar once, without a second huge string.
 const bytes=new Uint8Array(length);let at=0;
 const hex=code=>code>=48&&code<=57?code-48:code>=65&&code<=70?code-55:code>=97&&code<=102?code-87:-1;
 for(let i=0;i<value.length;i++){
  let word=value.charCodeAt(i);
  if(word===37){const count=value.charCodeAt(i+1)===117?(i++,4):2;word=0;for(let j=0;j<count;j++){const digit=hex(value.charCodeAt(++i));if(digit<0)throw Error('Invalid native byte string');word=word*16+digit;}}
  else if(!(word>=65&&word<=90||word>=97&&word<=122||word>=48&&word<=57||'@*_+./-'.includes(value[i])))throw Error('Invalid native byte string');
  if(at>=length)throw Error('Native byte-string length mismatch');bytes[at++]=word&255;if(at<length)bytes[at++]=word>>>8;else if(word>>>8)throw Error('Nonzero native byte padding');
 }
 if(at!==length)throw Error('Native byte-string length mismatch');return bytes.buffer;
}
export function verifyBinaryProbe(probe){try{if(probe?.encoding!=='utf16-uri-v1'||probe.bytes!==131072)return false;const words=new DataView(nativeBytes(probe.data,probe.bytes));for(let i=0;i<65536;i++)if(words.getUint16(i*2,true)!==i)return false;return true;}catch{return false;}}
