package {
 import flash.display.*;import flash.events.*;import flash.text.*;
 import flash.net.URLRequest;import flash.system.*;import flash.external.ExternalInterface;
 public class DungeonBlitz extends Sprite {
  private var main:Main;private var game:Game;private var presses:uint=0;private var keys:uint=0;private var input:TextField;
  public function DungeonBlitz(){trace("REFRESH_CTOR");var loader:Loader=new Loader();loader.contentLoaderInfo.addEventListener(Event.COMPLETE,start);loader.load(new URLRequest("/assets/UI_0.swf"),new LoaderContext(false,ApplicationDomain.currentDomain));}
  private function start(event:Event):void {
   trace("REFRESH_ART_READY");
   stage.scaleMode=StageScaleMode.NO_SCALE;stage.align=StageAlign.TOP_LEFT;
   graphics.beginFill(0x484955);graphics.drawRect(0,0,10000,10000);graphics.endFill();
   main=new Main();addChild(main);main.method_1634();trace("REFRESH_MAIN_READY");main.method_561(stage.stageWidth,stage.stageHeight);trace("REFRESH_LAYOUT_READY");
   ExternalInterface.addCallback("BlitzRefreshFixtureControl",control);ExternalInterface.addCallback("BlitzRefreshFixtureState",snapshot);
   // Reuse the host's isolated-fixture integration switch after validating the
   // complete source before building this constructor/packet-free fixture.
   ExternalInterface.addCallback("BlitzTransitionFixtureControl",control);
   input=new TextField();input.type=TextFieldType.INPUT;input.width=200;input.height=24;input.y=50;addChild(input);
   stage.addEventListener(KeyboardEvent.KEY_DOWN,function(event:KeyboardEvent):void{keys++;});control(loaderInfo.parameters.phase=="resume"?"cached":"playing");
  }
  private function control(mode:String):Boolean {
   stage.focus=null;presses=0;keys=0;game=new Game(main);main.var_523=new Vector.<Game>();main.var_523.push(game);
   game.gameState=Game.STATE_PLAY;game.clientUserID=123;game.clientEntName="FixtureHero";
   game.var_94=new class_94(game);
   game.clientEnt=new Entity(null,null,null,0,0,0,0,0,0,0,null,null,null,null,null,null);
   if(mode=="playing")return true;
   if(mode=="cached"||mode=="list"||mode=="missing"||mode=="account"||mode=="duplicate"||mode=="waiting"){
    game.gameState=Game.STATE_LOGIN;game.clientUserID=mode=="account"?456:0;
    game.var_341=new ScreenCharacterSelection(game);game.var_341.var_28=new MovieClip();game.var_341.var_400="FixtureHero";
    if(mode=="waiting"){game.var_341.var_28.visible=false;return true;}
    if(mode!="cached"){
     game.clientUserID=mode=="account"?456:123;game.var_355=new Vector.<Object>();
     game.var_355.push({name:"Other"});if(mode!="missing")game.var_355.push({name:"FixtureHero"});if(mode=="duplicate")game.var_355.push({name:"FixtureHero"});
    }
    return true;
   }
   game.clientEnt.entState=mode=="alive"?0:Entity.const_6;
   game.var_936=new class_95(game);game.var_936.mbVisible=mode!="hidden";game.var_936.var_2=new MovieClip();
   var button:MovieClip=new MovieClip();button.name="am_Respawn";game.var_936.var_2.addChild(button);
   if(mode!="cooldown")button.addEventListener(MouseEvent.MOUSE_DOWN,function(event:MouseEvent):void{presses++;event.stopPropagation();});
   if(mode=="typing")stage.focus=input;
   if(mode=="modal"){game.var_94.var_88=new MovieClip();game.var_94.var_88.visible=true;}
   return true;
  }
  private function snapshot():Object {return {ready:main!=null,presses:presses,keys:keys,entries:game?game.clientEntID:0,selected:game?game.var_1125:null,index:game&&game.var_341?game.var_341.var_1329:null,refresh:BlitzInput.RefreshState()};}
 }
}
