// Included ONLY in the owned offline DungeonBlitz fixture. Not a live-game hook.
// Rasterize original native draw batches individually, then hand their scene
// transforms to WebGPU. This is an integration/parity probe, NOT a fast live
// exporter: dynamic-layer dirty tracking and texture lifetime integration remain.
private function gpuBase64(bytes:flash.utils.ByteArray):String {
 var alphabet:String="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";var out:Array=[];
 bytes.position=0;
 while(bytes.bytesAvailable){var a:uint=bytes.readUnsignedByte();var left:uint=bytes.bytesAvailable;var b:uint=left?bytes.readUnsignedByte():0;var c:uint=left>1?bytes.readUnsignedByte():0;out.push(alphabet.charAt(a>>2),alphabet.charAt(((a&3)<<4)|(b>>4)),left?alphabet.charAt(((b&15)<<2)|(c>>6)):"=",left>1?alphabet.charAt(c&63):"=");}
 return out.join("");
}
private function gpuBatch(layer:flash.display.Sprite,matrix:flash.geom.Matrix,nodes:Array,art:Array):void {
 if(!layer.visible||!layer.numChildren&&!layer.graphics.readGraphicsData().length)return;
 if(nodes.length>=128)throw new Error("Native layer budget exceeded");
 var width:int=main.var_147.bitmapData.width;var height:int=main.var_147.bitmapData.height;
 // Clip in physical output space before allocating; no downsampling or invented
 // terrain. Preserve fractional positioning in the raster matrix.
 var bounds:flash.geom.Rectangle=layer.getBounds(layer);
 var points:Array=[new flash.geom.Point(bounds.left,bounds.top),new flash.geom.Point(bounds.right,bounds.top),new flash.geom.Point(bounds.left,bounds.bottom),new flash.geom.Point(bounds.right,bounds.bottom)];
 var left:Number=width;var top:Number=height;var right:Number=0;var bottom:Number=0;
 for each(var point:flash.geom.Point in points){point=matrix.transformPoint(point);left=Math.min(left,point.x);top=Math.min(top,point.y);right=Math.max(right,point.x);bottom=Math.max(bottom,point.y);}
 left=Math.max(0,Math.floor(left));top=Math.max(0,Math.floor(top));right=Math.min(width,Math.ceil(right));bottom=Math.min(height,Math.ceil(bottom));
 if(right<=left||bottom<=top)return;
 var w:int=int(right-left);var h:int=int(bottom-top);if(w*h>4194304)throw new Error("Native layer raster budget exceeded");
 var pixels:flash.display.BitmapData=new flash.display.BitmapData(w,h,true,0);var draw:flash.geom.Matrix=matrix.clone();draw.tx-=left;draw.ty-=top;
 try{pixels.drawWithQuality(layer,draw,null,null,null,false,flash.display.StageQuality.HIGH);var png:flash.utils.ByteArray=pixels.encode(pixels.rect,new flash.display.PNGEncoderOptions());
  if(png.length>8388608)throw new Error("Native artwork transfer budget exceeded");
  var index:int=art.length;art.push(gpuBase64(png));nodes.push({id:"native-layer-"+index,texture:index,matrix:[1,0,0,1,left,top],size:[w,h],tint:[1,1,1,1],clip:[0,0,width,height],blend:"normal",interpolate:false});
 }finally{pixels.dispose();}
}
private function gpuExport():Object {
 var nodes:Array=[];var art:Array=[];if(!game||!game.var_1040||!main.var_147.bitmapData)throw new Error("Initialize the offline world fixture first");
 var scale:flash.geom.Matrix=new flash.geom.Matrix(main.overallScale,0,0,main.overallScale);
 for(var i:int=0;i<game.var_1040.numChildren;i++){
  var layer:flash.display.Sprite=game.var_1040.getChildAt(i) as flash.display.Sprite;if(!layer)throw new Error("Unsupported native layer");if(!layer.visible)continue;
  var matrix:flash.geom.Matrix=layer.transform.matrix;matrix.concat(scale);
  if(layer==game.levelLayer){for(var j:int=0;j<layer.numChildren;j++){
   var child:flash.display.Sprite=layer.getChildAt(j) as flash.display.Sprite;if(!child)throw new Error("Unsupported native world layer");if(!child.visible)continue;
   var next:flash.geom.Matrix=child.transform.matrix;next.concat(matrix);
   if(game.var_107&&child==game.var_107.var_343)next=new flash.geom.Matrix(1,0,0,1,(layer.x+child.x)*main.overallScale,(layer.y+child.y)*main.overallScale);
   gpuBatch(child,next,nodes,art);
  }}else gpuBatch(layer,matrix,nodes,art);
 }
 var reference:flash.display.BitmapData=main.var_147.bitmapData;
 return {version:1,width:reference.width,height:reference.height,clear:[96/255,112/255,101/255,1],scene:{version:1,artworkRevision:1,sequence:1,time:0,epoch:"offline-native-world",nodes:nodes},art:art,reference:gpuBase64(reference.encode(reference.rect,new flash.display.PNGEncoderOptions())),worldOnly:true};
}
