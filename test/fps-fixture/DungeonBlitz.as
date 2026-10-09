package {
 import flash.display.Sprite;
 import flash.display.StageScaleMode;
 import flash.display.StageAlign;
 import flash.events.Event;
 import flash.events.MouseEvent;
 import flash.external.ExternalInterface;
 import flash.utils.getTimer;
 // Test-only clock/stall controls. This document class never ships.
 public class DungeonBlitz extends Sprite {
  private var total:uint=0;
  private var started:uint=0;
  private var frames:uint=0;
  private var observed:Number=0;
  private var busy:int=0;
  private var margins:Boolean=true;
  private var downs:uint=0;
  private var ups:uint=0;
  private var lastTarget:String="";
  public function DungeonBlitz(){if(stage)setup();else addEventListener(Event.ADDED_TO_STAGE,setup);}
  private function setup(event:Event=null):void {
   stage.scaleMode=StageScaleMode.NO_SCALE;stage.align=StageAlign.TOP_LEFT;stage.frameRate=30;
   graphics.beginFill(0x484955);graphics.drawRect(0,0,10000,10000);graphics.endFill();
   BlitzFrameCounter.Attach(stage,this,position);started=uint(getTimer());
   addEventListener(Event.ENTER_FRAME,work);
   addEventListener(Event.ENTER_FRAME,tick,false,-101);
   stage.addEventListener(MouseEvent.MOUSE_DOWN,mouse);
   stage.addEventListener(MouseEvent.MOUSE_UP,mouse);
   ExternalInterface.addCallback("FPSFixtureControl",control);
   ExternalInterface.addCallback("BlitzRenderState",snapshot);
  }
  private function position():void {
   var left:Number=margins?(stage.stageWidth-Math.min(stage.stageWidth,stage.stageHeight*1.5))*0.5:0;
   BlitzFrameCounter.Layout(left,stage.stageWidth-left);
  }
  private function control(rate:int,stall:int,showMargins:Boolean):Boolean {
   if((rate!=30&&rate!=60&&rate!=100)||stall<0||stall>100)return false;
   stage.frameRate=rate;busy=stall;margins=showMargins;position();return true;
  }
  private function work(event:Event):void {var start:uint=uint(getTimer());while(uint(uint(getTimer())-start)<busy){}}
  private function tick(event:Event):void {
   ++frames;++total;var now:uint=uint(getTimer());var elapsed:uint=now-started;
   if(elapsed>=1000){observed=1000*frames/elapsed;frames=0;started=now;}
  }
  private function mouse(event:MouseEvent):void {if(event.type==MouseEvent.MOUSE_DOWN)++downs;else ++ups;lastTarget=event.target.name;}
  private function snapshot():Object {
   return {stageWidth:stage.stageWidth,stageHeight:stage.stageHeight,animationRate:stage.frameRate,
    frameCounter:BlitzFrameCounter.Snapshot(),fixture:{totalFrames:total,observedFPS:observed,
    mouseDowns:downs,mouseUps:ups,lastTarget:lastTarget}};
  }
 }
}
