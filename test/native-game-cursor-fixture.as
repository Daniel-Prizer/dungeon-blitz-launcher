package {
 import flash.display.*;import flash.events.*;import flash.external.ExternalInterface;import flash.net.URLRequest;import flash.system.*;import flash.ui.*;import flash.geom.*;
 public class DungeonBlitz extends Sprite {
  private var main:Main;private var custom:CustomMouse;private var ready:Boolean=false;
  private var files:Array=["UI_0.swf","UI_1.swf","UI_2.swf","UI_3.swf","UI_4.swf","UI_Library.swf","UI_Seasonal.swf"];
  public function DungeonBlitz(){next();}
  private function next(e:Event=null):void {if(!files.length){start(null);return;}var loader:Loader=new Loader();loader.contentLoaderInfo.addEventListener(Event.COMPLETE,next);loader.load(new URLRequest("/assets/"+files.shift()),new LoaderContext(false,ApplicationDomain.currentDomain));}
  private function start(e:Event):void {main=new Main();addChild(main);main.method_1634();main.method_561(stage.stageWidth,stage.stageHeight);custom=new CustomMouse(null);ExternalInterface.addCallback("BlitzAuditGameCursor",choose);ExternalInterface.addCallback("BlitzAuditCursorText",text);ExternalInterface.addCallback("BlitzAuditCursorLifecycle",lifecycle);ready=true;}
  private function choose(name:String):Object {custom.method_66(name);Mouse.cursor=name;var clip:MovieClip=class_4.method_16(name);var sprite:Sprite=new Sprite();sprite.addChild(clip);var bounds:Rectangle=clip.getBounds(sprite);var pixels:BitmapData=new BitmapData(32,32,true,0);pixels.drawWithQuality(sprite,new Matrix(1,0,0,1,-bounds.x,-bounds.y),null,null,null,false,StageQuality.HIGH);var rgba:Array=[];for(var y:int=0;y<32;y++)for(var x:int=0;x<32;x++){var p:uint=pixels.getPixel32(x,y);rgba.push((p>>16)&255,(p>>8)&255,p&255,p>>>24);}return {name:name,selected:Mouse.cursor,hotspot:[uint(-bounds.x),uint(-bounds.y)],rgba:rgba};}
  private function text(value:String):Boolean {Mouse.cursor=value;return true;}
  private function lifecycle(action:String):Boolean {
   if(action=="unregister"){Mouse.unregisterCursor("FixtureCursor");return true;}
   var data:MouseCursorData=new MouseCursorData();
   var first:BitmapData=new BitmapData(action=="invalid"?33:32,32,true,0xff12cc66);
   var second:BitmapData=new BitmapData(32,32,true,0xffcc6612);
   data.data=Vector.<BitmapData>([first,second]);data.hotSpot=new Point(3,5);data.frameRate=8;
   if(action=="invalid"){try{Mouse.registerCursor("InvalidFixture",data);}catch(e:ArgumentError){first.dispose();second.dispose();return true;}return false;}
   Mouse.registerCursor("FixtureCursor",data);Mouse.cursor="FixtureCursor";
   first.fillRect(first.rect,0);first.dispose();second.dispose();return true;
  }
 }
}
