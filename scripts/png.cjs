'use strict';
// Tiny lossless encoder for test-only GPU readbacks; production never encodes frames.
const zlib=require('node:zlib');
function crc(bytes){let x=0xffffffff;for(const b of bytes){x^=b;for(let k=0;k<8;k++)x=(x>>>1)^((x&1)?0xedb88320:0);}return (x^0xffffffff)>>>0;}
function chunk(name,data){const tag=Buffer.from(name),size=Buffer.alloc(4),sum=Buffer.alloc(4);size.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([tag,data])));return Buffer.concat([size,tag,data,sum]);}
module.exports=(width,height,rgba,channels=4)=>{if(rgba.length!==width*height*channels)throw Error('Wrong GPU image dimensions');const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=channels===4?6:2;const rows=Buffer.alloc(height*(width*channels+1));for(let y=0;y<height;y++)rgba.copy(rows,y*(width*channels+1)+1,y*width*channels,(y+1)*width*channels);return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);};
