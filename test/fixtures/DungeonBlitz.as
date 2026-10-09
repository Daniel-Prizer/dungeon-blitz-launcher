package {
 import flash.display.Sprite;
 import flash.display.StageScaleMode;
 import flash.display.StageAlign;
 import flash.events.Event;
 import flash.events.MouseEvent;
 import flash.external.ExternalInterface;
 // Test-only Flash stage probe. Does not authenticate or connect to a game.
 public class DungeonBlitz extends Sprite {
  private var downs:int=0;
  private var ups:int=0;
  private var lastX:Number=0;
  private var lastY:Number=0;
  public function DungeonBlitz() { if(stage)setup();else addEventListener(Event.ADDED_TO_STAGE,setup); }
  private function setup(event:Event=null):void {
   stage.scaleMode=StageScaleMode.NO_SCALE;stage.align=StageAlign.TOP_LEFT;
   stage.addEventListener(MouseEvent.MOUSE_DOWN,onDown);
   stage.addEventListener(MouseEvent.MOUSE_UP,onUp);
   ExternalInterface.addCallback("BlitzInputProbe",snapshot);
   graphics.beginFill(0x334455);graphics.drawRect(0,0,10000,10000);graphics.endFill();
  }
  private function onDown(event:MouseEvent):void { downs++;lastX=stage.mouseX;lastY=stage.mouseY; }
  private function onUp(event:MouseEvent):void { ups++; }
  public function snapshot():Object { return {downs:downs,ups:ups,lastX:lastX,lastY:lastY,width:stage.stageWidth,height:stage.stageHeight}; }
 }
}
