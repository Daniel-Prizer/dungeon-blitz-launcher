package {
 import flash.display.Sprite;
 import flash.events.Event;
 import flash.external.ExternalInterface;
 import flash.text.TextField;
 import flash.text.TextFormat;
 import flash.utils.getTimer;
 public class DungeonBlitz extends Sprite {
  private var frames:uint=0;
  private var label:TextField=new TextField();
  private var actor:Sprite=new Sprite();
  public function DungeonBlitz(){if(stage)start();else addEventListener(Event.ADDED_TO_STAGE,start);}
  private function start(event:Event=null):void {
   stage.frameRate=100;stage.scaleMode="noScale";stage.align="TL";
   graphics.beginFill(0x402050);graphics.drawRect(20,500,700,180);graphics.endFill();
   label.defaultTextFormat=new TextFormat("_sans",24,0xffffff);label.width=650;label.height=100;label.x=40;label.y=530;addChild(label);
   actor.graphics.beginFill(0xffffff);actor.graphics.drawRect(0,0,24,24);actor.y=610;addChild(actor);
   ExternalInterface.addCallback("PerfState",state);ExternalInterface.addCallback("PerfEcho",echo);
   addEventListener(Event.ENTER_FRAME,tick);
  }
  private function tick(event:Event):void {frames++;actor.x=30+(getTimer()%3000)/5;}
  private function state():Object{return {frames:frames,time:getTimer()};}
  private function echo(value:String):Object{label.text=value;return state();}
 }
}
