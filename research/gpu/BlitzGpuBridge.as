package {
 import flash.display.Bitmap;
 import flash.display.BitmapData;
 import flash.display.DisplayObject;
 import flash.display.DisplayObjectContainer;
 import flash.display.MovieClip;
 import flash.display.Shape;
 import flash.display.Sprite;
 import flash.display.Graphics;
 import flash.external.ExternalInterface;
 import flash.text.TextField;
 import flash.utils.getQualifiedClassName;
 import flash.utils.Dictionary;
 import flash.utils.getTimer;
 import flash.geom.Point;
 import flash.geom.Rectangle;
 import flash.geom.Matrix;
 // Exact-source research adapter. This initial entry point observes structure
 // only; it does not hide the native view, render, read credentials, register
 // frame callbacks or change simulation/network/input/audio state.
 public class BlitzGpuBridge {
  private static var main:Main;
  private static const writeCoverage:Boolean=__RESEARCH_WRITES_GUARDED__;
  private static const researchProbes:Boolean=__RESEARCH_PROBES__;
  private static var versions:Dictionary=new Dictionary(true);
  private static var mutationSequence:uint=0;
  private static var mutationFault:Boolean=false;
  // Observer invoked before the original native call, which stays in place.
  // Arguments/results/exceptions of that call are not intercepted or replaced.
  // A failed mutation may conservatively invalidate art; never keep stale art.
  public static function Mark(value:Object):void {
   try{if(value is BitmapData||value is Graphics){mutationSequence++;if(!mutationSequence)mutationFault=true;versions[value]=mutationSequence;}}catch(error:Error){mutationFault=true;}
  }
  public static function Version(value:Object):uint {return uint(versions[value]);}
  public static function Attach(value:Main):void {
   if(!value||main)return;main=value;
   if(ExternalInterface.available){ExternalInterface.addCallback("BlitzGpuStructure",Structure);if(researchProbes)ExternalInterface.addCallback("BlitzGpuObserverProbe",ObserverProbe);if(writeCoverage){if(researchProbes)ExternalInterface.addCallback("BlitzGpuFrame",Frame);ExternalInterface.addCallback("BlitzGpuRequestFrame",RequestFrame);ExternalInterface.addCallback("BlitzGpuFrameResult",FrameResult);ExternalInterface.addCallback("BlitzGpuRelease",Release);if(researchProbes)ExternalInterface.addCallback("BlitzGpuEffectProbe",EffectProbe);ExternalInterface.addCallback("BlitzGpuBinaryProbe",BinaryProbe);ExternalInterface.addCallback("BlitzGpuSetBinary",SetBinary);ExternalInterface.addCallback("BlitzGpuNativeView",NativeView);}}
  }
  // Creates only owned tiny native objects. It never receives a game object or
  // renders game pixels. The build observes this method separately to exercise
  // both callpropvoid and result-bearing callproperty and native error paths.
  public static function ObserverProbe():Object {
   var source:BitmapData=new BitmapData(2,2,true,0);source.fillRect(source.rect,0xffff0000);var sourceVersion:uint=Version(source);
   var destination:BitmapData=new BitmapData(4,4,true,0);destination.copyPixels(source,source.rect,new Point(1,1));var copyVersion:uint=Version(destination);var copied:uint=destination.getPixel32(1,1);
   var changed:uint=destination.threshold(source,source.rect,new Point(0,0),"==",0xffff0000,0xff00ff00,0xffffffff,false);var thresholdVersion:uint=Version(destination);var green:uint=destination.getPixel32(0,0);
   var sprite:Sprite=new Sprite();sprite.graphics.beginFill(0x0000ff);sprite.graphics.drawRect(0,0,1,1);sprite.graphics.endFill();var graphicsVersion:uint=Version(sprite.graphics);
   destination.draw(sprite,new Matrix());var drawVersion:uint=Version(destination);var blue:uint=destination.getPixel32(0,0);
   var caught:Boolean=false;try{destination.copyPixels(null,new Rectangle(0,0,1,1),new Point());}catch(error:Error){caught=true;}
   var errorVersion:uint=Version(destination);source.dispose();destination.dispose();var disposeVersion:uint=Version(destination);
   return {copied:copied,green:green,blue:blue,changed:changed,nativeErrorCaught:caught,sourceObserved:sourceVersion>0,copyObserved:copyVersion>sourceVersion,thresholdObserved:thresholdVersion>copyVersion,graphicsObserved:graphicsVersion>thresholdVersion,drawObserved:drawVersion>graphicsVersion,errorObserved:errorVersion>drawVersion,disposeObserved:disposeVersion>errorVersion};
  }
  private static function Count(node:DisplayObject,result:Object,depth:int):void {
   if(depth>64||result.total>=16384)throw new Error("Scene structure budget exceeded");
   if(!node.visible)return;result.total++;
   if(node.mask)result.masked++;if(node.filters&&node.filters.length){result.filtered++;for each(var filter:Object in node.filters){var type:String=getQualifiedClassName(filter);result.filterTypes[type]=int(result.filterTypes[type])+1;}var kind:String=getQualifiedClassName(node);result.filteredTypes[kind]=int(result.filteredTypes[kind])+1;}
   var blend:String=node.blendMode;result.blends[blend]=int(result.blends[blend])+1;
   if(node is Bitmap){result.bitmaps++;var bitmap:Bitmap=node as Bitmap;if(bitmap.bitmapData){result.bitmapPixels+=bitmap.bitmapData.width*bitmap.bitmapData.height;}}
   else if(node is TextField)result.text++;
   else if(node is Shape)result.shapes++;
   else if(node is MovieClip)result.movieClips++;
   else if(node is Sprite)result.sprites++;
   else result.other++;
   var container:DisplayObjectContainer=node as DisplayObjectContainer;
   if(container)for(var i:int=0;i<container.numChildren;i++)Count(container.getChildAt(i),result,depth+1);
  }
  private static function Summary(node:DisplayObject):Object {
   var result:Object={total:0,bitmaps:0,bitmapPixels:0,text:0,shapes:0,movieClips:0,sprites:0,other:0,masked:0,filtered:0,blends:{},filterTypes:{},filteredTypes:{}};
   Count(node,result,0);return result;
  }
  public static function Structure():Object {
   if(!main)return {version:1,ready:false};var games:Array=[];
   for each(var game:Game in main.var_523){
    var layers:Array=[];if(game.var_1040)for(var i:int=0;i<game.var_1040.numChildren;i++)layers.push(Summary(game.var_1040.getChildAt(i)));
    games.push({play:game.gameState==Game.STATE_PLAY,world:game.var_1040?Summary(game.var_1040):null,layers:layers});
   }
   return {version:1,ready:true,worldWidth:main.var_147&&main.var_147.bitmapData?main.var_147.bitmapData.width:0,worldHeight:main.var_147&&main.var_147.bitmapData?main.var_147.bitmapData.height:0,games:games,readOnly:true,mutationSequence:mutationSequence,mutationFault:mutationFault,writeCoverage:writeCoverage,afterDrawCalls:afterDrawCalls,afterDrawFault:afterDrawFault,pendingFrame:requestedKnown!=null,skippedNativeWorldDraws:skippedNativeWorldDraws};
  }
  // __RETAINED_SCENE_METHODS__
 }
}
