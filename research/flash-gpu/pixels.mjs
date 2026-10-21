import {GlSceneRenderer} from '/gpu/renderer-gl.mjs';
export async function pixelSuite(){
 const r=await GlSceneRenderer.create({width:16,height:16}),checks=[];let sequence=0;
 const bitmap=async(w,h,rgba)=>{const c=new OffscreenCanvas(w,h),ctx=c.getContext('2d'),data=ctx.createImageData(w,h);for(let i=0;i<data.data.length;i+=4)data.data.set(rgba,i);ctx.putImageData(data,0,0);return createImageBitmap(c,{premultiplyAlpha:'premultiply',colorSpaceConversion:'none'});};
 const node=extra=>({id:'a',texture:0,matrix:[1,0,0,1,0,0],size:[16,16],tint:[1,1,1,1],offset:[0,0,0,0],clip:[0,0,16,16],blend:'normal',interpolate:false,...extra});
 const render=async(nodes,clear=[0,0,1,1])=>{await r.render({version:1,artworkRevision:r.artworkRevision,sequence:++sequence,time:sequence,epoch:'pixel-fixture',nodes},{clear});return r.readPixels();};
 const equal=(name,pixels,x,y,expected)=>{const actual=[...pixels.slice((y*16+x)*4,(y*16+x)*4+4)];if(actual.some((n,i)=>Math.abs(n-expected[i])>2))throw Error(name+': '+actual+' != '+expected);checks.push({name,actual,expected});};
 let art=await bitmap(8,8,[255,0,0,128]);await r.setArtwork([art]);art.close();
 let pixels=await render([node({clip:[2,2,8,8]})]);equal('premultiplied alpha over native clear',pixels,3,3,[128,0,127,255]);equal('clip outside retained art',pixels,1,1,[0,0,255,255]);
 pixels=await render([node({blend:'add'})]);equal('additive blend',pixels,4,4,[128,0,255,255]);
 pixels=await render([node({tint:[0,1,1,1],offset:[0,.5,0,0]})]);equal('native color transform',pixels,3,3,[0,64,127,255]);
 art=await bitmap(1,1,[0,255,0,255]);await r.reuseArtwork([{index:0,bitmap:art}],r.artworkRevision);art.close();pixels=await render([node({sampling:'nearest'})]);equal('recycled texture crop has no previous pose bleed',pixels,15,15,[0,255,0,255]);
 const scene={version:1,artworkRevision:r.artworkRevision,sequence:++sequence,time:sequence,epoch:'pixel-fixture',nodes:[node()]};await r.render(scene,{clear:[0,0,0,0],skipUnchanged:true});const skip=r.submit({...scene,sequence:++sequence,time:sequence},{clear:[0,0,0,0],skipUnchanged:true});if(!(await skip).skipped)throw Error('Unchanged GPU frames counted');checks.push({name:'unchanged scenes do not count as new frames'});
 let rejected=false;try{await r.render({...scene,artworkRevision:r.artworkRevision-1});}catch{rejected=true;}if(!rejected)throw Error('Stale artwork accepted');checks.push({name:'stale artwork rejected'});
 art=await bitmap(1,1,[0,0,255,255]);await r.appendArtwork([art],r.artworkRevision);art.close();const frame=(nodes)=>({version:1,artworkRevision:r.artworkRevision,sequence:++sequence,time:sequence,epoch:'pipeline-fixture',nodes});const a=r.submit(frame([node()]),{clear:[0,0,0,1]}),b=r.submit(frame([node({texture:1,matrix:[1,0,0,1,8,0],size:[8,16]})]),{clear:[0,0,0,1]});let full=false;try{r.submit(frame([node()]));}catch{full=true;}if(!full)throw Error('GPU queue exceeded two frames');await Promise.all([a,b]);pixels=await r.readPixels();equal('pipelined buffer writes preserve the latest frame and clear',pixels,1,1,[0,0,0,255]);equal('pipelined texture/transform order',pixels,12,1,[0,0,255,255]);if(r.stats.peakFramesInFlight!==2)throw Error('Pipeline was not exercised');
 const result={checks,completedFrames:r.stats.completedFrames,adapter:r.adapterInfo};r.close();return result;
}
