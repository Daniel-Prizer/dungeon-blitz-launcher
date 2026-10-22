package {
 import flash.external.ExternalInterface;
 import flash.events.KeyboardEvent;
 import flash.events.Event;
 import flash.display.DisplayObjectContainer;
 import flash.display.Sprite;
 import flash.display.Graphics;
 import flash.events.MouseEvent;
 import flash.net.URLRequest;
 import flash.net.navigateToURL;
 import flash.utils.getTimer;
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
  private static var runningCommand:int=0;
  private static var dispatching:Boolean=false;
  private static var refreshButton:Sprite;
  private static var refreshHint:TextField;
  private static var units:Number=1;
  private static var resumeName:String=null;
  private static var resumeUser:uint=0;
  private static var resumeStarted:uint=0;
  private static var reviveHeld:Boolean=false;
  public static function Attach(value:Main):void {
   main=value;
   if(!registered&&ExternalInterface.available){ExternalInterface.addCallback("BlitzMount",Mount);ExternalInterface.addCallback("BlitzSetMountShortcut",SetMountShortcut);ExternalInterface.addCallback("BlitzAutorun",Autorun);ExternalInterface.addCallback("BlitzStopAutorun",StopAutorun);ExternalInterface.addCallback("BlitzResumeCharacter",ResumeCharacter);ExternalInterface.addCallback("BlitzRefreshState",RefreshState);registered=true;}
   main.addEventListener(Event.ENTER_FRAME,UpdateMountLabel,false,-102,true);
   main.addEventListener(Event.ENTER_FRAME,CheckAutorun,false,-103,true);
   main.stage.addEventListener(KeyboardEvent.KEY_DOWN,ManualInput,true,100,true);
   main.stage.addEventListener(KeyboardEvent.KEY_DOWN,ManualInput,false,100,true);
   main.addEventListener(Event.ENTER_FRAME,UpdateRefresh,false,-104,true);
   main.stage.addEventListener(KeyboardEvent.KEY_DOWN,CancelResume,true,101,true);
   main.stage.addEventListener(KeyboardEvent.KEY_DOWN,CancelResume,false,101,true);
   main.stage.addEventListener(MouseEvent.MOUSE_DOWN,CancelResume,true,101,true);
   main.stage.addEventListener(MouseEvent.MOUSE_DOWN,CancelResume,false,101,true);
   main.stage.addEventListener(KeyboardEvent.KEY_DOWN,ReviveKey,true,102,true);
   main.stage.addEventListener(KeyboardEvent.KEY_DOWN,ReviveKey,false,102,true);
   main.stage.addEventListener(KeyboardEvent.KEY_UP,ReleaseRevive,true,102,true);
   main.stage.addEventListener(KeyboardEvent.KEY_UP,ReleaseRevive,false,102,true);
   main.addEventListener(Event.DEACTIVATE,ReleaseRevive,false,102,true);
  }
  private static function ReleaseRevive(event:Event):void {if(!(event is KeyboardEvent)||KeyboardEvent(event).keyCode==13)reviveHeld=false;}
  private static function ReviveKey(event:KeyboardEvent):void {
   if(event.keyCode!=13||event.ctrlKey||event.altKey||event.shiftKey)return;
   var game:Game=SingleGame();var field:TextField=main.stage.focus as TextField;
   if(!game||game.gameState!=Game.STATE_PLAY||!game.clientEnt||game.clientEnt.entState!=Entity.const_6||field&&field.type==TextFieldType.INPUT)return;
   if(!game.var_936||!game.var_936.mbVisible||!game.var_936.var_2||game.method_47())return;
   var button:DisplayObjectContainer=game.var_936.var_2.getChildByName("am_Respawn") as DisplayObjectContainer;
   if(!button||!button.visible)return;
   event.stopImmediatePropagation();event.preventDefault();
   if(reviveHeld)return;reviveHeld=true;
   // The existing button owns its disabled state, cooldown and server request.
   try{button.dispatchEvent(new MouseEvent(MouseEvent.MOUSE_DOWN,true,false));}
   finally{button.dispatchEvent(new MouseEvent(MouseEvent.MOUSE_UP,true,false));}
  }
  public static function SetMagnification(value:Number):void {if(isFinite(value)&&value>=0.1&&value<=16)units=1/value;}
  private static function SingleGame():Game {return main&&main.var_523&&main.var_523.length==1?main.var_523[0]:null;}
  private static function ValidName(value:String):Boolean {return value!=null&&value.length>0&&value.length<=64&&!/[\x00-\x1f\x7f]/.test(value);}
  public static function ResumeCharacter(user:Number,name:String):Boolean {
   if(!isFinite(user)||user<1||user>4294967295||user!=uint(user)||!ValidName(name))return false;
   resumeName=name;resumeUser=uint(user);resumeStarted=uint(getTimer());return true;
  }
  private static function CancelResume(event:Event=null):void {resumeName=null;resumeUser=0;}
  private static function TryResume(game:Game):void {
   if(!resumeName)return;
   if(uint(uint(getTimer())-resumeStarted)>60000){CancelResume();return;}
   if(!game)return;
   if(game.gameState==Game.STATE_PLAY||game.clientUserID&&game.clientUserID!=resumeUser){CancelResume();return;}
   var screen:ScreenCharacterSelection=game.var_341;
   if(!screen||!screen.method_40()||game.method_47())return;
   if(game.var_355){
    var selected:int=-1;
    for(var i:int=0;i<game.var_355.length;i++)if(game.var_355[i].name===resumeName){if(selected>=0){CancelResume();return;}selected=i;}
    if(selected<0){CancelResume();return;}
    screen.method_959(selected);
   }
   // Before authentication, only the exact character already displayed by the
   // game's own remembered session may enter. Its Play handler owns sign-in.
   if(screen.var_400!==resumeName)return;
   CancelResume();screen.method_1077(null);
  }
  private static function Refresh(event:MouseEvent):void {
   event.stopImmediatePropagation();var game:Game=SingleGame();
   if(!game||game.gameState!=Game.STATE_PLAY||!game.clientUserID||!ValidName(game.clientEntName))return;
   StopAutorun();refreshButton.mouseEnabled=false;
   var url:String=main.loaderInfo.url.split("#")[0]+"#blitz-refresh="+game.clientUserID+"/"+encodeURIComponent(game.clientEntName);
   try{navigateToURL(new URLRequest(url),"_self");}catch(error:Error){refreshButton.mouseEnabled=true;}
  }
  private static function Hint(event:MouseEvent):void {if(refreshHint)refreshHint.visible=event.type==MouseEvent.ROLL_OVER;}
  private static function UpdateRefresh(event:Event=null):void {
   if(!main||!main.stage)return;var game:Game=SingleGame();TryResume(game);
   if(!refreshButton){
    refreshButton=new Sprite();refreshButton.name="blitz-refresh";refreshButton.buttonMode=true;refreshButton.mouseChildren=false;refreshButton.tabEnabled=true;
    var g:Graphics=refreshButton.graphics;g.lineStyle(1.5,0xD8BC55);g.beginFill(0x484955);g.drawRoundRect(0,0,24,24,7,7);g.endFill();
    g.lineStyle(2,0xF3E5AF);g.moveTo(17,8);g.curveTo(12,3,7,8);g.curveTo(3,13,8,17);g.curveTo(13,21,18,15);g.moveTo(17,4);g.lineTo(17,9);g.lineTo(12,9);
    refreshButton.addEventListener(MouseEvent.CLICK,Refresh);refreshButton.addEventListener(MouseEvent.ROLL_OVER,Hint);refreshButton.addEventListener(MouseEvent.ROLL_OUT,Hint);
    refreshHint=new TextField();refreshHint.name="blitz-refresh-tooltip";refreshHint.defaultTextFormat=new TextFormat("_sans",12,0xF3E5AF);refreshHint.text="Refresh game";refreshHint.width=92;refreshHint.height=20;refreshHint.background=true;refreshHint.backgroundColor=0x30333C;refreshHint.mouseEnabled=false;refreshHint.selectable=false;refreshHint.visible=false;
   }
   if(refreshButton.parent!=main.stage)main.stage.addChild(refreshButton);
   if(refreshHint.parent!=main.stage)main.stage.addChild(refreshHint);
   refreshButton.scaleX=refreshButton.scaleY=units;refreshButton.x=main.stage.stageWidth-28*units;refreshButton.y=4*units;
   refreshHint.scaleX=refreshHint.scaleY=units;refreshHint.x=main.stage.stageWidth-98*units;refreshHint.y=31*units;
   refreshButton.visible=Boolean(game&&game.gameState==Game.STATE_PLAY&&game.clientUserID&&ValidName(game.clientEntName));
   if(!refreshButton.visible)refreshHint.visible=false;
  }
  public static function RefreshState():Object {return {visible:refreshButton&&refreshButton.visible,x:refreshButton?refreshButton.x:0,y:refreshButton?refreshButton.y:0,width:refreshButton?refreshButton.width:0,height:refreshButton?refreshButton.height:0,pending:resumeName!=null};}
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
   var command:int=game.clientEnt.bLeftFacing?Game.const_153:Game.const_151;
   var key:int=MovementKey(game,command);if(!key)return false;
   runningKey=key;runningGame=game;runningCommand=command;dispatching=true;
   try{main.stage.dispatchEvent(new KeyboardEvent(KeyboardEvent.KEY_DOWN,true,false,0,key));}
   finally{dispatching=false;}
   return true;
  }
  public static function StopAutorun():Boolean {
   var key:int=runningKey;runningKey=0;runningGame=null;runningCommand=0;
   if(key&&main&&main.stage){dispatching=true;try{main.stage.dispatchEvent(new KeyboardEvent(KeyboardEvent.KEY_UP,true,false,0,key));}finally{dispatching=false;}}
   return true;
  }
  private static function CheckAutorun(event:Event):void {
   if(!runningKey)return;
   if(CurrentGame()!=runningGame||MovementKey(runningGame,runningCommand)!=runningKey){StopAutorun();return;}
   // Native key-up removes a movement command even when a synthetic key-down
   // is holding it. Reassert only when absent, through the original handler.
   // Facing can change while aiming; keep the direction chosen at activation.
   // Focus loss may release native held keys. An explicit active autorun
   // remains local to this stage and restores only its selected movement key;
   // it never routes OS input into whichever application is now foreground.
   if(runningGame.var_406&&runningGame.var_406.indexOf(runningCommand)<0){
    dispatching=true;
    try{main.stage.dispatchEvent(new KeyboardEvent(KeyboardEvent.KEY_DOWN,true,false,0,runningKey));}finally{dispatching=false;}
   }
  }
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
