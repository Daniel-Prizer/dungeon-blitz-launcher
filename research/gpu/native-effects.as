// Retained native effects, never a final-frame capture. Mirror only the visual
// subtree into owned, non-ticking Flash primitives. Original display objects,
// parentage, listeners, timelines, bitmap contents and input remain untouched.
private static function FilterSignature(filters:Array):String {
 var out:Array=[];if(filters.length>8)throw new Error("Native filter count exceeds budget");
 for each(var filter:Object in filters){
  var type:String=getQualifiedClassName(filter);var fields:Array;
  if(type=="flash.filters::GlowFilter")fields=["color","alpha","blurX","blurY","strength","quality","inner","knockout"];
  else if(type=="flash.filters::DropShadowFilter")fields=["distance","angle","color","alpha","blurX","blurY","strength","quality","inner","knockout","hideObject"];
  else if(type=="flash.filters::BlurFilter")fields=["blurX","blurY","quality"];
  else if(type=="flash.filters::ColorMatrixFilter")fields=["matrix"];
  else throw new Error("Unreviewed native filter: "+type);
  out.push(type);for each(var key:String in fields)out.push(key+"="+String(filter[key]));
 }return out.join(";");
}
private static function VisualSignature(node:DisplayObject,depth:int=0):String {
 if(depth>64)throw new Error("Effect nesting exceeds budget");
 if(node.mask)throw new Error("Native mask requires reviewed effect support");
 if(node.blendMode!="normal")throw new Error("Native blend requires reviewed effect support");
 var signature:Array=[ObjectID(node),node.visible,node.transform.matrix.toString(),node.transform.colorTransform.toString(),String(node.scrollRect),String(node.scale9Grid),String(node.opaqueBackground),FilterSignature(node.filters)];
 if(node is MovieClip)signature.push((node as MovieClip).currentFrame);
 if(node is Bitmap){var b:Bitmap=node as Bitmap;signature.push(b.bitmapData?TextureIdentity(b.bitmapData):"null",b.bitmapData?Version(b.bitmapData):0,b.pixelSnapping,b.smoothing);}
 var graphics:Graphics=GraphicsOf(node);if(graphics)signature.push(Version(graphics));
 if(node is TextField){var t:TextField=node as TextField;signature.push(t.htmlText,t.defaultTextFormat.font,t.defaultTextFormat.size,t.defaultTextFormat.color,t.defaultTextFormat.bold,t.defaultTextFormat.italic,t.defaultTextFormat.align,t.width,t.height,t.scrollH,t.scrollV,t.embedFonts,t.antiAliasType,t.gridFitType,t.sharpness,t.thickness,t.background,t.backgroundColor,t.border,t.borderColor,t.textColor,t.multiline,t.wordWrap,t.autoSize,t.condenseWhite,t.displayAsPassword,t.styleSheet);}
 var container:DisplayObjectContainer=node as DisplayObjectContainer;if(container)for(var i:int=0;i<container.numChildren;i++)signature.push(VisualSignature(container.getChildAt(i),depth+1));
 var value:String=signature.join("|");if(value.length>524288)throw new Error("Native effect signature exceeds budget");return value;
}
private static function TextureIdentity(data:BitmapData):uint {
 var value:uint=uint(textureIDs[data]);if(!value){value=++nextTexture;if(!value)throw new Error("Texture identity exhausted");textureIDs[data]=value;}return value;
}
private static function MirrorVisual(node:DisplayObject,depth:int=0):DisplayObject {
 if(depth>64)throw new Error("Effect nesting exceeds budget");var mirror:DisplayObject;
 if(node is Bitmap){var original:Bitmap=node as Bitmap;mirror=new Bitmap(original.bitmapData,original.pixelSnapping,original.smoothing);}
 else if(node is TextField){
  var source:TextField=node as TextField;var text:TextField=new TextField();text.embedFonts=source.embedFonts;text.defaultTextFormat=source.defaultTextFormat;text.styleSheet=source.styleSheet;text.multiline=source.multiline;text.wordWrap=source.wordWrap;text.condenseWhite=source.condenseWhite;text.displayAsPassword=source.displayAsPassword;text.antiAliasType=source.antiAliasType;text.gridFitType=source.gridFitType;text.sharpness=source.sharpness;text.thickness=source.thickness;text.background=source.background;text.backgroundColor=source.backgroundColor;text.border=source.border;text.borderColor=source.borderColor;text.htmlText=source.htmlText;text.width=source.width;text.height=source.height;text.scrollH=source.scrollH;text.scrollV=source.scrollV;mirror=text;
 }else if(node is Shape){var shape:Shape=new Shape();shape.graphics.copyFrom((node as Shape).graphics);mirror=shape;}
 else if(node is Sprite){var sprite:Sprite=new Sprite();sprite.graphics.copyFrom((node as Sprite).graphics);var container:DisplayObjectContainer=node as DisplayObjectContainer;for(var i:int=0;i<container.numChildren;i++)sprite.addChild(MirrorVisual(container.getChildAt(i),depth+1));mirror=sprite;}
 else throw new Error("Unreviewed native effect display type: "+getQualifiedClassName(node));
 mirror.transform.matrix=node.transform.matrix.clone();mirror.transform.colorTransform=node.transform.colorTransform;mirror.visible=node.visible;mirror.scrollRect=node.scrollRect;mirror.scale9Grid=node.scale9Grid;mirror.opaqueBackground=node.opaqueBackground;
 // Flash's filters getter/setter copy filter values. Do not depend on a
 // runtime's optional BitmapFilter.clone implementation and never mutate them.
 mirror.filters=node.filters;return mirror;
}
private static function EffectExpansion(node:DisplayObject,depth:int=0):Number {
 if(depth>64)throw new Error("Effect bounds nesting exceeds budget");var padding:Number=0;
 for each(var filter:Object in node.filters){if(filter is flash.filters.GlowFilter||filter is flash.filters.BlurFilter||filter is flash.filters.DropShadowFilter)padding+=Math.max(Number(filter.blurX),Number(filter.blurY))*Math.max(1,Number(filter.quality))*2+4;if(filter is flash.filters.DropShadowFilter)padding+=Math.abs(Number(filter.distance));}
 var container:DisplayObjectContainer=node as DisplayObjectContainer;if(container)for(var i:int=0;i<container.numChildren;i++){var child:DisplayObject=container.getChildAt(i);var matrix:Matrix=child.transform.matrix;padding=Math.max(padding,EffectExpansion(child,depth+1)*(Math.abs(matrix.a)+Math.abs(matrix.b)+Math.abs(matrix.c)+Math.abs(matrix.d)));}
 if(!isFinite(padding)||padding>2048)throw new Error("Native effect padding exceeds budget");return padding;
}
private static function RasterEffect(node:DisplayObject,matrix:Matrix,ancestry:String):Object {
 var signature:String="effect:"+ancestry+":"+matrix.a+","+matrix.b+","+matrix.c+","+matrix.d+":"+VisualSignature(node);
 var cached:Object=rasterCache[node];exportRasters[node]=true;if(cached&&cached.signature==signature)return cached;
 var bounds:Rectangle=node.getBounds(node);var padding:Number=EffectExpansion(node);bounds.inflate(padding,padding);
 var linear:Matrix=new Matrix(matrix.a,matrix.b,matrix.c,matrix.d);var points:Array=[linear.transformPoint(new Point(bounds.left,bounds.top)),linear.transformPoint(new Point(bounds.right,bounds.top)),linear.transformPoint(new Point(bounds.left,bounds.bottom)),linear.transformPoint(new Point(bounds.right,bounds.bottom))];
 var left:int=Math.floor(Math.min(points[0].x,points[1].x,points[2].x,points[3].x))-2;var top:int=Math.floor(Math.min(points[0].y,points[1].y,points[2].y,points[3].y))-2;
 var right:int=Math.ceil(Math.max(points[0].x,points[1].x,points[2].x,points[3].x))+2;var bottom:int=Math.ceil(Math.max(points[0].y,points[1].y,points[2].y,points[3].y))+2;
 var width:int=right-left;var height:int=bottom-top;if(width<1||height<1||width>8190||height>8190||width*height>4194304)throw new Error("Native effect raster exceeds budget");
 var bytes:Number=width*height*4;if(rasterBytes+bytes-(cached?cached.bytes:0)>33554432)throw new Error("Owned effect cache budget exceeded");
 var data:BitmapData=new BitmapData(width,height,true,0);linear.tx=-left;linear.ty=-top;
 try{data.drawWithQuality(node,linear,node.transform.colorTransform,null,null,false,flash.display.StageQuality.HIGH);}catch(error:Error){data.dispose();throw error;}
 if(cached){cached.data.dispose();rasterBytes-=cached.bytes;}rasterBytes+=bytes;cached={signature:signature,data:data,left:left,top:top,bytes:bytes};rasterCache[node]=cached;return cached;
}
public static function EffectProbe():Object {
 var root:Sprite=new Sprite();var group:Sprite=new Sprite();group.x=28;group.y=22;group.scaleX=1.25;group.rotation=12;
 var shape:Shape=new Shape();shape.graphics.beginFill(0xcc2244,.7);shape.graphics.drawRect(0,0,32,24);shape.graphics.endFill();shape.filters=[new flash.filters.GlowFilter(0x33ccff,.8,6,6,2,2)];group.addChild(shape);
 var text:TextField=new TextField();text.defaultTextFormat=new flash.text.TextFormat("_sans",14,0xffffff,true);text.text="GPU";text.width=48;text.height=24;text.x=26;text.y=34;text.filters=[new flash.filters.DropShadowFilter(3,45,0,1,4,4,1,1)];group.addChild(text);root.addChild(group);
 exportKnown={};exportSeen={};exportRasters=new Dictionary();exportArt=[];exportNodes=[];exportPixels=0;exportBytes=0;
 var result:Object;
 try{Walk(root,new Matrix(),[1,1,1,1],[0,0,0,0],new Rectangle(0,0,160,128),"probe",0,true);var reference:BitmapData=new BitmapData(160,128,true,0);reference.drawWithQuality(root,new Matrix(),null,null,null,false,flash.display.StageQuality.HIGH);var active:Array=[];for each(var descriptor:Object in exportSeen)active.push(descriptor);result={protocol:1,supported:true,epoch:"owned-effect-probe",sequence:1,width:160,height:128,clear:[0,0,0,0],nodes:exportNodes,art:exportArt,activeArt:active,nativeReference:Base64(reference.encode(reference.rect,new flash.display.PNGEncoderOptions()))};reference.dispose();}catch(error:Error){result={protocol:1,supported:false,reason:error.message};}
 exportKnown=null;exportSeen=null;exportRasters=null;exportArt=null;exportNodes=null;Release();return result;
}
