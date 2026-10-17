package {
 import flash.external.ExternalInterface;
 import flash.events.KeyboardEvent;
 import flash.events.Event;
 import flash.display.DisplayObjectContainer;
 import flash.text.TextFormat;
 import flash.utils.Dictionary;
 import flash.text.TextField;
 import flash.text.TextFieldType;
 // Opt-in key alias only: use the client's current keymap and original stage
 // listeners. No entity, packet, cooldown, equipment or saved keymap mutation.
 public class BlitzInput {
  private static var main:Main;
  private static var registered:Boolean=false;
  private static var shiftMount:Boolean=false;
  private static var labels:Dictionary=new Dictionary(true);
  private static var runningKey:int=0;
  private static var runningGame:Game;
  private static var dispatching:Boolean=false;
  public static function Attach(value:Main):void {
   main=value;
   if(!registered&&ExternalInterface.available){ExternalInterface.addCallback("BlitzMount",Mount);ExternalInterface.addCallback("BlitzSetMountShortcut",SetMountShortcut);ExternalInterface.addCallback("BlitzAutorun",Autorun);ExternalInterface.addCallback("BlitzStopAutorun",StopAutorun);registered=true;}
   main.addEventListener(Event.ENTER_FRAME,UpdateMountLabel,false,-102,true);
   main.addEventListener(Event.ENTER_FRAME,CheckAutorun,false,-103,true);
   main.stage.addEventListener(KeyboardEvent.KEY_DOWN,ManualInput,true,100,true);
   main.stage.addEventListener(KeyboardEvent.KEY_DOWN,ManualInput,false,100,true);
   main.stage.addEventListener(Event.DEACTIVATE,StopAutorunEvent,false,100,true);
  }
  private static function CurrentGame():Game {
   if(!main||!main.stage||!main.var_523||main.var_523.length!=1)return null;
   var field:TextField=main.stage.focus as TextField;if(field&&field.type==TextFieldType.INPUT)return null;
   var game:Game=main.var_523[0];
   if(game.gameState!=Game.STATE_PLAY||!game.clientEnt||!game.mKeybindManager||game.mKeybindManager.mbStatePickKey)return null;
   if(game.screenMap&&game.screenMap.mbVisible||game.screenForge&&game.screenForge.mbVisible)return null;
   return game;
  }
  private static function MovementKey(game:Game,command:int):int {
   for(var key:int=1;key<255;key++)if(game.mKeybindManager.method_31(key,game.CONTEXT_NORMAL)==command&&game.mKeybindManager.method_907(key)==command)return key;
   return 0;
  }
  public static function Autorun():Boolean {
   if(runningKey){StopAutorun();return true;}
   var game:Game=CurrentGame();if(!game)return false;
   var key:int=MovementKey(game,game.clientEnt.bLeftFacing?Game.const_153:Game.const_151);if(!key)return false;
   runningKey=key;runningGame=game;dispatching=true;
   try{main.stage.dispatchEvent(new KeyboardEvent(KeyboardEvent.KEY_DOWN,true,false,0,key));}
   finally{dispatching=false;}
   return true;
  }
  public static function StopAutorun():Boolean {
   var key:int=runningKey;runningKey=0;runningGame=null;
   if(key&&main&&main.stage){dispatching=true;try{main.stage.dispatchEvent(new KeyboardEvent(KeyboardEvent.KEY_UP,true,false,0,key));}finally{dispatching=false;}}
   return true;
  }
  private static function StopAutorunEvent(event:Event):void {StopAutorun();}
  private static function CheckAutorun(event:Event):void {if(runningKey&&(CurrentGame()!=runningGame||MovementKey(runningGame,runningGame.clientEnt.bLeftFacing?Game.const_153:Game.const_151)!=runningKey))StopAutorun();}
  private static function ManualInput(event:KeyboardEvent):void {
   if(!runningKey||dispatching)return;
   var command:int=runningGame.mKeybindManager.method_907(event.keyCode);
   if(command==Game.const_153||command==Game.const_151||event.keyCode==27||event.keyCode==13)StopAutorun();
  }
  public static function SetMountShortcut(enabled:Boolean):Boolean {shiftMount=enabled;UpdateMountLabel();return true;}
  private static function UpdateMountLabel(event:Event=null):void {
   if(!main||!main.var_523)return;
   for each(var game:Game in main.var_523){
    if(!game.screenHud||!game.screenHud.var_2)continue;
    var powers:DisplayObjectContainer=game.screenHud.var_2.getChildByName("am_PowerButtons") as DisplayObjectContainer;
    var mount:DisplayObjectContainer=powers?powers.getChildByName("am_Key8") as DisplayObjectContainer:null;
    var label:TextField=mount?mount.getChildByName("am_KeyBindText") as TextField:null;
    if(!label)continue;
    var saved:Object=labels[label];
    if(shiftMount){
     if(!saved){saved={html:label.htmlText,width:label.width,format:label.defaultTextFormat};labels[label]=saved;}
     if(label.text!="L Shift"){
      var format:TextFormat=label.defaultTextFormat;format.size=11;label.defaultTextFormat=format;label.width=50;label.text="L Shift";label.setTextFormat(format);
     }
    }else if(saved){label.defaultTextFormat=saved.format;label.width=saved.width;label.htmlText=saved.html;delete labels[label];}
   }
  }
  public static function MountKey(game:Game):int {
   if(!game||!game.mKeybindManager||game.mKeybindManager.mbStatePickKey)return 0;
   // method_31 maps physical key -> command, not the reverse. Scan only the
   // bounded normal-context map, then verify the current input context agrees.
   for(var key:int=1;key<255;key++)if(game.mKeybindManager.method_31(key,game.CONTEXT_NORMAL)==Game.const_274&&game.mKeybindManager.method_907(key)==Game.const_274)return key;
   return 0;
  }
  public static function Mount():Boolean {
   if(!main||!main.stage||!main.var_523||main.var_523.length!=1)return false;
   var field:TextField=main.stage.focus as TextField;
   if(field&&field.type==TextFieldType.INPUT)return false;
   var game:Game=main.var_523[0];
   if(game.gameState!=Game.STATE_PLAY)return false;
   var key:int=MountKey(game);
   if(key==0)return false;
   // Always pair the events. Existing game input/UI and server rules still
   // decide whether mounting is possible; this does not call gameplay methods.
   try{main.stage.dispatchEvent(new KeyboardEvent(KeyboardEvent.KEY_DOWN,true,false,0,key));}
   finally{main.stage.dispatchEvent(new KeyboardEvent(KeyboardEvent.KEY_UP,true,false,0,key));}
   return true;
  }
 }
}
