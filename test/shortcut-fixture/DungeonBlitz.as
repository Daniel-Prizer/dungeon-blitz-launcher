package {
 import flash.display.Sprite;
 import flash.display.Loader;
 import flash.net.URLRequest;
 import flash.system.LoaderContext;
 import flash.system.ApplicationDomain;
 import flash.display.StageScaleMode;
 import flash.display.StageAlign;
 import flash.events.Event;
 import flash.events.KeyboardEvent;
 import flash.text.TextField;
 import flash.text.TextFieldType;
 import flash.external.ExternalInterface;
 // Offline fixture: real reviewed key manager + launcher input helper, no
 // connection, player or gameplay mutations. The panel is only a key probe.
 public class DungeonBlitz extends Sprite {
  private var main:Main;
  private var game:Game;
  private var field:TextField;
  private var events:Array=[];
  private var panel:Boolean=true;
  private var phase:String="starting";
  private var fixtureError:String="";
  public function DungeonBlitz(){if(stage)setup();else addEventListener(Event.ADDED_TO_STAGE,setup);}
  private function setup(event:Event=null):void {
   ExternalInterface.addCallback("BlitzInputProbe",snapshot);
   phase="loading UI";var loader:Loader=new Loader();loader.contentLoaderInfo.addEventListener(Event.COMPLETE,start);
   loader.load(new URLRequest("/assets/UI_0.swf"),new LoaderContext(false,ApplicationDomain.currentDomain));
  }
  private function start(event:Event):void {
   try{
   stage.scaleMode=StageScaleMode.NO_SCALE;stage.align=StageAlign.TOP_LEFT;
   graphics.beginFill(0x484955);graphics.drawRect(0,0,10000,10000);graphics.endFill();
   phase="main";main=new Main();addChild(main);main.method_1634();main.method_561(stage.stageWidth,stage.stageHeight);
   phase="game";game=new Game(main);main.var_523=new Vector.<Game>();main.var_523.push(game);
   phase="key manager";game.mKeybindManager=new class_108(40);phase="default bindings";game.method_1880();game.gameState=Game.STATE_PLAY;
   field=new TextField();field.type=TextFieldType.INPUT;field.border=true;field.background=true;field.width=400;field.height=50;field.x=60;field.y=80;addChild(field);
   stage.addEventListener(KeyboardEvent.KEY_DOWN,key);stage.addEventListener(KeyboardEvent.KEY_UP,key);
   ExternalInterface.addCallback("BlitzInputFixtureControl",control);phase="ready";
   }catch(error:Error){fixtureError=error.toString();}
  }
  private function key(event:KeyboardEvent):void {
   if(events.length<128)events.push({type:event.type,code:event.keyCode,command:game.mKeybindManager.method_907(event.keyCode,game.CONTEXT_NORMAL),shift:event.shiftKey});
   if(event.type==KeyboardEvent.KEY_DOWN&&event.keyCode==27)panel=false;
  }
  private function control(mode:String):Boolean {
   events=[];stage.focus=null;game.gameState=Game.STATE_PLAY;game.mKeybindManager.mbStatePickKey=false;
   game.mKeybindManager.method_32(Game.const_274,56);
   if(mode=="login")game.gameState="Login";
   if(mode=="typing"){field.text="";stage.focus=field;}
   if(mode=="capture")game.mKeybindManager.mbStatePickKey=true;
   if(mode=="rebind")game.mKeybindManager.method_32(Game.const_274,81);
   if(mode=="unbound")game.mKeybindManager.method_32(Game.const_274,255);
   if(mode=="menu")panel=true;
   return true;
  }
  private function snapshot():Object {return {phase:phase,error:fixtureError,events:events,key:phase=="ready"?BlitzInput.MountKey(game):0,mountCommand:Game.const_274,panel:panel,typing:stage.focus==field,text:field?field.text:"",gameState:game?game.gameState:""};}
 }
}
