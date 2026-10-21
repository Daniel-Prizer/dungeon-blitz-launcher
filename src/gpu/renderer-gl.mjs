import {LIMITS,validateSnapshot} from './scene.mjs';

const vertex=`#version 300 es
precision highp float;
layout(location=0) in vec4 matrix;
layout(location=1) in vec4 originSize;
layout(location=2) in vec4 uv;
layout(location=3) in vec4 tint;
layout(location=4) in vec4 colorOffset;
layout(location=5) in vec4 clip;
uniform vec2 view;
out vec2 texcoord;
out vec4 multiplyColor;
out vec4 addColor;
out vec4 clipBox;
out vec4 uvBounds;
void main(){
 vec2 corners[6]=vec2[6](vec2(0,0),vec2(1,0),vec2(0,1),vec2(0,1),vec2(1,0),vec2(1,1));
 vec2 q=corners[gl_VertexID],p=q*originSize.zw;
 vec2 pixel=vec2(matrix.x*p.x+matrix.z*p.y,matrix.y*p.x+matrix.w*p.y)+originSize.xy;
 gl_Position=vec4(pixel/view*vec2(2,-2)+vec2(-1,1),0,1);
 texcoord=mix(uv.xy,uv.zw,q);multiplyColor=tint;addColor=colorOffset;clipBox=clip;uvBounds=uv;
}`;
const fragment=`#version 300 es
precision highp float;
uniform sampler2D artwork;
uniform vec2 view;
in vec2 texcoord;
in vec4 multiplyColor;
in vec4 addColor;
in vec4 clipBox;
in vec4 uvBounds;
out vec4 color;
void main(){
 vec2 p=vec2(gl_FragCoord.x,view.y-gl_FragCoord.y);
 if(p.x<clipBox.x||p.y<clipBox.y||p.x>=clipBox.z||p.y>=clipBox.w)discard;
 vec2 halfTexel=vec2(.5)/vec2(textureSize(artwork,0));
 vec4 pixel=texture(artwork,clamp(texcoord,uvBounds.xy+halfTexel,uvBounds.zw-halfTexel));
 float alpha=clamp(pixel.a*multiplyColor.a+addColor.a,0.,1.);
 vec3 straight=pixel.rgb/max(pixel.a,.000001);
 color=vec4(clamp(straight*multiplyColor.rgb+addColor.rgb,0.,1.)*alpha,alpha);
}`;

// The native Flash host supports WebGL2 in an OffscreenCanvas worker. Keep the
// same validated retained-scene protocol as WebGPU; never draw a captured frame
// or drive a Flash/game clock. Two bounded fences hide the driver round trip
// without accumulating an unbounded render queue.
export class GlSceneRenderer {
 static async create({width,height,requireHardware=true,maxNodes=4096,canvas}={}){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>4096||height>4096||!Number.isInteger(maxNodes)||maxNodes<1||maxNodes>LIMITS.nodes)throw Error('Invalid render dimensions or node budget');
  const surface=canvas||new OffscreenCanvas(width,height);surface.width=width;surface.height=height;
  const gl=surface.getContext('webgl2',{alpha:true,antialias:true,premultipliedAlpha:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});if(!gl)throw Error('Worker WebGL2 unavailable');
  const debug=gl.getExtension('WEBGL_debug_renderer_info'),description=debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):'';
  if(requireHardware&&(!description||/swiftshader|software|basic render|llvmpipe/i.test(description)))throw Error('Hardware GPU not established');
  const self=new GlSceneRenderer(gl,surface,{width,height,maxNodes,description});try{self.init();return self;}catch(error){self.close();throw error;}
 }
 constructor(gl,canvas,{width,height,maxNodes,description}){Object.assign(this,{gl,canvas,width,height,maxNodes});this.maxFramesInFlight=2;this.art=[];this.atlasBytes=0;this.artworkRevision=0;this.inFlight=0;this.updating=false;this.closed=false;this.attached=false;this.stats={completedFrames:0,submissions:0,failedFrames:0,submittedPresents:0,textureUpdates:0,peakFramesInFlight:0};this.adapterInfo={backend:'native-flash-worker-webgl2',description,isFallbackAdapter:false};this.pixels=new Float32Array(maxNodes*24);this.frameId=0;this.channel=new MessageChannel();this.polls=[];this.channel.port1.onmessage=()=>this.polls.shift()?.();}
 get busy(){return this.updating||this.inFlight>0;}
 assertReady(){if(this.closed||this.gl.isContextLost())throw Error('GPU context unavailable; restore native rendering');}
 init(){const g=this.gl;this.program=g.createProgram();for(const [type,source]of [[g.VERTEX_SHADER,vertex],[g.FRAGMENT_SHADER,fragment]]){const shader=g.createShader(type);g.shaderSource(shader,source);g.compileShader(shader);if(!g.getShaderParameter(shader,g.COMPILE_STATUS))throw Error(g.getShaderInfoLog(shader));g.attachShader(this.program,shader);g.deleteShader(shader);}g.linkProgram(this.program);if(!g.getProgramParameter(this.program,g.LINK_STATUS))throw Error(g.getProgramInfoLog(this.program));g.useProgram(this.program);g.uniform2f(g.getUniformLocation(this.program,'view'),this.width,this.height);g.uniform1i(g.getUniformLocation(this.program,'artwork'),0);this.buffer=g.createBuffer();g.bindBuffer(g.ARRAY_BUFFER,this.buffer);g.bufferData(g.ARRAY_BUFFER,this.pixels.byteLength,g.DYNAMIC_DRAW);g.viewport(0,0,this.width,this.height);g.enable(g.BLEND);this.check();}
 check(){const error=this.gl.getError();if(error!==this.gl.NO_ERROR)throw Error('GPU operation failed: '+error);this.assertReady();}
 async setArtwork(bitmaps){return this.uploadArtwork(bitmaps,false);}
 async appendArtwork(bitmaps,expected){if(expected!==this.artworkRevision)throw Error('Stale artwork append');return this.uploadArtwork(bitmaps,true);}
 dimensions(bitmap){return bitmap&&Number.isInteger(bitmap.width)&&Number.isInteger(bitmap.height)&&bitmap.width>0&&bitmap.height>0&&bitmap.width<=Math.min(LIMITS.dimension,this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE))&&bitmap.height<=Math.min(LIMITS.dimension,this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE));}
 async uploadArtwork(bitmaps,append){this.assertReady();if(this.busy||!Array.isArray(bitmaps)||!bitmaps.length||bitmaps.length+(append?this.art.length:0)>LIMITS.textures||bitmaps.some(b=>!this.dimensions(b)))throw Error('Invalid artwork set or render in flight');const bytes=bitmaps.reduce((n,b)=>n+b.width*b.height*4,0)+(append?this.atlasBytes:0);if(bytes>LIMITS.atlasBytes)throw Error('Artwork budget exceeded');const g=this.gl,added=[];this.updating=true;try{for(const bitmap of bitmaps){const texture=g.createTexture();added.push({texture,width:bitmap.width,height:bitmap.height,reservedWidth:bitmap.width,reservedHeight:bitmap.height});g.bindTexture(g.TEXTURE_2D,texture);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.LINEAR);g.texImage2D(g.TEXTURE_2D,0,g.RGBA,g.RGBA,g.UNSIGNED_BYTE,bitmap);}this.check();}catch(error){added.forEach(a=>g.deleteTexture(a.texture));throw error;}finally{this.updating=false;}if(!append)this.art.forEach(a=>g.deleteTexture(a.texture));this.art=append?this.art.concat(added):added;this.atlasBytes=bytes;const previousRevision=this.artworkRevision++;this.lastFrame=null;return {kind:append?'append':'reset',previousRevision,artworkRevision:this.artworkRevision,images:bitmaps.length,bytes};}
 async reuseArtwork(changes,expected){return this.updateArtwork(changes,expected,true);}
 async updateArtwork(changes,expected,reuse=false){this.assertReady();const seen=new Set();if(this.busy||expected!==this.artworkRevision||!Array.isArray(changes)||!changes.length||changes.length>LIMITS.textures)throw Error('Invalid artwork update');for(const {index,bitmap}of changes){const art=this.art[index];if(!Number.isInteger(index)||seen.has(index)||!art||!this.dimensions(bitmap)||(reuse?(bitmap.width>art.reservedWidth||bitmap.height>art.reservedHeight):(bitmap.width!==art.width||bitmap.height!==art.height)))throw Error('Artwork update dimensions changed');seen.add(index);}const g=this.gl;this.updating=true;try{for(const {index,bitmap}of changes){const art=this.art[index];g.bindTexture(g.TEXTURE_2D,art.texture);g.texSubImage2D(g.TEXTURE_2D,0,0,0,g.RGBA,g.UNSIGNED_BYTE,bitmap);art.width=bitmap.width;art.height=bitmap.height;}this.check();}finally{this.updating=false;}const previousRevision=this.artworkRevision++;this.stats.textureUpdates+=changes.length;this.lastFrame=null;return {kind:reuse?'reuse':'update',previousRevision,artworkRevision:this.artworkRevision,changedIndices:[...seen]};}
 attachCanvas(canvas){this.assertReady();if(this.busy||canvas!==this.canvas)throw Error('Invalid GPU canvas');this.attached=true;this.lastFrame=null;}
 detachCanvas(){if(this.busy)throw Error('Render in flight');this.attached=false;}
 async render(input,options){return this.submit(input,options);}
 submit(input,{clear=[0,0,0,0],skipUnchanged=false}={}){this.assertReady();if(this.updating||this.inFlight>=this.maxFramesInFlight||!this.art.length)throw Error('Render in flight or artwork unavailable');const scene=validateSnapshot(input);if(scene.artworkRevision!==this.artworkRevision||scene.nodes.length>this.maxNodes||!Array.isArray(clear)||clear.length!==4||clear.some(n=>!Number.isFinite(n)||n<0||n>1))throw Error('Invalid scene revision or render budget');let at=0;for(const n of scene.nodes){const art=this.art[n.texture];if(!art)throw Error('Missing native artwork');this.pixels.set([...n.matrix.slice(0,4),n.matrix[4],n.matrix[5],...n.size,0,0,art.width/art.reservedWidth,art.height/art.reservedHeight,...n.tint,...n.offset,...n.clip],at++*24);}const words=new Uint32Array(this.pixels.buffer,0,at*24),key=scene.nodes.map(n=>[n.texture,n.blend,n.sampling].join(':')).join('|'),last=this.lastFrame;if(skipUnchanged&&last&&last.revision===this.artworkRevision&&last.key===key&&last.words.length===words.length&&last.words.every((n,i)=>n===words[i])&&last.clear.every((n,i)=>n===clear[i])){this.stats.skippedUnchanged=(this.stats.skippedUnchanged||0)+1;const task=Promise.resolve({skipped:true,sequence:scene.sequence});task.skipped=true;return task;}const g=this.gl,start=performance.now();g.useProgram(this.program);g.bindBuffer(g.ARRAY_BUFFER,this.buffer);g.bufferSubData(g.ARRAY_BUFFER,0,this.pixels.subarray(0,at*24));g.clearColor(...clear);g.clear(g.COLOR_BUFFER_BIT);for(let i=0;i<scene.nodes.length;i++){const n=scene.nodes[i];g.bindTexture(g.TEXTURE_2D,this.art[n.texture].texture);const filter=n.sampling==='nearest'?g.NEAREST:g.LINEAR;g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,filter);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,filter);g.blendFuncSeparate(g.ONE,n.blend==='add'?g.ONE:g.ONE_MINUS_SRC_ALPHA,g.ONE,g.ONE_MINUS_SRC_ALPHA);for(let a=0;a<6;a++){g.enableVertexAttribArray(a);g.vertexAttribPointer(a,4,g.FLOAT,false,96,i*96+a*16);g.vertexAttribDivisor(a,1);}g.drawArraysInstanced(g.TRIANGLES,0,6,1);}this.check();const sync=g.fenceSync(g.SYNC_GPU_COMMANDS_COMPLETE,0);if(!sync)throw Error('GPU fence unavailable');g.flush();this.inFlight++;this.stats.submissions++;this.stats.submittedPresents+=this.attached?1:0;this.stats.peakFramesInFlight=Math.max(this.stats.peakFramesInFlight,this.inFlight);this.lastFrame={revision:this.artworkRevision,key,words:new Uint32Array(words),clear:[...clear]};const frameId=++this.frameId;return new Promise((resolve,reject)=>{const poll=()=>{try{this.assertReady();const state=g.clientWaitSync(sync,0,0);if(state===g.WAIT_FAILED||performance.now()-start>1000)throw Error('GPU fence failed or timed out');if(state===g.TIMEOUT_EXPIRED){this.polls.push(poll);this.channel.port2.postMessage(1);return;}this.stats.completedFrames++;resolve({frameId,sequence:scene.sequence,sceneTime:scene.time,cpuAndGpuMs:performance.now()-start,nodes:at,drawCalls:at});}catch(error){this.stats.failedFrames++;reject(error);}finally{if(!this.polls.includes(poll)){g.deleteSync(sync);this.inFlight--;}}};this.polls.push(poll);this.channel.port2.postMessage(1);});}
 async readPixels(){this.assertReady();if(this.busy)throw Error('Render in flight');const g=this.gl,raw=new Uint8Array(this.width*this.height*4),pixels=new Uint8Array(raw.length);g.readPixels(0,0,this.width,this.height,g.RGBA,g.UNSIGNED_BYTE,raw);this.check();for(let y=0;y<this.height;y++)pixels.set(raw.subarray(y*this.width*4,(y+1)*this.width*4),(this.height-y-1)*this.width*4);return pixels;}
 close(){if(this.closed)return;if(this.busy)throw Error('Render in flight');this.closed=true;this.art.forEach(a=>this.gl.deleteTexture(a.texture));this.gl.deleteBuffer(this.buffer);this.gl.deleteProgram(this.program);this.channel.port1.close();this.channel.port2.close();}
}
