package {
 import flash.external.ExternalInterface;
 // Rendering only. Keep the game's own resize/cache-invalidation path; never
 // change stage.frameRate, game clocks, input listeners or simulation state.
 public class BlitzDisplay {
  private static var main:Main;
  private static var registered:Boolean=false;
  private static var zoom:Number=1;
  public static function Attach(value:Main):void {
   main=value;
   if(main&&main.stage)BlitzFrameCounter.Attach(main.stage,main,PositionCounter);
   if(!registered&&ExternalInterface.available){
    ExternalInterface.addCallback("BlitzSetPictureZoom",SetZoom);
    ExternalInterface.addCallback("BlitzRenderState",Snapshot);
    registered=true;
   }
  }
  public static function SetZoom(value:Number,magnification:Number=1):Boolean {
   if(!isFinite(value)||value<0.5||value>3||!isFinite(magnification)||magnification<0.1||magnification>16||!main||!main.stage)return false;
   zoom=value;main.method_561(main.stage.stageWidth,main.stage.stageHeight);
   BlitzFrameCounter.SetMagnification(magnification);PositionCounter();return true;
  }
  private static function boundedZoom():Number {
   if(!main||!main.stage)return 1;
   return Math.min(zoom,4096/Math.max(1,main.stage.stageWidth),2730/Math.max(1,main.stage.stageHeight));
  }
  public static function Width(value:int):int {return Math.max(1,int(value*boundedZoom()));}
  public static function Height(value:int):int {return Math.max(1,int(value*boundedZoom()));}
  private static function PositionCounter():void {
   if(!main||!main.stage)return;
   // Include the original frame's border, not only the inner game bitmap.
   var width:Number=(Camera.SCREEN_WIDTH+Main.var_1876*2)*main.overallScale;
   var left:Number=(main.stage.stageWidth-width)*0.5;
   BlitzFrameCounter.Layout(left,left+width);
  }
  public static function Snapshot():Object {
   if(!main||!main.stage)return null;
   return {stageWidth:main.stage.stageWidth,stageHeight:main.stage.stageHeight,zoom:zoom,
    nativeScale:main.overallScale,bitmapWidth:main.var_147.bitmapData?main.var_147.bitmapData.width:0,
    bitmapHeight:main.var_147.bitmapData?main.var_147.bitmapData.height:0,quality:main.stage.quality,
    animationRate:main.stage.frameRate,frameCounter:BlitzFrameCounter.Snapshot()};
  }
 }
}
