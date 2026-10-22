package {
 import flash.display.Sprite;
 import flash.display.Loader;
 import flash.net.URLRequest;
 import flash.system.LoaderContext;
 import flash.system.ApplicationDomain;
 import flash.display.StageScaleMode;
 import flash.display.StageAlign;
 import flash.events.Event;
 import flash.external.ExternalInterface;
 import flash.ui.Mouse;
 public class DungeonBlitz extends Sprite {
  private var main:Main;
  public function DungeonBlitz(){if(stage)setup();else addEventListener(Event.ADDED_TO_STAGE,setup);}
  private function setup(event:Event=null):void {
   var loader:Loader=new Loader();loader.contentLoaderInfo.addEventListener(Event.COMPLETE,start);
   loader.load(new URLRequest("/assets/UI_0.swf"),new LoaderContext(false,ApplicationDomain.currentDomain));
  }
  private function start(event:Event):void {
   stage.scaleMode=StageScaleMode.NO_SCALE;stage.align=StageAlign.TOP_LEFT;
   graphics.beginFill(0x484955);graphics.drawRect(0,0,10000,10000);graphics.endFill();
   main=new Main();addChild(main);main.method_1634();main.method_561(stage.stageWidth,stage.stageHeight);
   BlitzAudio.Init();replaceSession();
   ExternalInterface.addCallback("BlitzSettingsFixtureReset",replaceSession);
   ExternalInterface.addCallback("BlitzSettingsFixtureCursor",cursor);
   ExternalInterface.addCallback("BlitzSettingsFixtureReady",ready);
   ExternalInterface.addCallback("BlitzSettingsFixtureLevel",level);
  }
  private function ready():Boolean {return main!=null;}
  private function cursor(value:String):Boolean {Mouse.cursor=value;return true;}
  private function level(name:String):Boolean {
   var game:Game=main.var_523[0];game.level=new Level(game);game.level.levelFileName=name;
   game.gameState=Game.STATE_PLAY;BlitzDisplay.SetWidescreen(true);return true;
  }
  private function replaceSession():Boolean {
   // Offline constructor stub: no network, character or account is created.
   var game:Game=new Game(main);game.gameState="Login";
   main.var_523=new Vector.<Game>();main.var_523.push(game);
   BlitzDisplay.SetZoom(1);BlitzDisplay.SetWidescreen(false);BlitzDisplay.SetCenteredHotbar(false);BlitzDisplay.SetCenteredCamera(false);
   BlitzFrameCounter.SetShown(false);BlitzAudio.SetMix(100,100,100,100);return true;
  }
 }
}
