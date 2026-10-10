package {
 import flash.external.ExternalInterface;
 import flash.events.KeyboardEvent;
 import flash.text.TextField;
 import flash.text.TextFieldType;
 // Opt-in key alias only: use the client's current keymap and original stage
 // listeners. No entity, packet, cooldown, equipment or saved keymap mutation.
 public class BlitzInput {
  private static var main:Main;
  private static var registered:Boolean=false;
  public static function Attach(value:Main):void {
   main=value;
   if(!registered&&ExternalInterface.available){ExternalInterface.addCallback("BlitzMount",Mount);registered=true;}
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
