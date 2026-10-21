// Owned scene export. Original BitmapData is read only, encoded only when its
// identity/revision is absent at the receiver. No final-game-frame capture.
private static var textureIDs:Dictionary=new Dictionary(true);
private static var objectIDs:Dictionary=new Dictionary(true);
private static var rasterCache:Dictionary=new Dictionary(true);
private static var rasterBytes:Number=0;
private static var nextTexture:uint=0;
private static var nextObject:uint=0;
private static var frameSequence:uint=0;
private static var sceneEpoch:uint=0;
private static var sceneGame:Game;
private static var sceneLevel:Object;
private static var sceneWidth:int=0;
private static var sceneHeight:int=0;
private static var exportKnown:Object;
private static var exportSeen:Object;
private static var exportRasters:Dictionary;
private static var exportArt:Array;
private static var exportNodes:Array;
private static var exportPixels:Number;
private static var exportBytes:Number;
private static var exportMatrices:Array;
private static var scalar32:flash.utils.ByteArray=new flash.utils.ByteArray();
private static function F32(value:Number):Number {scalar32.position=0;scalar32.writeFloat(value);scalar32.position=0;return scalar32.readFloat();}
private static function RoundEven(value:Number):Number {var base:Number=Math.floor(value);var fraction:Number=value-base;return fraction<0.5?base:fraction>0.5?base+1:base%2==0?base:base+1;}
private static function NativeMatrix(value:Matrix):Matrix {return new Matrix(F32(value.a),F32(value.b),F32(value.c),F32(value.d),int(value.tx*20)/20,int(value.ty*20)/20);}
private static function NativeConcat(child:Matrix,parent:Matrix):Matrix {
 var x:Number=F32(Math.round(child.tx*20));var y:Number=F32(Math.round(child.ty*20));
 return new Matrix(F32(F32(parent.a*child.a)+F32(parent.c*child.b)),F32(F32(parent.b*child.a)+F32(parent.d*child.b)),F32(F32(parent.a*child.c)+F32(parent.c*child.d)),F32(F32(parent.b*child.c)+F32(parent.d*child.d)),parent.tx+RoundEven(F32(F32(parent.a*x)+F32(parent.c*y)))/20,parent.ty+RoundEven(F32(F32(parent.b*x)+F32(parent.d*y)))/20);
}
private static var requestedKnown:Array;
private static var requestedReference:Boolean=false;
private static var completedRequest:Object;
private static var requestSequence:uint=0;
private static var afterDrawCalls:uint=0;
private static var afterDrawFault:String="";
private static var binaryTransport:Boolean=false;
private static var hiddenWorld:Bitmap;
private static var savedWorldVisible:Boolean=true;
private static var lastExportAt:uint=0;
private static var lastExportSupported:Boolean=false;
private static var skippedNativeWorldDraws:uint=0;
private static function RestoreNative():void {if(hiddenWorld){hiddenWorld.visible=savedWorldVisible;hiddenWorld=null;if(sceneGame)sceneGame.var_1778=false;}}
public static function NativeView(gpu:Boolean=false):Object {
 if(!main||!main.stage||!main.var_147||!main.var_147.bitmapData){RestoreNative();return {supported:false};}
 var bitmap:Bitmap=main.var_147;if(hiddenWorld&&hiddenWorld!=bitmap)RestoreNative();
 var a:Point=bitmap.localToGlobal(new Point());var b:Point=bitmap.localToGlobal(new Point(bitmap.bitmapData.width,bitmap.bitmapData.height));
 if(b.x<=a.x||b.y<=a.y){RestoreNative();return {supported:false};}
 if(gpu){if(!lastExportSupported||uint(getTimer()-lastExportAt)>200||main.var_523.length!=1||main.var_523[0].gameState!=Game.STATE_PLAY||main.var_523[0].screenMap.mbVisible||main.var_523[0].screenForge.mbVisible){RestoreNative();return {supported:false,hidden:false};}if(!hiddenWorld){hiddenWorld=bitmap;savedWorldVisible=bitmap.visible;}bitmap.visible=false;}else RestoreNative();
 return {supported:true,x:a.x,y:a.y,width:b.x-a.x,height:b.y-a.y,bitmapWidth:bitmap.bitmapData.width,bitmapHeight:bitmap.bitmapData.height,stageWidth:main.stage.stageWidth,stageHeight:main.stage.stageHeight,hidden:hiddenWorld!=null};
}
public static function BinaryProbe():Object {
 var bytes:flash.utils.ByteArray=new flash.utils.ByteArray();bytes.endian="littleEndian";for(var i:int=0;i<65536;i++)bytes.writeShort(i);return {encoding:"utf16-uri-v1",bytes:bytes.length,data:BinaryString(bytes)};
}
public static function SetBinary(enabled:Boolean):Boolean {binaryTransport=enabled;return true;}
private static function BinaryString(source:flash.utils.ByteArray):String {
 var bytes:flash.utils.ByteArray=new flash.utils.ByteArray();bytes.writeByte(255);bytes.writeByte(254);bytes.writeBytes(source,0,source.length);if(source.length%2)bytes.writeByte(0);
 // Native legacy escape is a UTF-16 code-unit encoder, unlike UTF-8 URI
 // encoding. Its output must pass the complete 65,536-word probe before use.
 return escape(bytes.toString());
}
public static function RequestFrame(known:Array,reference:Boolean=false):uint {
 if(!writeCoverage||!known||known.length>2048||requestedKnown)return 0;requestSequence++;if(!requestSequence)throw new Error("Snapshot request sequence exhausted");requestedKnown=known;requestedReference=researchProbes&&reference;completedRequest=null;return requestSequence;
}
public static function FrameResult():Object {return completedRequest;}
private static function CompleteRequest(phase:String):void {
 var known:Array=requestedKnown;requestedKnown=null;var start:uint=getTimer();var packet:Object=Frame(known,requestedReference);packet.request=requestSequence;packet.captureMs=uint(getTimer()-start);packet.samplingPhase=phase;if(!packet.supported)RestoreNative();completedRequest=packet;
}
// Called only at the exact reviewed compositor boundary, after PrepareFrame
// and before its bitmap read/clear/draw loop. Its original UI-scale tail and
// complete native allocation/recovery path remain available and unchanged.
public static function World(game:Game):Boolean {
 try{if(!hiddenWorld||!main||main.var_147!=hiddenWorld||!lastExportSupported||requestedReference)return false;
  if(main.var_523.length!=1||main.var_523[0]!=game||game.gameState!=Game.STATE_PLAY||game.screenMap.mbVisible||game.screenForge.mbVisible||uint(getTimer()-lastExportAt)>200){RestoreNative();return false;}
  if(requestedKnown){CompleteRequest("gpu-world-only");if(!completedRequest.supported)return false;}skippedNativeWorldDraws++;return true;
 }catch(error:Error){RestoreNative();return false;}
}
public static function AfterDraw(game:Game):void {
 try{afterDrawCalls++;if(hiddenWorld&&(!main||main.var_523.length!=1||game.gameState!=Game.STATE_PLAY))RestoreNative();if(!requestedKnown||!main||main.var_523.length!=1||main.var_523[0]!=game)return;
 CompleteRequest("after-native-world-draw");
 }catch(error:Error){RestoreNative();afterDrawFault=error.toString();requestedKnown=null;completedRequest={protocol:1,supported:false,reason:"Owned draw observer failed: "+afterDrawFault,request:requestSequence};}
}

private static function ObjectID(value:Object):String {
 var id:uint=uint(objectIDs[value]);if(!id){id=++nextObject;if(!id)throw new Error("Object identity exhausted");objectIDs[value]=id;}return "o"+id;
}
private static function Base64(bytes:flash.utils.ByteArray):String {
 var alphabet:String="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";var chunks:Array=[];var small:Array=[];bytes.position=0;
 while(bytes.bytesAvailable){var a:uint=bytes.readUnsignedByte();var left:uint=bytes.bytesAvailable;var b:uint=left?bytes.readUnsignedByte():0;var c:uint=left>1?bytes.readUnsignedByte():0;
  small.push(alphabet.charAt(a>>2)+alphabet.charAt(((a&3)<<4)|(b>>4))+(left?alphabet.charAt(((b&15)<<2)|(c>>6)):"=")+(left>1?alphabet.charAt(c&63):"="));
  if(small.length==4096){chunks.push(small.join(""));small=[];}
 }if(small.length)chunks.push(small.join(""));return chunks.join("");
}
private static function Texture(data:BitmapData):String {
 var value:uint=uint(textureIDs[data]);if(!value){value=++nextTexture;if(!value)throw new Error("Texture identity exhausted");textureIDs[data]=value;}
 var id:String="b"+value;if(exportSeen[id])return id;
 var w:int=data.width;var h:int=data.height;if(w<1||h<1||w>8190||h>8190||w*h>16777216)throw new Error("Native artwork dimensions unsupported");
 exportPixels+=w*h;if(exportPixels*4>134217728)throw new Error("Native artwork budget exceeded");
 var version:uint=Version(data);exportSeen[id]={id:id,revision:version,width:w,height:h};
 if(exportKnown[id]===undefined||uint(exportKnown[id])!=version){
  var png:flash.utils.ByteArray=data.encode(data.rect,new flash.display.PNGEncoderOptions(binaryTransport));exportBytes+=png.length;
  if(png.length>8388608||exportBytes>33554432)throw new Error("Native artwork transfer budget exceeded");
  if(binaryTransport)exportArt.push({id:id,revision:version,width:w,height:h,encoding:"utf16-uri-v1",byteLength:png.length,binary:BinaryString(png)});
  else exportArt.push({id:id,revision:version,width:w,height:h,png:Base64(png)});
 }return id;
}
private static function GraphicsOf(node:DisplayObject):Graphics {
 if(node is Sprite)return (node as Sprite).graphics;if(node is Shape)return (node as Shape).graphics;return null;
}
private static function AxisBounds(rect:Rectangle,matrix:Matrix):Rectangle {
 if(Math.abs(matrix.b)>0.000001||Math.abs(matrix.c)>0.000001)throw new Error("Rotated native clipping requires native rendering");
 var a:Point=matrix.transformPoint(new Point(rect.left,rect.top));var b:Point=matrix.transformPoint(new Point(rect.right,rect.bottom));
 return new Rectangle(Math.min(a.x,b.x),Math.min(a.y,b.y),Math.abs(b.x-a.x),Math.abs(b.y-a.y));
}
private static function Outside(bounds:Rectangle,matrix:Matrix,clip:Rectangle):Boolean {
 var a:Point=matrix.transformPoint(new Point(bounds.left,bounds.top));var b:Point=matrix.transformPoint(new Point(bounds.right,bounds.top));var c:Point=matrix.transformPoint(new Point(bounds.left,bounds.bottom));var d:Point=matrix.transformPoint(new Point(bounds.right,bounds.bottom));
 // Keep a two-pixel safety margin for edge coverage and native quantization.
 return Math.max(a.x,b.x,c.x,d.x)<clip.left-2||Math.min(a.x,b.x,c.x,d.x)>clip.right+2||Math.max(a.y,b.y,c.y,d.y)<clip.top-2||Math.min(a.y,b.y,c.y,d.y)>clip.bottom+2;
}
private static function Raster(node:DisplayObject,graphics:Graphics,matrix:Matrix,ancestry:String):Object {
 // Bake the exact linear transform into vector/text art at native quality;
 // translation remains a cheap GPU transform. This avoids rotating a low-
 // resolution raster where the native game would draw antialiased vectors.
 var signature:String=ancestry+":"+matrix.a+","+matrix.b+","+matrix.c+","+matrix.d+":"+(graphics?Version(graphics):0);
 if(node is TextField){var text:TextField=node as TextField;signature+=":"+text.htmlText+":"+text.width+":"+text.height+":"+text.scrollH+":"+text.scrollV+":"+text.embedFonts+":"+text.antiAliasType+":"+text.gridFitType+":"+text.sharpness+":"+text.thickness+":"+text.background+":"+text.backgroundColor+":"+text.border+":"+text.borderColor+":"+text.textColor;}
 var cached:Object=rasterCache[node];exportRasters[node]=true;if(cached&&cached.signature==signature)return cached;
 var source:DisplayObject=node;
 if(graphics&&!(node is Shape)){var clone:Shape=new Shape();clone.graphics.copyFrom(graphics);source=clone;}
 var linear:Matrix=new Matrix(matrix.a,matrix.b,matrix.c,matrix.d,0,0);var bounds:Rectangle=source.getBounds(source);
 if(bounds.width<=0||bounds.height<=0)return null;
 var p0:Point=linear.transformPoint(new Point(bounds.left,bounds.top));var p1:Point=linear.transformPoint(new Point(bounds.right,bounds.top));var p2:Point=linear.transformPoint(new Point(bounds.left,bounds.bottom));var p3:Point=linear.transformPoint(new Point(bounds.right,bounds.bottom));
 var left:int=Math.floor(Math.min(p0.x,p1.x,p2.x,p3.x))-1;var top:int=Math.floor(Math.min(p0.y,p1.y,p2.y,p3.y))-1;
 var right:int=Math.ceil(Math.max(p0.x,p1.x,p2.x,p3.x))+1;var bottom:int=Math.ceil(Math.max(p0.y,p1.y,p2.y,p3.y))+1;
 if(right<=left||bottom<=top)return null;if((right-left)*(bottom-top)>4194304)throw new Error("Native vector raster exceeds budget");
 var bytes:Number=(right-left)*(bottom-top)*4;if(rasterBytes+bytes-(cached?cached.bytes:0)>33554432)throw new Error("Owned native raster cache budget exceeded");
 var data:BitmapData=new BitmapData(right-left,bottom-top,true,0);linear.tx=-left;linear.ty=-top;
 try{data.drawWithQuality(source,linear,null,null,null,false,flash.display.StageQuality.HIGH);}catch(error:Error){data.dispose();throw error;}
 if(cached){cached.data.dispose();rasterBytes-=cached.bytes;}rasterBytes+=bytes;cached={signature:signature,data:data,left:left,top:top,bytes:bytes};rasterCache[node]=cached;return cached;
}
private static function Motion(id:String,matrix:Matrix):Object {return {id:id,parent:[matrix.a,matrix.b,matrix.c,matrix.d,matrix.tx,matrix.ty]};}
private static function Emit(id:String,data:BitmapData,matrix:Matrix,tint:Array,offset:Array,clip:Rectangle,smoothing:Boolean,motion:Object=null):void {
 if(Outside(data.rect,matrix,clip))return;
 if(exportNodes.length>=16384)throw new Error("Native scene node budget exceeded");
 for(var i:int=0;i<4;i++)if(!isFinite(tint[i])||Math.abs(tint[i])>16||!isFinite(offset[i])||Math.abs(offset[i])>16)throw new Error("Native color transform exceeds reviewed range");
 var texture:String=Texture(data);var visual:Object={id:id,textureId:texture,matrix:[matrix.a,matrix.b,matrix.c,matrix.d,matrix.tx,matrix.ty],size:[data.width,data.height],tint:tint,offset:offset,clip:[clip.left,clip.top,clip.right,clip.bottom],blend:"normal",interpolate:true,sampling:smoothing?"linear":"nearest"};if(motion)visual.motion=motion;exportNodes.push(visual);
}
private static function Walk(node:DisplayObject,matrix:Matrix,tint:Array,offset:Array,clip:Rectangle,ancestry:String,depth:int,root:Boolean=false,motion:Object=null):void {
 if(depth>64)throw new Error("Native scene nesting budget exceeded");if(!node.visible||node.alpha==0)return;
 if(root){matrix=NativeMatrix(matrix);motion=Motion(ObjectID(node),matrix);}
 if(node.mask||node.blendMode!="normal")throw new Error("Native mask/blend requires native rendering");
 var color:flash.geom.ColorTransform=node.transform.colorTransform;
 // drawWithQuality takes the top-level batch matrix explicitly. Root display
 // color/alpha semantics need parity checks before accepting non-neutral roots.
 if(root&&(color.redMultiplier!=1||color.greenMultiplier!=1||color.blueMultiplier!=1||color.alphaMultiplier!=1||color.redOffset||color.greenOffset||color.blueOffset||color.alphaOffset))throw new Error("Non-neutral native draw root requires native rendering");
 if(node.filters.length){FilterSignature(node.filters);var effectBounds:Rectangle=node.getBounds(node);var effectPadding:Number=EffectExpansion(node);effectBounds.inflate(effectPadding,effectPadding);if(Outside(effectBounds,matrix,clip))return;var effect:Object=RasterEffect(node,matrix,ancestry);Emit(ObjectID(node)+"f",effect.data,new Matrix(1,0,0,1,matrix.tx+effect.left,matrix.ty+effect.top),tint,offset,clip,false,motion);return;}
 var nextTint:Array=[tint[0]*color.redMultiplier,tint[1]*color.greenMultiplier,tint[2]*color.blueMultiplier,tint[3]*color.alphaMultiplier];
 var nextOffset:Array=[offset[0]+tint[0]*color.redOffset/255,offset[1]+tint[1]*color.greenOffset/255,offset[2]+tint[2]*color.blueOffset/255,offset[3]+tint[3]*color.alphaOffset/255];
 var scroll:Rectangle=node.scrollRect;
 if(scroll){matrix=matrix.clone();matrix.tx-=scroll.x*matrix.a+scroll.y*matrix.c;matrix.ty-=scroll.x*matrix.b+scroll.y*matrix.d;clip=clip.intersection(AxisBounds(scroll,matrix));if(clip.isEmpty())return;}
 if(node is MovieClip)ancestry+=":"+ObjectID(node)+"="+(node as MovieClip).currentFrame;
 if(node is Bitmap){var bitmap:Bitmap=node as Bitmap;if(!bitmap.bitmapData)return;var snapped:Matrix=matrix.clone();if(exportMatrices){var native:Matrix=bitmap.transform.concatenatedMatrix;exportMatrices.push({id:ObjectID(node),raw:[matrix.a,matrix.b,matrix.c,matrix.d,matrix.tx,matrix.ty],native:[native.a,native.b,native.c,native.d,native.tx,native.ty],snapping:bitmap.pixelSnapping});}var auto:Boolean=bitmap.pixelSnapping=="auto"&&matrix.a>=0.999&&matrix.a<=1.001&&matrix.d>=0.999&&matrix.d<=1.001&&matrix.b==0&&matrix.c==0;if(bitmap.pixelSnapping=="always"||auto){snapped.tx=matrix.tx<0?Math.ceil(matrix.tx-0.5):Math.floor(matrix.tx+0.5);snapped.ty=matrix.ty<0?Math.ceil(matrix.ty-0.5):Math.floor(matrix.ty+0.5);if(auto){snapped.a=1;snapped.d=1;}}Emit(ObjectID(node),bitmap.bitmapData,snapped,nextTint,nextOffset,clip,bitmap.smoothing,motion);return;}
 var graphics:Graphics=GraphicsOf(node);if(node is TextField||graphics&&graphics.readGraphicsData().length){var art:Object=Raster(node,graphics,matrix,ancestry);if(art)Emit(ObjectID(node)+"g",art.data,new Matrix(1,0,0,1,matrix.tx+art.left,matrix.ty+art.top),nextTint,nextOffset,clip,false,motion);}
 var container:DisplayObjectContainer=node as DisplayObjectContainer;
 if(container){for(var i:int=0;i<container.numChildren;i++){var child:DisplayObject=container.getChildAt(i);var childMatrix:Matrix=NativeConcat(child.transform.matrix,matrix);Walk(child,childMatrix,nextTint,nextOffset,clip,ancestry,depth+1,false,Motion(ObjectID(node),matrix));}}
 else if(!(node is Shape)&&!(node is TextField))throw new Error("Native display type requires native rendering");
}
private static function CaptureFrame(known:Array,reference:Boolean):Object {
 try{
  if(!writeCoverage||!main||mutationFault||!main.var_147||!main.var_147.bitmapData||!known||known.length>2048)return {protocol:1,supported:false,reason:"Native scene bridge unavailable"};
  var selected:Game=null;for each(var game:Game in main.var_523)if(game.gameState==Game.STATE_PLAY){if(selected)throw new Error("Multiple native scenes require native rendering");selected=game;}
  if(!selected||selected.screenMap.mbVisible||selected.screenForge.mbVisible)return {protocol:1,supported:false,reason:"Native menu or transition"};
  var width:int=main.var_147.bitmapData.width;var height:int=main.var_147.bitmapData.height;
  if(selected!=sceneGame||selected.var_107!=sceneLevel||width!=sceneWidth||height!=sceneHeight){sceneGame=selected;sceneLevel=selected.var_107;sceneWidth=width;sceneHeight=height;sceneEpoch++;}
  exportKnown={};for each(var entry:Object in known){if(!entry||typeof entry.id!="string"||!/^b[1-9][0-9]{0,9}$/.test(entry.id)||Number(entry.revision)<0||Number(entry.revision)>4294967295||Number(entry.revision)!=uint(entry.revision))throw new Error("Invalid native artwork acknowledgement");exportKnown[entry.id]=uint(entry.revision);}
  exportSeen={};exportRasters=new Dictionary();exportArt=[];exportNodes=[];exportPixels=0;exportBytes=0;exportMatrices=reference?[]:null;
  var clip:Rectangle=new Rectangle(0,0,width,height);var scale:Matrix=new Matrix(main.overallScale,0,0,main.overallScale);
  for(var i:int=0;i<selected.var_1040.numChildren;i++){
   var layer:Sprite=selected.var_1040.getChildAt(i) as Sprite;if(!layer)throw new Error("Unknown native world batch");if(!layer.visible)continue;var matrix:Matrix=layer.transform.matrix;matrix.concat(scale);
   if(layer==selected.levelLayer){for(var j:int=0;j<layer.numChildren;j++){
    var child:Sprite=layer.getChildAt(j) as Sprite;if(!child)throw new Error("Unknown native level batch");if(!child.visible)continue;var next:Matrix=child.transform.matrix;next.concat(matrix);
    if(selected.var_107&&child==selected.var_107.var_343)next=new Matrix(1,0,0,1,(layer.x+child.x)*main.overallScale,(layer.y+child.y)*main.overallScale);
    Walk(child,next,[1,1,1,1],[0,0,0,0],clip,"",0,true);
   }}else Walk(layer,matrix,[1,1,1,1],[0,0,0,0],clip,"",0,true);
  }
  for(var cachedNode:Object in rasterCache)if(!exportRasters[cachedNode]){rasterCache[cachedNode].data.dispose();rasterBytes-=rasterCache[cachedNode].bytes;delete rasterCache[cachedNode];}
  var active:Array=[];for each(var descriptor:Object in exportSeen)active.push(descriptor);if(active.length>2048)throw new Error("Native texture count exceeds budget");
  frameSequence++;if(!frameSequence)throw new Error("Scene sequence exhausted");var packet:Object={protocol:1,supported:true,epoch:"native-"+sceneEpoch,sequence:frameSequence,width:width,height:height,clear:[72/255,73/255,85/255,1],nodes:exportNodes,art:exportArt,activeArt:active,decodedBytes:exportPixels*4,encodedBytes:exportBytes,worldOnly:true,requiresAssetContract:true};
  // Explicit one-off diagnostic reference ONLY. GPU artwork is exclusively
  // packet.art's individual native caches; this final framebuffer is never
  // a texture source or used by the render loop.
  if(reference){packet.nativeReference=Base64(main.var_147.bitmapData.encode(main.var_147.bitmapData.rect,new flash.display.PNGEncoderOptions()));packet.matrixProbe=exportMatrices;var worldMatrix:Matrix=selected.var_1040.transform.concatenatedMatrix;packet.worldMatrix=[worldMatrix.a,worldMatrix.b,worldMatrix.c,worldMatrix.d,worldMatrix.tx,worldMatrix.ty];packet.nativeScale=main.overallScale;}return packet;
 }catch(error:Error){return {protocol:1,supported:false,reason:error.message};}
}
public static function Frame(known:Array,reference:Boolean=false):Object {var packet:Object=CaptureFrame(known,researchProbes&&reference);lastExportSupported=packet.supported===true;if(lastExportSupported)lastExportAt=getTimer();exportKnown=null;exportSeen=null;exportRasters=null;exportArt=null;exportNodes=null;exportMatrices=null;return packet;}
public static function Release():Boolean {RestoreNative();for(var node:Object in rasterCache)rasterCache[node].data.dispose();rasterCache=new Dictionary(true);rasterBytes=0;sceneGame=null;sceneEpoch++;return true;}
