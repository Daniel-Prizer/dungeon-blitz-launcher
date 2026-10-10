package {
 import flash.display.Sprite;
 import flash.display.DisplayObject;
 import flash.display.DisplayObjectContainer;
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
 import flash.utils.getQualifiedClassName;
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
  private var vertical:Number=250;
  private var tiedTime:Boolean=false;
  private var cacheIdentity:Object;
  private var cacheRebuilds:uint=0;
  private var worldFrames:uint=0;
  private var pixelErrors:uint=0;
  private var worldError:String="";
  private var assets:Array=[];
  public function DungeonBlitz(){if(stage)setup();else addEventListener(Event.ADDED_TO_STAGE,setup);}
  private function setup(event:Event=null):void {
   stage.scaleMode=StageScaleMode.NO_SCALE;stage.align=StageAlign.TOP_LEFT;stage.frameRate=30;
   graphics.beginFill(0x484955);graphics.drawRect(0,0,10000,10000);graphics.endFill();
   for each(var asset:String in ["UI_0.swf","UI_0_1.swf","UI_0_2.swf","UI_0_3.swf","UI_1.swf","UI_2.swf","UI_4.swf","LevelsHome.swf"]){
    var loader:Loader=new Loader();loader.contentLoaderInfo.addEventListener(Event.COMPLETE,assetLoaded);
    loader.load(new URLRequest("/assets/"+asset),new LoaderContext(false,ApplicationDomain.currentDomain));
   }
  }
  private function assetLoaded(event:Event):void {if(++loaded==8)start();}
  private function start():void {
   main=new Main();addChild(main);main.method_1634();main.method_561(stage.stageWidth,stage.stageHeight);
   game=new Game(main);game.gameState="Login";main.var_523=new Vector.<Game>();main.var_523.push(game);
   game.var_89=new Sprite();game.var_245=new Sprite();game.edgeLayer=new Sprite();
   game.mUIManager=new class_4(game);
   main.addChild(game.edgeLayer);main.addChild(game.var_89);main.addChild(game.var_245);
   var edge:Sprite=new Sprite();edge.name="am_EdgeFull";edge.graphics.lineStyle(6,0x656773);edge.graphics.drawRect(-4,-4,1160,776);game.edgeLayer.addChild(edge);
   game.screenHudTop=new class_79(game);game.screenLinkBar=new class_48(game);game.screenHudTopRight=new class_70(game);
   attach(game.screenHudTop,"a_HudTop");attach(game.screenLinkBar,"a_LinkBar");attach(game.screenHudTopRight,"a_HudTopRight");
   game.screenLinkBar.var_2.am_AboutBox.visible=false;
   game.screenHud=new class_58(game);attach(game.screenHud,"a_Hud");
   game.screenChat=new class_127(game);attach(game.screenChat,"a_ScreenChat");
   for each(var detail:String in ["am_ChatHistoryBackLarge","am_ChannelChoices","am_ChatOptions","am_ItemMaterialDetail"])game.screenChat.var_2[detail].visible=false;
   game.screenQuestTracker=new class_112(game);attach(game.screenQuestTracker,"a_QuestTracker");
   game.screenBuyIdols=new class_63(game);attach(game.screenBuyIdols,"a_MammothIdolWindow");game.screenBuyIdols.mWindow.mMovieClip.visible=false;
   game.screenLockBox=new class_73(game);attach(game.screenLockBox,"a_ScreenLockBoxAD");game.screenLockBox.mWindow.mMovieClip.visible=false;
   box("NPC name",600,350,90,22);
   var group:MovieClip=class_4.method_16("a_GroupFrame",true);freeze(group);group.name="fixture-party";group.x=174;group.y=20;group.scaleX=group.scaleY=0.6;game.var_89.addChild(group);
   for each(var name:String in ["a_Hud","a_HudTop","a_HudTopRight","a_ScreenChat","a_QuestTracker","a_MammothIdolWindow","a_ScreenLockBoxAD","a_RespawnWindow","a_FloaterSlugline","a_NewsHUD","a_Room_Main"]){
    if(ApplicationDomain.currentDomain.hasDefinition(name)){var type:Class=ApplicationDomain.currentDomain.getDefinition(name) as Class;assets.push(tree(new type(),2));}
   }
   var rooms:Array=[];for each(var definition:String in ApplicationDomain.currentDomain.getQualifiedDefinitionNames())if(definition.indexOf("a_Room_")==0){var roomType:Class=ApplicationDomain.currentDomain.getDefinition(definition) as Class;rooms.push(tree(new roomType(),0));}
   assets.push({rooms:rooms});
   addEventListener(Event.ENTER_FRAME,draw,false,-102);
   stage.addEventListener(MouseEvent.MOUSE_DOWN,mouse);
   ExternalInterface.addCallback("BlitzTransitionFixtureControl",control);
   ExternalInterface.addCallback("BlitzWorldFixtureControl",world);
   ExternalInterface.addCallback("BlitzRenderState",snapshot);
  }
  private function freeze(value:DisplayObject):void {
   var movie:MovieClip=value as MovieClip;if(movie){var label:String="";for each(var item:Object in movie.currentLabels)if(item.name=="Ready")label="Ready";if(label)movie.gotoAndStop(label);else movie.stop();}
   var container:DisplayObjectContainer=value as DisplayObjectContainer;if(container)for(var i:int=0;i<container.numChildren;i++)freeze(container.getChildAt(i));
  }
  private function attach(screen:class_32,name:String):void {
   var clip:MovieClip=class_4.method_16(name,true);freeze(clip);screen.mWindow=new class_33(game,clip);screen.var_2=clip;game.var_89.addChild(clip);game.mUIManager.var_1240.push(screen);
  }
  private function box(text:String,x:Number,y:Number,w:Number,h:Number):MovieClip {
   var clip:MovieClip=new MovieClip();clip.name=text;clip.x=x;clip.y=y;
   clip.graphics.beginFill(0x343b30);clip.graphics.lineStyle(2,0x878d72);clip.graphics.drawRect(0,0,w,h);clip.graphics.endFill();
   var label:TextField=new TextField();label.text=text;label.textColor=0xe5dec7;label.width=w;label.height=h;label.mouseEnabled=false;clip.addChild(label);game.var_89.addChild(clip);return clip;
  }
  private function control(play:Boolean,transition:Boolean,menu:String="none"):Boolean {
   game.gameState=play?Game.STATE_PLAY:"Login";
   game.screenBuyIdols.mWindow.mMovieClip.visible=menu=="idols";game.screenLockBox.mWindow.mMovieClip.visible=menu=="trove";
   if(transition){game.mTimeThisTick=1000;game.method_1947();}
   return true;
  }
  private function world(value:Number,scene:Boolean,oldCoverage:Boolean=false,reuse:Boolean=false,y:Number=250,ties:Boolean=false):Boolean {
   if(!isFinite(value)||value<0||value>25000||!isFinite(y)||y<0||y>2000)return false;
   vertical=y;
   tiedTime=ties;
   if(reuse&&worldEnabled&&sceneEnabled==scene&&previousCoverage==oldCoverage){pan=value;return true;}
   previousCoverage=oldCoverage;
   pan=value;sceneEnabled=scene;worldEnabled=true;
   if(game.var_107)game.var_107.method_643(true);
   // Small disposable pool; same original methods, dimensions and alternating
   // row algorithm as production. Avoid baseline allocating hundreds of MB.
   class_23.method_1579(576,668,0,oldCoverage?4:6,32);
   game.level=new Level(game);game.level.var_59=new MovieClip();game.level.var_1090=new Rectangle(-576,-668,32768,4008);
   for(var x:int=-576;x<32192;x+=64){game.level.var_59.graphics.beginFill(color(x));game.level.var_59.graphics.drawRect(x,-668,64,4008);game.level.var_59.graphics.endFill();}
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
  private function tree(value:DisplayObject,depth:int):Object {
   var bounds:Rectangle=value.getBounds(value);var children:Array=[];var container:DisplayObjectContainer=value as DisplayObjectContainer;
   if(depth>0&&container)for(var i:int=0;i<container.numChildren;i++)children.push(tree(container.getChildAt(i),depth-1));
   return {type:getQualifiedClassName(value),name:value.name,x:value.x,y:value.y,width:bounds.width,height:bounds.height,bx:bounds.x,by:bounds.y,scaleX:value.scaleX,alpha:value.alpha,children:children};
  }
  private function drawWorld():void {
   try{
    game.mTimeThisTick=tiedTime?1000:getTimer();game.levelLayer.x=-pan;game.levelLayer.y=-vertical;
    game.var_107.method_1753();if(cacheIdentity!=game.var_107.var_986){++cacheRebuilds;cacheIdentity=game.var_107.var_986;}
    main.var_147.bitmapData.fillRect(main.var_147.bitmapData.rect,0x607065);game.method_1946();++worldFrames;
    if(!sceneEnabled){
     for(var x:int=2;x<main.var_147.bitmapData.width-2;x++){
      var worldX:Number=(x+0.5)/main.overallScale+pan;if(worldX%64<3||worldX%64>61)continue;
      for each(var y:int in [10,200,333,500,655])if(main.var_147.bitmapData.getPixel(x,int(y*main.overallScale))!=color(worldX))++pixelErrors;
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
    pan:pan,vertical:vertical,tiedTime:tiedTime,idolsVisible:game.screenBuyIdols.mWindow.mMovieClip.visible,troveVisible:game.screenLockBox.mWindow.mMovieClip.visible,
    left:game.screenHudTop.mWindow.mMovieClip.x,right:game.screenHudTopRight.mWindow.mMovieClip.x,edgeVisible:game.edgeLayer.getChildByName("am_EdgeFull").visible,
    hotbar:game.screenHud.mWindow.mMovieClip.x,chat:game.screenChat.mWindow.mMovieClip.x,quest:game.screenQuestTracker.mWindow.mMovieClip.x,party:game.var_89.getChildByName("fixture-party").x,nameX:game.var_89.getChildByName("NPC name").x,
    idols:game.screenBuyIdols.mWindow.mMovieClip.getChildAt(0).getBounds(game.var_89),trove:game.screenLockBox.mWindow.mMovieClip.getChildAt(0).getBounds(game.var_89),
    idolPanelWidth:game.screenBuyIdols.mWindow.mMovieClip.getChildByName("am_Panel").getBounds(game.var_89).width,trovePedestalWidth:MovieClip(game.screenLockBox.mWindow.mMovieClip.getChildAt(0)).getChildAt(1).getBounds(game.var_89).width,
    worldEnabled:worldEnabled,worldFrames:worldFrames,cacheRebuilds:cacheRebuilds,pixelErrors:pixelErrors,worldError:worldError,assets:assets};return value;
  }
 }
}
