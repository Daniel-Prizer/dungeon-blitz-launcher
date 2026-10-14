'use strict';
// Shared, bounded pointer artwork. No remote assets or player input are used.
(function(root){
  const styles=['default','cross','dot','ring'];
  function valid(input={}){
    return {style:styles.includes(input?.style)?input.style:'default',
      color:typeof input?.color==='string'&&/^#[0-9a-f]{6}$/i.test(input.color)?input.color.toLowerCase():'#8cff65',
      size:[16,24,32,48].includes(input?.size)?input.size:24,
      outline:input?.outline!==false};
  }
  function pixels(input,density=1){
    const s=valid(input),scale=Number.isFinite(density)?Math.max(.5,Math.min(3,density)):1;
    const width=Math.min(145,Math.round(s.size*scale/2)*2+1),center=(width-1)/2;
    const rgba=new Uint8Array(width*width*4),ink=new Uint8Array(width*width),radius=Math.max(2,Math.round(width*.31)),half=Math.max(0,Math.round(scale)-1),gap=Math.max(2,Math.round(width*.10));
    for(let y=0;y<width;y++)for(let x=0;x<width;x++){
      const dx=Math.abs(x-center),dy=Math.abs(y-center),distance=Math.hypot(dx,dy);
      ink[y*width+x]=Number(s.style==='cross'?((dx<=half&&dy>=gap&&dy<=radius)||(dy<=half&&dx>=gap&&dx<=radius)):
        s.style==='dot'?distance<=Math.max(2,Math.round(width*.09)):
        s.style==='ring'?Math.abs(distance-radius)<=Math.max(.6,scale*.7):false);
    }
    const rgb=[1,3,5].map(n=>parseInt(s.color.slice(n,n+2),16));
    for(let y=0;y<width;y++)for(let x=0;x<width;x++){
      const index=y*width+x;let border=false;
      if(s.outline&&!ink[index])for(let j=-Math.ceil(scale);j<=Math.ceil(scale)&&!border;j++)for(let i=-Math.ceil(scale);i<=Math.ceil(scale);i++){
        if(x+i>=0&&x+i<width&&y+j>=0&&y+j<width&&ink[(y+j)*width+x+i]){border=true;break;}
      }
      if(ink[index]||border){rgba.set(ink[index]?rgb:[15,18,21],index*4);rgba[index*4+3]=255;}
    }
    return {width,hotspot:center,rgba};
  }
  const api={styles,valid,pixels};if(typeof module==='object'&&module.exports)module.exports=api;else root.blitzCrosshair=api;
})(typeof window==='object'?window:globalThis);
