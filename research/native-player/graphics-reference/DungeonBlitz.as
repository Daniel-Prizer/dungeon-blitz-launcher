package {
 import flash.display.*;
 import flash.geom.*;
 import flash.events.Event;
 import flash.external.ExternalInterface;
 import flash.utils.getQualifiedClassName;
 public class DungeonBlitz extends MovieClip {
  public var BlitzAuthoredShape:Shape;
  public function DungeonBlitz() { addEventListener(Event.ADDED_TO_STAGE,ready); }
  private function item(v:IGraphicsData):Object {
   var o:Object={type:getQualifiedClassName(v)};
   if(v is GraphicsPath) {var p:GraphicsPath=GraphicsPath(v);o.commands=[];o.data=[];for each(var c:int in p.commands)o.commands.push(c);for each(var d:Number in p.data)o.data.push(d);o.winding=p.winding;}
   if(v is GraphicsSolidFill){o.color=GraphicsSolidFill(v).color;o.alpha=GraphicsSolidFill(v).alpha;}
   if(v is GraphicsGradientFill){var g:GraphicsGradientFill=GraphicsGradientFill(v);o.kind=g.type;o.colors=g.colors;o.alphas=g.alphas;o.ratios=g.ratios;o.matrix=matrix(g.matrix);o.spread=g.spreadMethod;o.interpolation=g.interpolationMethod;o.focal=g.focalPointRatio;}
   if(v is GraphicsStroke){var s:GraphicsStroke=GraphicsStroke(v);o.thickness=s.thickness;o.hint=s.pixelHinting;o.scale=s.scaleMode;o.caps=s.caps;o.joints=s.joints;o.miter=s.miterLimit;o.fill=s.fill?item(IGraphicsData(s.fill)):null;}
   if(v is GraphicsBitmapFill){var b:GraphicsBitmapFill=GraphicsBitmapFill(v);o.matrix=matrix(b.matrix);o.repeat=b.repeat;o.smooth=b.smooth;o.width=b.bitmapData.width;o.pixel=b.bitmapData.getPixel32(0,0);}
   return o;
  }
  private function matrix(m:Matrix):Array{return m?[m.a,m.b,m.c,m.d,m.tx,m.ty]:null;}
  private function read(s:Sprite,recurse:Boolean=true):Array {var a:Array=[];for each(var v:IGraphicsData in s.graphics.readGraphicsData(recurse))a.push(item(v));return a;}
  private function ready(e:Event):void {
   removeEventListener(Event.ADDED_TO_STAGE,ready);stage.scaleMode=StageScaleMode.NO_SCALE;stage.align=StageAlign.TOP_LEFT;
   ExternalInterface.addCallback("BlitzGraphicsReadProbe",probe);trace("GRAPHICS_READ_READY");
  }
  public function probe():Object {
   var result:Object={};result.authoredFirst=read(this);result.authoredSecond=read(this);var s:Sprite=new Sprite();addChild(s);
   s.graphics.beginFill(0x123456,0.5);s.graphics.moveTo(2,3);s.graphics.lineTo(12,3);s.graphics.curveTo(20,5,12,13);s.graphics.lineTo(2,3);s.graphics.endFill();
   result.solid=read(s);result.repeat=read(s);s.x=40;s.y=60;s.scaleX=2;s.scaleY=3;result.transformed=read(s);s.visible=false;result.hidden=read(s);s.visible=true;
   var child:Sprite=new Sprite();s.addChild(child);child.x=4;child.y=5;child.graphics.beginFill(0xff0000);child.graphics.drawRect(0,0,5,6);child.graphics.endFill();result.recurse=read(s);result.noRecurse=read(s,false);
   removeChild(s);s=new Sprite();addChild(s);s.graphics.lineStyle(4,0xabcdef,0.25,true,"none","square","miter",8);s.graphics.moveTo(3,4);s.graphics.lineTo(13,14);result.stroke=read(s);
   removeChild(s);s=new Sprite();addChild(s);var m:Matrix=new Matrix(2,0,0,3,6,7);s.graphics.beginGradientFill("linear",[0xff0000,0x0000ff],[0.5,1],[0,255],m,"reflect","linearRGB",0.25);s.graphics.drawRect(0,0,10,10);s.graphics.endFill();result.gradient=read(s);
   removeChild(s);s=new Sprite();addChild(s);var bitmap:BitmapData=new BitmapData(2,2,true,0xff123456);s.graphics.beginBitmapFill(bitmap,new Matrix(2,0,0,3,4,5),false,true);s.graphics.drawRect(0,0,20,20);s.graphics.endFill();result.bitmap=read(s);result.bitmapIdentity=GraphicsBitmapFill(s.graphics.readGraphicsData()[0]).bitmapData===bitmap;
   removeChild(s);s=new Sprite();addChild(s);s.graphics.beginFill(0xabcdef);s.graphics.drawRect(0,0,12,13);result.pending=read(s);s.graphics.lineTo(40,50);result.afterRead=read(s);removeChild(s);
   s=new Sprite();addChild(s);s.graphics.beginFill(0xabcdef,0.25);s.graphics.drawRect(0,0,10,10);s.graphics.endFill();result.alphaFill=read(s);removeChild(s);
   s=new Sprite();addChild(s);child=new Sprite();s.addChild(child);child.x=10;child.y=20;child.scaleX=2;child.scaleY=3;child.alpha=0.25;child.graphics.lineStyle(4,0xabcdef);child.graphics.beginFill(0x123456);child.graphics.drawRect(0,0,10,10);child.graphics.endFill();result.scaledChild=read(s);removeChild(s);
   s=new Sprite();addChild(s);s.alpha=0.25;s.graphics.beginFill(0x123456);s.graphics.drawRect(0,0,10,10);s.graphics.endFill();result.rootAlpha=read(s);removeChild(s);
   s=new Sprite();addChild(s);s.graphics.beginFill(0x123456);s.graphics.moveTo(0,0);s.graphics.cubicCurveTo(0,30,30,30,30,0);s.graphics.endFill();result.cubic=read(s);removeChild(s);
   return result;
  }
 }
}
