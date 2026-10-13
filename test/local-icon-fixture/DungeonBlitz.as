package {
 import flash.display.*;
 import flash.events.*;
 import flash.geom.Rectangle;
 import flash.external.ExternalInterface;
 import flash.net.URLRequest;
 import flash.system.ApplicationDomain;
 import flash.system.LoaderContext;
 import flash.utils.ByteArray;
 public class DungeonBlitz extends Sprite {
  private var main:Main;
  private var game:Game;
  private var loaded:int=0;
  private var error:String="";
  private var started:Boolean=false;
  private var phase:String="loading";
  private var icons:Array=["a_PowerIcon_MaceSmash","a_PowerIcon_DivineBolt","a_PowerIcon_DoubleStrike","a_PowerIcon_DaggerFlurry","a_PowerIcon_FireBall","a_PowerIcon_DeathBlow","a_PetIcon_Dismiss","a_MountIcon_Dismount"];
  public function DungeonBlitz(){if(stage)setup();else addEventListener(Event.ADDED_TO_STAGE,setup);}
  private function setup(event:Event=null):void {
   stage.scaleMode=StageScaleMode.NO_SCALE;stage.align=StageAlign.TOP_LEFT;
   ExternalInterface.addCallback("BlitzRenderState",state);
   ExternalInterface.addCallback("BlitzTransitionFixtureControl",control);
   for each(var file:String in ["UI_0.swf","UI_1.swf","UI_2.swf","UI_3.swf","UI_4.swf","UI_Library.swf","UI_Seasonal.swf"]){
    var loader:Loader=new Loader();loader.contentLoaderInfo.addEventListener(Event.COMPLETE,ready);loader.contentLoaderInfo.addEventListener(IOErrorEvent.IO_ERROR,failed);
    loader.load(new URLRequest("/assets/"+file),new LoaderContext(false,ApplicationDomain.currentDomain));
   }
  }
  private function failed(e:IOErrorEvent):void {error=e.toString();}
  private function ready(e:Event):void {if(++loaded==7)try{start();}catch(e:Error){error=e.toString()+" "+e.getStackTrace();}}
  private function start():void {
   main=new Main();addChild(main);main.method_1634();main.method_561(stage.stageWidth,stage.stageHeight);
   game=new Game(main);game.gameState="Login";main.var_523=new Vector.<Game>();main.var_523.push(game);
   game.var_89=new Sprite();main.addChild(game.var_89);game.mUIManager=new class_4(game);
   phase="HUD definition "+ApplicationDomain.currentDomain.hasDefinition("a_Hud");game.screenHud=new class_58(game);var clip:MovieClip=class_4.method_16("a_Hud",true);clip.stop();
   game.screenHud.mWindow=new class_33(game,clip);game.screenHud.var_2=clip;game.var_89.addChild(clip);game.mUIManager.var_1240.push(game.screenHud);
   stage.addEventListener(Event.ENTER_FRAME,initialize);
  }
  private function initialize(event:Event):void {
   stage.removeEventListener(Event.ENTER_FRAME,initialize);
   try {
   game.screenHud.OnCreateScreen();
   game.clientEnt=new Entity(game,"",null,0,0,0,0,0,0,0,null,null,"",null,null,null);
   game.clientEnt.combatState=new CombatState(game.clientEnt);game.clientEnt.var_228=100;game.clientEnt.var_1785=100;
   game.clientEnt.currHP=game.clientEnt.maxHP=1169;game.clientEnt.mExpLevel=8;game.clientEnt.var_859=0;game.mTimeThisTick=5000;
   game.clientEnt.hudPowers=new Vector.<PowerType>(9);
   for(var n:int=0;n<8;n++){phase="bind slot "+(n+1);var power:PowerType=new PowerType();power.powerID=n+1;power.powerName="Diagnostic"+n;power.basePowerName=power.powerName;power.iconName=icons[n];power.coolDownTime=1000;game.clientEnt.hudPowers[n+1]=power;game.screenHud.method_1566(n+1,power);}
   game.screenHud.var_2.am_HPText.text="1169/1169";game.screenHud.var_2.am_LevelText.text="8";
   game.screenHud.var_2217.mHealthPerc=1;game.screenHud.var_2217.TickMovieClip();
   game.screenHud.var_729.mHealthPerc=1;game.screenHud.var_729.TickMovieClip();game.screenHud.var_645.mHealthPerc=1;game.screenHud.var_645.TickMovieClip();
   main.var_147.bitmapData.fillRect(main.var_147.bitmapData.rect,0x484955);
   started=true;stage.addEventListener(Event.RESIZE,resized);resized();
   }catch(e:Error){error=e.toString()+" "+e.getStackTrace();}
  }
  private function resized(e:Event=null):void {if(!started)return;try{main.method_561(stage.stageWidth,stage.stageHeight);game.var_89.scaleX=game.var_89.scaleY=main.overallScale;game.screenHud.method_1505();}catch(e:Error){error=e.toString()+" "+e.getStackTrace();}}
  private function control(play:Boolean,transition:Boolean,menu:String="none",transfer:Boolean=false,phase:String=""):Boolean {if(!started)return false;try{resized();if(menu=="map"){for(var n:int=1;n<=8;n++)game.screenHud.method_1566(n,null);}else if(menu=="none"){for(n=1;n<=8;n++)game.screenHud.method_1566(n,game.clientEnt.hudPowers[n]);}else if(menu=="forge"){for(n=1;n<=2;n++){var missing:PowerType=new PowerType();missing.powerID=100+n;missing.powerName=n==1?"MeteorROR":"FireBrandShot1";missing.basePowerName=missing.powerName;missing.iconName=n==1?"a_PowerIcon_MeteorROR":"a_PowerIcon_CrimsonShot";missing.coolDownTime=1000;game.screenHud.method_1566(n,missing);}}return true;}catch(e:Error){error=e.toString()+" "+e.getStackTrace();return false;}}
  private function state():Object {
   var buttons:Array=[];
   if(game&&game.screenHud&&game.screenHud.mPowerButtons)for(var n:int=0;n<8;n++){var key:class_153=game.screenHud.mPowerButtons[n];if(!key)continue;var name:String=key.var_434?key.var_434.iconName:icons[n];var bitmap:Bitmap=key.var_220;var pixels:BitmapData=bitmap?bitmap.bitmapData:null;var rect:Rectangle=pixels?pixels.getColorBoundsRect(0xff000000,0,false):null;var children:Array=[];for(var j:int=0;j<key.buttonClip.numChildren;j++)children.push(key.buttonClip.getChildAt(j).name);buttons.push({slot:n+1,icon:name,definition:ApplicationDomain.currentDomain.hasDefinition(name),bitmapWidth:pixels?pixels.width:0,bitmapHeight:pixels?pixels.height:0,opaquePixels:rect?rect.width*rect.height:0,visible:key.keyClip.visible,parentVisible:game.screenHud.var_2.am_PowerButtons.visible,scale:key.keyClip.scaleX,children:children,blank:!!key.var_2274,buttonFrame:key.buttonClip.currentFrame});}
   var matches:Array=[];
   var originalScale:Number=main?main.overallScale:1;
   if(started)for each(var density:Number in [0.5,0.75,1,1.5,2])for(var aliasIndex:int=0;aliasIndex<2;aliasIndex++){
    main.overallScale=density;
    var alias:String=aliasIndex==0?"a_PowerIcon_MeteorROR":"a_PowerIcon_CrimsonShot";
    var base:String=aliasIndex==0?"a_PowerIcon_Meteor":"a_PowerIcon_FireBall";
    var a:Bitmap=class_4.method_639(game,alias,1);var b:Bitmap=class_4.method_639(game,base,1);
    var equal:Boolean=!!a.bitmapData&&!!b.bitmapData&&a.bitmapData.width==b.bitmapData.width&&a.bitmapData.height==b.bitmapData.height&&a.x==b.x&&a.y==b.y;
    if(equal){var ap:ByteArray=a.bitmapData.getPixels(a.bitmapData.rect);var bp:ByteArray=b.bitmapData.getPixels(b.bitmapData.rect);ap.position=bp.position=0;while(ap.bytesAvailable&&equal)equal=ap.readUnsignedInt()==bp.readUnsignedInt();}
    matches.push({alias:alias,native:base,density:density,pixelsMatch:equal});if(a.bitmapData)a.bitmapData.dispose();if(b.bitmapData)b.bitmapData.dispose();
   }
   if(main)main.overallScale=originalScale;
   return {fixture:{started:started,loaded:loaded,error:error,phase:phase,buttons:buttons,aliasPixels:matches},scale:main?main.overallScale:0};
  }
 }
}
