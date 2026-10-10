'use strict';
const crypto = require('crypto'), zlib = require('zlib');
const revisions = [require('./client-layout.json'), require('./client-layout-current.json'), require('./client-layout-latest.json')];
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function u30(value) { const bytes=[];do {let b=value&127;value>>>=7;bytes.push(value?b|128:b);}while(value);return Buffer.from(bytes); }
// Pinned to a reviewed client revision, not guessed offsets in arbitrary SWFs.
// Only presentation/layout changes: original game input, focus state, packets,
// authentication, game data and assets remain untouched.
function patchClient(input) {
  if (!Buffer.isBuffer(input) || input.length > 2*1024*1024) return null;
  const revision = revisions.find(item => item.inputHash === digest(input));
  if (!revision) return null;
  if(input.toString('ascii',0,3)!=='CWS')return null;
  const body=zlib.inflateSync(input.slice(8));
  const layout=revision.layout,focus=revision.focus;
  if(body.length!==revision.bodyLength || body.readUInt32LE(revision.abcLengthPosition)!==revision.abcLength ||
    digest(body.slice(layout.start,layout.start+layout.length))!==layout.hash || digest(body.slice(focus.start,focus.start+focus.length))!==focus.hash) return null;
  const code=Buffer.from(body.slice(layout.start,layout.start+layout.length));
  // Save the real stage size in two scratch locals. Keep the picture's scale
  // based on 1152×768, then restore the real size for centering and clipping.
  // The removed bytes are debug-local descriptions, not executable game logic.
  const prefix=Buffer.from([0xd1,0x63,9,0xd2,0x63,10,0x25,...u30(1152),0xd5,0x25,...u30(768),0xd6]);
  code.fill(0x02,2,0x38);prefix.copy(code,2);
  // Clip the fixed logical picture to the actual window, rather than deriving
  // another 3:2 fit rectangle that would cap the enlarged picture at Fit size.
  for(const pair of [[layout.clipWidthOffset,1152],[layout.clipHeightOffset,768]]) {
    code.fill(0x02,pair[0],pair[0]+4);Buffer.from([0x25,...u30(pair[1])]).copy(code,pair[0]);
  }
  const marker=layout.centeringOffset,restore=Buffer.from([0x62,9,0xd5,0x62,10,0xd6]);
  const resized=Buffer.concat([code.slice(0,marker),restore,code.slice(marker)]);
  const address=offset=>offset<=marker?offset:offset+restore.length;
  for(const branch of layout.branches) {
    const position=branch.offset>=marker?branch.offset+restore.length:branch.offset;
    const relative=address(branch.offset+branch.size+branch.relative)-(position+branch.size);
    resized[position+1]=relative&255;resized[position+2]=(relative>>>8)&255;resized[position+3]=(relative>>>16)&255;
  }
  // This method only creates/animates a_FocusLostSplash. Return without drawing
  // it; the separate normal focus/key cleanup code remains in the game.
  body.fill(0x02,focus.start,focus.start+focus.length);body[focus.start]=0x47;
  const out=Buffer.concat([body.slice(0,layout.start),resized,body.slice(layout.start+layout.length)]);
  const encoded=u30(resized.length);
  if(encoded.length!==layout.start-layout.lengthPosition) return null;
  encoded.copy(out,layout.lengthPosition);out.writeUInt32LE(revision.abcLength+restore.length,revision.abcLengthPosition);
  const header=Buffer.from(input.slice(0,8));header.writeUInt32LE(out.length+8,4);
  return Buffer.concat([header,zlib.deflateSync(out)]);
}
module.exports={patchClient};
