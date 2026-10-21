// A CSS cursor on this game's canvas only. Native text/resize/busy pointers
// remain native; original artwork is decoded in memory and never persisted.
export class LocalCursor {
 constructor({send=()=>{}}={}){this.send=send;this.cache=new Map();this.key='';this.style=null;this.root=null;this.version=0;}
 receive(data){if(data?.type!=='system-pointer'||!['default','pointer','crosshair'].includes(data.cursor))return;const p=data.value;if(!p||!Number.isInteger(p.width)||p.width<1||p.width>145||typeof p.png!=='string'||p.png.length>27000||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(p.png))return;this.cache.set(data.cursor,p);this.key='';}
 async update(spec,{visible=true,focused=document.hasFocus()}={}){
  const root=document.querySelector('ruffle-player')?.shadowRoot,canvas=root?.querySelector('canvas');if(!canvas||!window.blitzCrosshair)return;
  if(this.root!==root){this.style?.remove();this.root=root;this.style=document.createElement('style');root.appendChild(this.style);this.key='';}
  if(!visible||!focused||spec.style==='default'){if(this.style.textContent)this.style.textContent='';this.key='';this.version++;return;}
  const baseline=this.style.textContent;this.style.textContent='';const native=getComputedStyle(canvas).cursor;this.style.textContent=baseline;
  const key=JSON.stringify([spec,devicePixelRatio,visible,focused,native]);if(key===this.key)return;this.key=key;const version=++this.version;this.style.textContent='';
  if(!visible||!focused||spec.style==='default'||/^(?:text|vertical-text|.*-resize|wait|progress|not-allowed)$/.test(native))return;
  let art=window.blitzCrosshair.pixels(spec,Math.min(devicePixelRatio,2)),hotspotX=art.hotspot,hotspotY=art.hotspot;
  if(spec.style==='original'){
   const match=/url\(["']?(data:image\/png;base64,[A-Za-z0-9+/=]+)["']?\)\s*(\d+)?\s*(\d+)?/.exec(native);let png;
   if(match){png=match[1];hotspotX=Number(match[2]||0);hotspotY=Number(match[3]||0);}
   else{const kind=['pointer','crosshair'].includes(native)?native:'default',p=this.cache.get(kind);if(!p){this.send({type:'pointer-request',cursor:kind});this.key='';return;}png=p.png;hotspotX=p.hotspotX;hotspotY=p.hotspotY;}
   const image=await createImageBitmap(await(await fetch(png)).blob());if(image.width>145||image.height>145){image.close();return;}
   const size=Math.max(image.width,image.height),surface=new OffscreenCanvas(size,size),ctx=surface.getContext('2d');ctx.drawImage(image,0,0);image.close();const clamped=ctx.getImageData(0,0,size,size).data,rgba=new Uint8Array(clamped.buffer,clamped.byteOffset,clamped.byteLength);art={width:size,rgba:window.blitzCrosshair.recolor(rgba,spec.color)};
   if(globalThis.CompressionStream){const packed=new Uint8Array(await new Response(new Blob([rgba]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());if(packed.length<5000)this.send({type:'original-pointer',value:{width:size,hotspotX,hotspotY,compressed:btoa(String.fromCharCode(...packed))}});}
  }
  if(version!==this.version||!visible||!document.hasFocus())return;
  const surface=document.createElement('canvas');surface.width=surface.height=art.width;surface.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(art.rgba),art.width,art.width),0,0);this.style.textContent=`canvas{cursor:url("${surface.toDataURL()}") ${hotspotX} ${hotspotY},auto!important}`;
 }
 close(){this.version++;this.style?.remove();this.cache.clear();}
}
