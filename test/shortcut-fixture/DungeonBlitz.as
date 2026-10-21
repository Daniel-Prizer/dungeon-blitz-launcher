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
   var command:int=game.mKeybindManager.method_907(event.keyCode);
   // Synthetic key-down sink models the native held-command collection;
   // key-up uses the actual native release method unchanged.
   if(game.clientEnt&&game.var_406&&(command==Game.const_153||command==Game.const_151)){
    if(event.type==KeyboardEvent.KEY_DOWN){if(game.var_406.indexOf(command)<0)game.var_406.push(command);}
    else game.method_885(event);
   }
   if(event.type==KeyboardEvent.KEY_DOWN&&event.keyCode==27)panel=false;
  }
  private function control(mode:String):Boolean {
   try {
   if(mode=="run-release"){game.method_885(new KeyboardEvent(KeyboardEvent.KEY_UP,true,false,0,39));return true;}
   if(mode=="run-deactivate"){game.method_885(new KeyboardEvent(KeyboardEvent.KEY_UP,true,false,0,37));game.method_885(new KeyboardEvent(KeyboardEvent.KEY_UP,true,false,0,39));stage.dispatchEvent(new Event(Event.DEACTIVATE));return true;}
   if(mode=="run-open-map"){game.screenMap.mbVisible=true;return true;}
   if(mode=="run-type"){stage.focus=field;return true;}
   if(mode=="run-leave"){game.gameState="Login";return true;}
   if(mode=="run-manual-stop"){stage.dispatchEvent(new KeyboardEvent(KeyboardEvent.KEY_DOWN,true,false,0,39));stage.dispatchEvent(new KeyboardEvent(KeyboardEvent.KEY_UP,true,false,0,39));return true;}
   if(mode=="run-face-left"){game.clientEnt.bLeftFacing=true;return true;}
   BlitzInput.StopAutorun();
   events=[];stage.focus=null;game.gameState=Game.STATE_PLAY;game.mKeybindManager.mbStatePickKey=false;
   game.mKeybindManager=new class_108(40);game.method_1880();
   game.clientEnt=null;game.screenMap=null;game.screenForge=null;
   if(mode=="left"||mode.indexOf("run-")==0){
    game.var_406=new Vector.<int>();
    game.level=new Level(game);game.var_89=new Sprite();game.var_245=new Sprite();
    game.clientEnt=new Entity(game,"",null,0,0,0,0,0,0,0,null,null,"",null,null,null);game.clientEnt.bLeftFacing=mode=="left";
    game.screenMap=new class_119(game);game.screenForge=new class_75(game);
    game.CONTEXT_NORMAL=game.mKeybindManager.method_794();game.mKeybindManager.SetContext(game.CONTEXT_NORMAL);
    game.mKeybindManager.method_32(Game.const_153,37);
    if(mode!="run-unbound")game.mKeybindManager.method_32(Game.const_151,mode=="run-rebind"?68:39);
   }
   game.mKeybindManager.method_32(Game.const_274,56);
   if(mode=="login")game.gameState="Login";
   if(mode=="typing"){field.text="";stage.focus=field;}
   if(mode=="capture")game.mKeybindManager.mbStatePickKey=true;
   if(mode=="rebind")game.mKeybindManager.method_32(Game.const_274,81);
   if(mode=="unbound")game.mKeybindManager.method_32(Game.const_274,255);
   if(mode=="menu")panel=true;
   if(mode=="run-map")game.screenMap.mbVisible=true;
   return true;
   }catch(error:Error){fixtureError=mode+": "+error.toString()+" "+error.getStackTrace();return false;}
  }
  private function snapshot():Object {return {phase:phase,error:fixtureError,events:events,held:game&&game.var_406?game.var_406.toString():"",key:phase=="ready"?BlitzInput.MountKey(game):0,mountCommand:Game.const_274,panel:panel,typing:stage.focus==field,text:field?field.text:"",gameState:game?game.gameState:""};}
 }
}
