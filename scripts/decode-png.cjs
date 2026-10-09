'use strict';
// Test-only decoder for 8-bit RGB/RGBA PNG fixtures; no production frame I/O.
const zlib=require('node:zlib'),assert=require('node:assert/strict');
module.exports=buffer=>{
 assert.equal(buffer.subarray(1,4).toString(),'PNG');let width,height,channels;const parts=[];
 for(let o=8;o<buffer.length;){const n=buffer.readUInt32BE(o),type=buffer.toString('ascii',o+4,o+8),data=buffer.subarray(o+8,o+8+n);if(type==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);assert.equal(data[8],8);channels=data[9]===6?4:data[9]===2?3:0;assert(channels);assert.equal(data[12],0);}if(type==='IDAT')parts.push(data);o+=n+12;}
 const raw=zlib.inflateSync(Buffer.concat(parts)),stride=width*channels,pixels=Buffer.alloc(stride*height);
 const paeth=(a,b,c)=>{const p=a+b-c,da=Math.abs(p-a),db=Math.abs(p-b),dc=Math.abs(p-c);return da<=db&&da<=dc?a:db<=dc?b:c;};
 for(let y=0;y<height;y++){const filter=raw[y*(stride+1)];assert(filter<=4);for(let x=0;x<stride;x++){const at=y*stride+x,a=x>=channels?pixels[at-channels]:0,b=y?pixels[at-stride]:0,c=y&&x>=channels?pixels[at-stride-channels]:0;pixels[at]=(raw[y*(stride+1)+x+1]+(filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):paeth(a,b,c)))&255;}}
 return{width,height,channels,pixels};
};
