package {
 import flash.display.Sprite;
 import flash.events.Event;
 import flash.events.StatusEvent;
 import flash.net.LocalConnection;
 import flash.text.TextField;
 import flash.system.fscommand;
 import flash.display.BitmapData;
 import flash.net.SharedObject;
 public class BlitzGameProbe extends Sprite {
  private var connection:LocalConnection=new LocalConnection();
  private var label:TextField=new TextField();
  private var initial:Boolean=false;
  public function BlitzGameProbe(){if(stage)setup();else addEventListener(Event.ADDED_TO_STAGE,setup);}
  private function setup(event:Event=null):void{
   graphics.beginFill(0x992222);graphics.drawRect(0,0,1152,768);graphics.endFill();label.width=1000;label.height=100;label.text="Waiting";addChild(label);
   connection.client=this;connection.allowDomain("*");connection.addEventListener(StatusEvent.STATUS,function(e:Event):void{});
   connection.connect("_blitz-game-probe-specific-channel");
  }
  public function configure(zoom:Number,player:Number,music:Number,environment:Number,creatures:Number,showFPS:Boolean,storage:Boolean=false):void {
   graphics.clear();graphics.beginFill(zoom===1.5&&music===37&&showFPS?0x22aa44:0x4444aa);graphics.drawRect(0,0,1152,768);graphics.endFill();label.text="ZOOM "+zoom+" MUSIC "+music+" FPS "+showFPS;
   if(zoom===1.5&&music===37&&showFPS)initial=true;
   if(initial&&zoom===2&&music===62&&!showFPS){var picture:BitmapData=new BitmapData(200,200,false);picture.draw(this);var valid:Boolean=picture.getPixel(100,150)===0x4444aa;picture.dispose();if(storage){var save:SharedObject=SharedObject.getLocal("blitzSandboxFixture","/");save.data.marker="synthetic-only";valid=valid&&save.flush()==="flushed";}if(valid)fscommand("quit");}
  }
 }
}
