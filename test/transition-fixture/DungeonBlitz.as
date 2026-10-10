package {
 import flash.display.Sprite;
 import flash.display.MovieClip;
 import flash.display.BitmapData;
 import flash.display.Loader;
 import flash.display.StageScaleMode;
 import flash.display.StageAlign;
 import flash.events.Event;
 import flash.events.MouseEvent;
 import flash.geom.Point;
 import flash.geom.Rectangle;
 import flash.external.ExternalInterface;
 import flash.text.TextField;
 import flash.net.URLRequest;
 import flash.system.LoaderContext;
 import flash.system.ApplicationDomain;
 import flash.utils.getTimer;
 public class DungeonBlitz extends Sprite {
  private var main:Main;
  private var game:Game;
  private var lastSize:String="";
  private var lastCanvas:BitmapData;
  private var click:Point;
  private var target:String="";
  private var downs:uint=0;
  private var loaded:uint=0;
  private var worldEnabled:Boolean=false;
  private var sceneEnabled:Boolean=false;
  private var previousCoverage:Boolean=false;
  private var pan:Number=0;
  private var cacheIdentity:Object;
  private var cacheRebuilds:uint=0;
  private var worldFrames:uint=0;
  private var pixelErrors:uint=0;
  private var worldError:String="";
  public function DungeonBlitz(){if(stage)setup();else addEventListener(Event.ADDED_TO_STAGE,setup);}
  private function setup(event:Event=null):void {
   stage.scaleMode=StageScaleMode.NO_SCALE;stage.align=StageAlign.TOP_LEFT;stage.frameRate=30;
   graphics.beginFill(0x484955);graphics.drawRect(0,0,10000,10000);graphics.endFill();
   for each(var asset:String in ["UI_0.swf","LevelsHome.swf"]){
    var loader:Loader=new Loader();loader.contentLoaderInfo.addEventListener(Event.COMPLETE,assetLoaded);
    loader.load(new URLRequest("/assets/"+asset),new LoaderContext(false,ApplicationDomain.currentDomain));
   }
  }
  private function assetLoaded(event:Event):void {if(++loaded==2)start();}
  private function start():void {
   main=new Main();addChild(main);main.method_1634();main.method_561(stage.stageWidth,stage.stageHeight);
   game=new Game(main);game.gameState="Login";main.var_523=new Vector.<Game>();main.var_523.push(game);
   game.var_89=new Sprite();game.var_245=new Sprite();game.edgeLayer=new Sprite();
   main.addChild(game.edgeLayer);main.addChild(game.var_89);main.addChild(game.var_245);
   var edge:Sprite=new Sprite();edge.name="am_EdgeFull";edge.graphics.lineStyle(6,0x656773);edge.graphics.drawRect(-4,-4,1160,776);game.edgeLayer.addChild(edge);
   game.screenHudTop=new class_79(game);game.screenLinkBar=new class_48(game);game.screenHudTopRight=new class_70(game);
   game.screenHudTop.mWindow=new class_33(game,box("Left HUD",0,0,300,26));
   game.screenLinkBar.mWindow=new class_33(game,box("Links",0,-30,300,26));
   game.screenHudTopRight.mWindow=new class_33(game,box("Right HUD",852,0,300,26));
   box("Centered bottom HUD, chat and quests",0,668,1152,100);
   addEventListener(Event.ENTER_FRAME,draw,false,-102);
   stage.addEventListener(MouseEvent.MOUSE_DOWN,mouse);
   ExternalInterface.addCallback("BlitzTransitionFixtureControl",control);
   ExternalInterface.addCallback("BlitzWorldFixtureControl",world);
   ExternalInterface.addCallback("BlitzRenderState",snapshot);
  }
  private function box(text:String,x:Number,y:Number,w:Number,h:Number):MovieClip {
   var clip:MovieClip=new MovieClip();clip.name=text;clip.x=x;clip.y=y;
   clip.graphics.beginFill(0x343b30);clip.graphics.lineStyle(2,0x878d72);clip.graphics.drawRect(0,0,w,h);clip.graphics.endFill();
   var label:TextField=new TextField();label.text=text;label.textColor=0xe5dec7;label.width=w;label.height=h;label.mouseEnabled=false;clip.addChild(label);game.var_89.addChild(clip);return clip;
  }
  private function control(play:Boolean,transition:Boolean):Boolean {
   game.gameState=play?Game.STATE_PLAY:"Login";
   if(transition){game.mTimeThisTick=1000;game.method_1947();}
   return true;
  }
  private function world(value:Number,scene:Boolean,oldCoverage:Boolean=false,reuse:Boolean=false):Boolean {
   if(!isFinite(value)||value<0||value>1500)return false;
   if(reuse&&worldEnabled&&sceneEnabled==scene&&previousCoverage==oldCoverage){pan=value;return true;}
   previousCoverage=oldCoverage;
   pan=value;sceneEnabled=scene;worldEnabled=true;
   if(game.var_107)game.var_107.method_643(true);
   // Small disposable pool; same original methods, dimensions and alternating
   // row algorithm as production. Avoid baseline allocating hundreds of MB.
   class_23.method_1579(576,668,0,oldCoverage?4:6,16);
   game.level=new Level(game);game.level.var_59=new MovieClip();game.level.var_1090=new Rectangle(0,0,4096,1336);
   for(var x:int=0;x<4096;x+=64){game.level.var_59.graphics.beginFill(color(x));game.level.var_59.graphics.drawRect(x,0,64,1336);game.level.var_59.graphics.endFill();}
   if(scene){
    var type:Class=ApplicationDomain.currentDomain.getDefinition("a_Room_Main") as Class;
    var room:MovieClip=new type() as MovieClip;room.stop();
    var bounds:Rectangle=room.getBounds(room);room.x=-bounds.x;room.y=-bounds.y;
    game.level.var_59.addChild(room);
   }
   game.var_1040=new Sprite();game.levelLayer=new Sprite();game.var_1040.addChild(game.levelLayer);
   game.playerEntLayer=new Sprite();game.var_107=new class_23(game);game.levelLayer.addChild(game.var_107.var_343);
   game.screenMap=new class_119(game);game.screenForge=new class_75(game);
   cacheIdentity=game.var_107.var_986;cacheRebuilds=0;worldFrames=0;pixelErrors=0;worldError="";
   return true;
  }
  private function color(x:Number):uint {return (uint(Math.floor(x/64))*0x173b53+0x294f61)&0xffffff;}
  private function drawWorld():void {
   try{
    game.mTimeThisTick=getTimer();game.levelLayer.x=-pan;game.levelLayer.y=-250;
    game.var_107.method_1753();if(cacheIdentity!=game.var_107.var_986){++cacheRebuilds;cacheIdentity=game.var_107.var_986;}
    main.var_147.bitmapData.fillRect(main.var_147.bitmapData.rect,0x607065);game.method_1946();++worldFrames;
    if(!sceneEnabled){
     for(var x:int=17;x<Camera.SCREEN_WIDTH-4;x+=31){
      var worldX:Number=x+pan;if(worldX%64<3||worldX%64>61)continue;
      for each(var y:int in [200,500])if(main.var_147.bitmapData.getPixel(int(x*main.overallScale),int(y*main.overallScale))!=color(worldX))++pixelErrors;
     }
    }
   }catch(error:Error){worldError=error.toString();}
  }
  private function draw(event:Event=null):void {
   var scale:Number=main.overallScale;
   game.var_89.scaleX=game.var_89.scaleY=scale;game.var_245.scaleX=game.var_245.scaleY=scale;game.edgeLayer.scaleX=game.edgeLayer.scaleY=scale;
   if(worldEnabled&&game.gameState==Game.STATE_PLAY){drawWorld();return;}
   var key:String=main.var_147.bitmapData.width+"x"+main.var_147.bitmapData.height;
   if(key==lastSize&&lastCanvas==main.var_147.bitmapData)return;lastSize=key;lastCanvas=main.var_147.bitmapData;
   main.var_147.bitmapData.fillRect(main.var_147.bitmapData.rect,0x607065);
   for(var x:int=0;x<Camera.SCREEN_WIDTH;x+=64)main.var_147.bitmapData.fillRect(new Rectangle(x*scale,0,2*scale,Camera.PLAY_SCREEN_HEIGHT*scale),0x86958a);
   for(var y:int=0;y<Camera.PLAY_SCREEN_HEIGHT;y+=64)main.var_147.bitmapData.fillRect(new Rectangle(0,y*scale,Camera.SCREEN_WIDTH*scale,2*scale),0x86958a);
   main.var_147.bitmapData.fillRect(new Rectangle(0,0,16*scale,Camera.PLAY_SCREEN_HEIGHT*scale),0x8c6651);
   main.var_147.bitmapData.fillRect(new Rectangle((Camera.SCREEN_WIDTH-16)*scale,0,16*scale,Camera.PLAY_SCREEN_HEIGHT*scale),0x51808c);
  }
  private function mouse(event:MouseEvent):void {++downs;click=main.method_987(new Point());target=event.target.name;}
  private function snapshot():Object {
   var value:Object=BlitzDisplay.Snapshot();value.fixture={downs:downs,target:target,mouseX:click?click.x:null,mouseY:click?click.y:null,
    left:game.screenHudTop.mWindow.mMovieClip.x,right:game.screenHudTopRight.mWindow.mMovieClip.x,edgeVisible:game.edgeLayer.getChildByName("am_EdgeFull").visible,
    worldEnabled:worldEnabled,worldFrames:worldFrames,cacheRebuilds:cacheRebuilds,pixelErrors:pixelErrors,worldError:worldError};return value;
  }
 }
}
