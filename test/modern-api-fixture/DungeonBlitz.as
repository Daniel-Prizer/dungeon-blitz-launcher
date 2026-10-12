package {
 import flash.display.Sprite;
 import flash.display.Shape;
 import flash.display.BitmapData;
 import flash.display.StageQuality;
 import flash.external.ExternalInterface;
 import flash.events.Event;
 // Unshipped capability probe. No network, account, SharedObject or game startup.
 public class DungeonBlitz extends Sprite {
  public function DungeonBlitz(){if(stage)setup();else addEventListener(Event.ADDED_TO_STAGE,setup);}
  private function setup(event:Event=null):void {ExternalInterface.addCallback("BlitzApiProbe",probe);}
  private function probe():Object {
   var shape:Shape=new Shape();shape.graphics.beginFill(0xff9933);shape.graphics.drawRect(0,0,20,20);shape.graphics.endFill();
   var items:int=-1;var readError:String="";var drawError:String="";var pixel:uint=0;
   try{items=shape.graphics.readGraphicsData(true).length;}catch(e:Error){readError=e.message;}
   var bitmap:BitmapData=new BitmapData(20,20,true,0);
   try{bitmap.drawWithQuality(shape,null,null,null,null,true,StageQuality.HIGH);pixel=bitmap.getPixel32(10,10);}catch(d:Error){drawError=d.message;}
   bitmap.dispose();return {graphicsDataItems:items,readError:readError,drawError:drawError,pixel:pixel};
  }
 }
}
