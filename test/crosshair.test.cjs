const test=require('node:test'),assert=require('node:assert/strict');
const {valid,pixels,recolor}=require('../src/crosshair.js'),{validSettings}=require('../src/policy.cjs');
test('crosshair preferences preserve safe defaults and reject unbounded artwork inputs',()=>{
  assert.deepEqual(validSettings().crosshair,{style:'default',color:'#8cff65',size:24,outline:true});
  for(const value of [null,{},[],{style:'url(evil)',color:'red',size:10000}])assert.deepEqual(valid(value),valid());
  assert.deepEqual(valid({style:'ring',color:'#FF10AB',size:32,outline:false}),{style:'ring',color:'#ff10ab',size:32,outline:false});
});

test('original pointer recoloring retains native shape, alpha and dark outlines without mutating the original',()=>{
 const original=Uint8Array.from([255,255,255,255,0,0,0,255,180,180,180,120,0,0,0,0]),copy=new Uint8Array(original);
 const tinted=recolor(original,'#ff0080');assert.deepEqual(original,copy);assert.deepEqual([...tinted.slice(0,8)],[255,0,128,255,0,0,0,255]);
 for(let i=3;i<original.length;i+=4)assert.equal(tinted[i],original[i]);assert.equal(tinted[8],180);assert.equal(tinted[9],0);assert.equal(tinted[10],90);
 assert.equal(valid({style:'original'}).style,'original');assert.throws(()=>recolor(new Uint8Array(145*145*4+4),'#ffffff'));assert.throws(()=>recolor(new Uint8Array(3),'#ffffff'));
});
test('pointer artwork remains bounded, centered and symmetric across DPI and style choices',()=>{
  for(const style of ['cross','dot','ring'])for(const size of [16,24,32,48])for(const density of [.5,1,1.25,1.5,2,3]){
    const image=pixels({style,size,color:'#ff80ab',outline:true},density);
    assert(image.width<=145&&image.width%2===1);assert.equal(image.hotspot,(image.width-1)/2);
    let visible=0;for(let y=0;y<image.width;y++)for(let x=0;x<image.width;x++){
      const pos=(y*image.width+x)*4;visible+=!!image.rgba[pos+3];
      assert.equal(image.rgba[pos+3],image.rgba[(y*image.width+image.width-1-x)*4+3]);
      assert.equal(image.rgba[pos+3],image.rgba[((image.width-1-y)*image.width+x)*4+3]);
    }
    assert(visible>0);assert.equal(image.rgba[3],0);
  }
  assert(pixels({style:'default'}).rgba.every(v=>v===0));
});
