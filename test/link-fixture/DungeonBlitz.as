package {
 import flash.display.Sprite;
 import flash.display.StageScaleMode;
 import flash.display.StageAlign;
 import flash.events.Event;
 import flash.events.MouseEvent;
 import flash.net.URLRequest;
 import flash.net.navigateToURL;
 // Isolated navigation probe: no account, credentials or game connection.
 public class DungeonBlitz extends Sprite {
  public function DungeonBlitz() { if(stage)setup();else addEventListener(Event.ADDED_TO_STAGE,setup); }
  private function setup(event:Event=null):void {
   stage.scaleMode=StageScaleMode.NO_SCALE;stage.align=StageAlign.TOP_LEFT;
   graphics.beginFill(0x334455);graphics.drawRect(0,0,10000,10000);graphics.endFill();
   stage.addEventListener(MouseEvent.MOUSE_UP,onClick);
  }
  private function onClick(event:MouseEvent):void {
   if(stage.mouseY>100)return;
   if(stage.mouseX<180)navigateToURL(new URLRequest('https://www.paypal.com/donate/?from=flash'),'_blank');
   else navigateToURL(new URLRequest(String(loaderInfo.parameters.gameURL)+'/other'),'_blank');
  }
 }
}
