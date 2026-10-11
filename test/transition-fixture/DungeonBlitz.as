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
 import flash.geom.Matrix;
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
  private var pending:Game;
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
  private var extraMenus:Array=[];
  private var labelProbes:Array=[];
  private var sceneTree:Object;
  public function DungeonBlitz(){if(stage)setup();else addEventListener(Event.ADDED_TO_STAGE,setup);}
  private function setup(event:Event=null):void {
   stage.scaleMode=StageScaleMode.NO_SCALE;stage.align=StageAlign.TOP_LEFT;stage.frameRate=30;
   graphics.beginFill(0x484955);graphics.drawRect(0,0,10000,10000);graphics.endFill();
   for each(var asset:String in ["UI_0.swf","UI_0_1.swf","UI_0_2.swf","UI_0_3.swf","UI_1.swf","UI_2.swf","UI_4.swf","LevelsHome.swf","LevelsJC.swf"]){
    var loader:Loader=new Loader();loader.contentLoaderInfo.addEventListener(Event.COMPLETE,assetLoaded);
    loader.load(new URLRequest("/assets/"+asset),new LoaderContext(false,ApplicationDomain.currentDomain));
   }
  }
  private function assetLoaded(event:Event):void {if(++loaded==9)start();}
  private function start():void {
   main=new Main();addChild(main);main.method_1634();main.method_561(stage.stageWidth,stage.stageHeight);
   game=new Game(main);game.gameState="Login";main.var_523=new Vector.<Game>();main.var_523.push(game);
   game.var_89=new Sprite();game.var_245=new Sprite();game.edgeLayer=new Sprite();
   game.mUIManager=new class_4(game);
   main.addChild(game.edgeLayer);main.addChild(game.var_89);main.addChild(game.var_245);
   var edge:Sprite=new Sprite();edge.name="am_EdgeFull";edge.graphics.lineStyle(6,0x656773);edge.graphics.drawRect(-4,-4,1160,776);game.edgeLayer.addChild(edge);
   game.screenHudTop=new class_79(game);game.screenLinkBar=new class_48(game);game.screenHudTopRight=new class_70(game);
   attach(game.screenHudTop,"a_HudTop");attach(game.screenLinkBar,"a_LinkBar");attach(game.screenHudTopRight,"a_HudTopRight");
   game.screenHudTop.OnCreateScreen();game.screenHudTopRight.OnCreateScreen();
   freeze(game.screenHudTop.var_2);freeze(game.screenHudTopRight.var_2);
   for each(var absent:String in ["am_GoLeave","am_GoLeaveDungeon","am_LeaveGroup","am_GroupUnlocked","am_GroupLocked","am_GearNotify","am_SocialNotify"])game.screenHudTop.var_2[absent].visible=false;
   for each(absent in ["am_GoHome","am_GoLeave","am_GoLeaveDungeon"])game.screenHudTop.var_2[absent].am_Cooldown.visible=false;
   game.screenHudTop.var_2.am_SocialCount.am_Text.text="0";
   for each(absent in ["am_SoundOff","am_PotionContainer"])game.screenHudTopRight.var_2[absent].visible=false;
   game.screenHudTopRight.var_2.am_Gold.text="45,884";game.screenHudTopRight.var_2.am_Idols.text="10";
   game.screenLinkBar.var_2.am_AboutBox.visible=false;
   game.screenHud=new class_58(game);attach(game.screenHud,"a_Hud");
   game.screenHud.OnCreateScreen();
   game.screenHud.var_2217.mHealthPerc=1;game.screenHud.var_2217.TickMovieClip();
   game.screenHud.var_729.mHealthPerc=1;game.screenHud.var_729.TickMovieClip();
   game.screenHud.var_645.mHealthPerc=1;game.screenHud.var_645.TickMovieClip();
   game.screenHud.var_2.am_HPText.text="29798/29798";game.screenHud.var_2.am_ManaText.text="80/80";game.screenHud.var_2.am_ClassManaText.text="100/100";game.screenHud.var_2.am_LevelText.text="32";
   game.screenChat=new class_127(game);attach(game.screenChat,"a_ScreenChat");
   for each(var detail:String in ["am_ChatHistoryBackLarge","am_ChannelChoices","am_ChatOptions","am_ItemMaterialDetail"])game.screenChat.var_2[detail].visible=false;
   game.screenQuestTracker=new class_112(game);attach(game.screenQuestTracker,"a_QuestTracker");
   game.screenQuestTracker.OnCreateScreen();
   game.screenQuestTracker.var_2.am_InitialMapCover.visible=false;
   game.screenQuestTracker.var_2.am_Selector.visible=false;
   game.screenQuestTracker.var_2.am_ContactMatte.am_Tooltip.visible=false;
   game.screenQuestTracker.var_2.am_QuestName.text="Hiding Out";
   game.screenQuestTracker.var_2.am_QuestDesc.text="Stop the gang leaders before they kill Odryn";
   game.screenQuestTracker.var_2.am_ProgressText.text="53 ft";
   game.screenBuyIdols=new class_63(game);attach(game.screenBuyIdols,"a_MammothIdolWindow");game.screenBuyIdols.mWindow.mMovieClip.visible=false;
   game.screenLockBox=new class_73(game);attach(game.screenLockBox,"a_ScreenLockBoxAD");game.screenLockBox.mWindow.mMovieClip.visible=false;
   game.screenBarn=new class_99(game);attach(game.screenBarn,"a_ScreenBarn");extraMenus.push(game.screenBarn);
   game.screenForge=new class_75(game);attach(game.screenForge,"a_ScreenMagicForge");extraMenus.push(game.screenForge);
   game.screenTome=new class_50(game);attach(game.screenTome,"a_ScreenTome");extraMenus.push(game.screenTome);
   for each(var menuScreen:class_32 in extraMenus)menuScreen.mWindow.mMovieClip.visible=false;
   game.screenFriend=new class_56(game);game.screenFriend.var_26=class_4.method_16("a_FriendWindow",true);freeze(game.screenFriend.var_26);
   game.screenFriend.var_26.x=370;game.screenFriend.var_26.y=658-game.screenFriend.var_26.height*1.2;game.screenFriend.var_26.scaleX=game.screenFriend.var_26.scaleY=1.2;game.var_89.addChild(game.screenFriend.var_26);game.screenFriend.var_26.visible=false;
   SuperAnimData.aaMain=main;SuperAnimData.method_806();
   try {for each(var raster:Number in [0.5,1,1.4,2,3]){
    var label:MovieClip=class_4.method_16("a_PlayerName",true);label.am_NameText.text="Skitts";
    var cached:Sprite=SuperAnimData.method_807(label,raster);
    var reference:BitmapData=new BitmapData(1000,120,true,0);var rendered:BitmapData=new BitmapData(1000,120,true,0);
    var matrix:Matrix=new Matrix(raster,0,0,raster,500,30);reference.draw(label,matrix);rendered.draw(cached,matrix);
    var a:Rectangle=reference.getColorBoundsRect(0xff000000,0,false);var b:Rectangle=rendered.getColorBoundsRect(0xff000000,0,false);
    labelProbes.push({scale:raster,reference:a,cached:b,errorX:b.x-a.x,errorY:b.y-a.y});reference.dispose();rendered.dispose();SuperAnimData.method_504(cached);
   }}catch(labelError:Error){labelProbes.push({error:labelError.toString()});}
   box("NPC name",600,350,90,22);
   var group:MovieClip=class_4.method_16("a_GroupFrame",true);freeze(group);group.name="fixture-party";group.x=174;group.y=20;group.scaleX=group.scaleY=0.6;game.var_89.addChild(group);
   for each(var name:String in ["a_Hud","a_HudTop","a_HudTopRight","a_ScreenChat","a_QuestTracker","a_MammothIdolWindow","a_ScreenLockBoxAD","a_RespawnWindow","a_FloaterSlugline","a_NewsHUD","a_Room_Main","a_ScreenBarn","a_ScreenTome","a_FriendWindow","a_PlayerName","a_StorePetWindow"]){
    if(ApplicationDomain.currentDomain.hasDefinition(name)){var type:Class=ApplicationDomain.currentDomain.getDefinition(name) as Class;assets.push(tree(new type(),3));}
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
   var clip:MovieClip=class_4.method_16(name,true);freeze(clip);screen.mWindow=new class_33(game,clip);screen.var_2=screen.var_2105?clip[screen.var_2105]:clip;game.var_89.addChild(clip);game.mUIManager.var_1240.push(screen);
   hideTutorials(clip);
  }
  private function hideTutorials(value:DisplayObject):void {
   if(value.name=="am_TutorialInteraction"||value.name=="am_TutorialWindow")value.visible=false;
   var container:DisplayObjectContainer=value as DisplayObjectContainer;
   if(container)for(var i:int=0;i<container.numChildren;i++)hideTutorials(container.getChildAt(i));
  }
  private function box(text:String,x:Number,y:Number,w:Number,h:Number):MovieClip {
   var clip:MovieClip=new MovieClip();clip.name=text;clip.x=x;clip.y=y;
   clip.graphics.beginFill(0x343b30);clip.graphics.lineStyle(2,0x878d72);clip.graphics.drawRect(0,0,w,h);clip.graphics.endFill();
   var label:TextField=new TextField();label.text=text;label.textColor=0xe5dec7;label.width=w;label.height=h;label.mouseEnabled=false;clip.addChild(label);game.var_89.addChild(clip);return clip;
  }
  private function control(play:Boolean,transition:Boolean,menu:String="none",transfer:Boolean=false):Boolean {
   if(pending){main.var_523.splice(main.var_523.indexOf(pending),1);pending=null;}
   game.gameState=transfer?Game.STATE_TRANSFER:(play?Game.STATE_PLAY:"Login");
   if(transfer){pending=new Game(main);pending.gameState="Login";main.var_523.push(pending);}
   if(!transition)worldEnabled=false;
   game.screenBuyIdols.mWindow.mMovieClip.visible=menu=="idols";game.screenLockBox.mWindow.mMovieClip.visible=menu=="trove";
   for(var n:int=0;n<extraMenus.length;n++)extraMenus[n].mWindow.mMovieClip.visible=menu==["barn","forge","tome"][n];
   game.screenFriend.var_26.visible=menu=="social";
   if(menu=="map")game.screenQuestTracker.var_1990.Show(true);else game.screenQuestTracker.var_1990.Hide(true);
   game.screenQuestTracker.var_2.am_ContactMatte.alpha=1;
   game.screenQuestTracker.var_2.am_ContactMatte.am_Tooltip.visible=menu=="map";
   game.screenQuestTracker.var_2.am_ArrowWrapper.visible=menu!="map";
   game.screenQuestTracker.var_2.am_QuestName.visible=menu!="map";
   game.screenQuestTracker.var_2.am_QuestDesc.visible=menu!="map";
   game.screenQuestTracker.var_2.am_ProgressText.visible=menu!="map";
   if(transition){game.mTimeThisTick=1000;game.method_1947();}
   return true;
  }
  private function world(value:Number,scene:Boolean,oldCoverage:Boolean=false,reuse:Boolean=false,y:Number=250,ties:Boolean=false,art:String="a_Room_Main"):Boolean {
   if(!isFinite(value)||value<0||value>25000||!isFinite(y)||y<0||y>2000)return false;
   vertical=y;
   tiedTime=ties;
   if(reuse&&worldEnabled&&sceneEnabled==scene&&previousCoverage==oldCoverage){pan=value;return true;}
   previousCoverage=oldCoverage;
   pan=value;sceneEnabled=scene;worldEnabled=true;
   if(game.var_107)game.var_107.method_643(true);
   // Small disposable pool; same original methods, dimensions and alternating
   // row algorithm as production. Avoid baseline allocating hundreds of MB.
   class_23.method_1579(576,668,0,oldCoverage?4:6,scene?100:32);
   game.level=new Level(game);game.level.var_59=new MovieClip();game.level.var_1090=new Rectangle(-576,-668,32768,4008);
   game.clientEnt=null;
   if(!scene)for(var x:int=-576;x<32192;x+=64){game.level.var_59.graphics.beginFill(color(x));game.level.var_59.graphics.drawRect(x,-668,64,4008);game.level.var_59.graphics.endFill();}
   else {game.level.var_59.graphics.beginFill(0xb4d6bd);game.level.var_59.graphics.drawRect(-576,-668,32768,4008);game.level.var_59.graphics.endFill();}
   if(scene){
    var type:Class=ApplicationDomain.currentDomain.getDefinition(art) as Class;
    var room:MovieClip=new type() as MovieClip;room.stop();
    cleanArt(room);sceneTree=tree(room,3);
    var bounds:Rectangle=visibleBounds(room,room);room.x=-bounds.x+64;room.y=668-bounds.bottom;
    game.level.var_59.addChild(room);
    game.level.var_333=art.indexOf("a_Room_JC")!=0;
    game.clientEnt=new Entity(game,"",null,0,0,0,0,0,0,0,null,null,"",null,null,null);
    game.clientEnt.currRoom=new Room(game,room);
   }
   game.var_1040=new Sprite();game.levelLayer=new Sprite();game.var_1040.addChild(game.levelLayer);
   game.playerEntLayer=new Sprite();game.var_107=new class_23(game);game.levelLayer.addChild(game.var_107.var_343);
   game.screenMap=new class_119(game);
   cacheIdentity=game.var_107.var_986;cacheRebuilds=0;worldFrames=0;pixelErrors=0;worldError="";
   return true;
  }
  private function visibleBounds(value:DisplayObject,root:DisplayObject):Rectangle {
   var result:Rectangle=new Rectangle();if(!value.visible)return result;
   var container:DisplayObjectContainer=value as DisplayObjectContainer;
   if(!container)return value.getBounds(root);
   for(var i:int=0;i<container.numChildren;i++){
    var bounds:Rectangle=visibleBounds(container.getChildAt(i),root);
    if(bounds.width&&bounds.height)result=result.isEmpty()?bounds:result.union(bounds);
   }
   return result;
  }
  private function color(x:Number):uint {return (uint(Math.floor(x/64))*0x173b53+0x294f61)&0xffffff;}
  private function cleanArt(value:DisplayObject):void {
   var type:String=getQualifiedClassName(value);
   if(type.indexOf("a_Handle")==0||type.indexOf("a_Cue")==0||type.indexOf("a_Target")==0||type.indexOf("a_Camera")==0||type.indexOf("a_Volume")==0||type.indexOf("a_Collision")==0||type.indexOf("a_BossTarget")==0||type.indexOf("a_RoomDirector")==0||type.indexOf("a_LevelDirector")==0||type.indexOf("a_Soundscape")==0||type.indexOf("a_Player")==0||type.indexOf("a_Door")==0||value.name.indexOf("am_CollisionObject")==0||value.name.indexOf("am_Target")==0||value.name.indexOf("am_Moment")==0)value.visible=false;
   var movie:MovieClip=value as MovieClip;if(movie)movie.stop();var container:DisplayObjectContainer=value as DisplayObjectContainer;
   if(container)for(var n:int=0;n<container.numChildren;n++)cleanArt(container.getChildAt(n));
  }
  private function tree(value:DisplayObject,depth:int):Object {
   var bounds:Rectangle=value.getBounds(value);var children:Array=[];var container:DisplayObjectContainer=value as DisplayObjectContainer;
   if(depth>0&&container)for(var i:int=0;i<container.numChildren;i++)children.push(tree(container.getChildAt(i),depth-1));
   var movie:MovieClip=value as MovieClip;
   return {type:getQualifiedClassName(value),name:value.name,x:value.x,y:value.y,width:bounds.width,height:bounds.height,bx:bounds.x,by:bounds.y,scaleX:value.scaleX,scaleY:value.scaleY,visible:value.visible,alpha:value.alpha,frames:movie?movie.totalFrames:0,labels:movie?movie.currentLabels:null,children:children};
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
    scene:sceneTree,labels:labelProbes,social:tree(game.screenFriend.var_26,0),barn:tree(game.screenBarn.mWindow.mMovieClip,2),questTree:tree(game.screenQuestTracker.var_2,1),topTree:tree(game.screenHudTop.var_2,1),
    worldEnabled:worldEnabled,worldFrames:worldFrames,cacheRebuilds:cacheRebuilds,pixelErrors:pixelErrors,worldError:worldError,assets:assets};return value;
  }
 }
}
