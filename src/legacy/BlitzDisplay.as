package {
 import flash.external.ExternalInterface;
 import flash.display.DisplayObject;
 import flash.display.DisplayObjectContainer;
 import flash.display.Sprite;
 import flash.display.MovieClip;
 import flash.display.Shape;
 import flash.display.Bitmap;
 import flash.events.Event;
 import flash.geom.Rectangle;
 import flash.geom.Point;
 import flash.geom.Matrix;
 import flash.utils.getQualifiedClassName;
 import flash.system.ApplicationDomain;
 import flash.utils.Dictionary;
 // Rendering only. Keep the game's own resize/cache-invalidation path; never
 // change stage.frameRate, game clocks, input listeners or simulation state.
 public class BlitzDisplay {
  private static var main:Main;
  private static var registered:Boolean=false;
  private static var zoom:Number=1;
  private static var wideRequested:Boolean=false;
  private static var wideGame:Game;
  private static var offsets:Dictionary=new Dictionary(true);
  private static var edges:Dictionary=new Dictionary(true);
  private static var backdrops:Dictionary=new Dictionary(true);
  private static var matteScans:Dictionary=new Dictionary(true);
  private static var sizes:Dictionary=new Dictionary(true);
  private static var clips:Dictionary=new Dictionary(true);
  private static var interiorLimited:Boolean=false;
  private static var interiorClip:Rectangle;
  private static var frame:Sprite;
  private static var hudFrame:Sprite;
  private static var frameStyle:String="";
  private static const ORIGINAL_WIDTH:Number=1152;
  private static const WIDE_WIDTH:Number=768*16/9;
  public static function CorrectCrop(matrix:Matrix,crop:Rectangle):void {
   // Cropped raster pixels must pass through the inverse raster transform.
   // Adding pixel units directly to logical coordinates shifts cached labels.
   matrix.tx+=matrix.a*crop.x+matrix.c*crop.y;
   matrix.ty+=matrix.b*crop.x+matrix.d*crop.y;
  }
  private static function widen(object:DisplayObject,delta:Number):void {
   if(!object)return;var saved:Object=sizes[object];
   if(!saved){saved={width:object.width,last:object.width};sizes[object]=saved;}
   if(Math.abs(object.width-saved.last)>0.1)saved.width=object.width;
   if(Math.abs(object.width-saved.width-delta)>0.1)object.width=saved.width+delta;
   saved.last=object.width;
  }
  public static function Attach(value:Main):void {
   main=value;
   BlitzInput.Attach(value);
   if(main&&main.stage)BlitzFrameCounter.Attach(main.stage,main,PositionCounter);
   if(!registered&&ExternalInterface.available){
    ExternalInterface.addCallback("BlitzSetPictureZoom",SetZoom);
    ExternalInterface.addCallback("BlitzShowFPS",BlitzFrameCounter.SetShown);
    ExternalInterface.addCallback("BlitzRenderState",Snapshot);
    ExternalInterface.addCallback("BlitzSetWidescreen",SetWidescreen);
    registered=true;
   }
  }
  public static function SetWidescreen(value:Boolean):Boolean {
   if(!main||!main.stage)return false;
   wideRequested=value;
   if(value)main.addEventListener(Event.ENTER_FRAME,UpdateWidescreen,false,-101,true);
   else main.removeEventListener(Event.ENTER_FRAME,UpdateWidescreen);
   UpdateWidescreen();return true;
  }
  private static function offset(object:DisplayObject,amount:Number):void {
   if(!object)return;
   var saved:Object=offsets[object];
   if(!saved){saved={base:object.x,last:object.x};offsets[object]=saved;}
   // A game-owned animation/reposition replaces the baseline. Never accumulate
   // our own offset, nor overwrite a later game-owned position on restoration.
   if(Math.abs(object.x-saved.last)>0.001)saved.base=object.x;
   if(Math.abs(object.x-(saved.base+amount))>0.051)object.x=saved.base+amount;
   saved.last=object.x;
  }
  private static function screenOffset(screen:class_32,amount:Number):void {
   if(screen&&screen.mWindow&&screen.mWindow.mMovieClip&&
    (screen.mWindow.mMovieClip.parent==wideGame.var_89||screen.mWindow.mMovieClip.parent==wideGame.var_245))offset(screen.mWindow.mMovieClip,amount);
  }
  private static function stretchBackdrop(root:DisplayObjectContainer,half:Number,container:DisplayObjectContainer=null,depth:int=0):void {
   // Only a screen's own full-view matte, never its panel, text or gameplay
   // artwork. Retain the original shape/alpha/handlers and cover both sides.
   if(!container){
    var movie:MovieClip=root as MovieClip;var current:int=movie?movie.currentFrame:0;var previous:Object=matteScans[root];
    if(!root.visible){if(previous)previous.visible=false;return;}
    if(previous&&previous.visible&&previous.frame==current&&previous.children==root.numChildren)return;
    matteScans[root]={visible:true,frame:current,children:root.numChildren};container=root;
   }
   for(var i:int=0;i<container.numChildren;i++){
    var child:DisplayObject=container.getChildAt(i);
    // Composite backgrounds can also contain the trove pedestal or other
    // art. Recurse to a passive drawing leaf; never scale that whole group.
    if(child is DisplayObjectContainer){if(depth<3)stretchBackdrop(root,half,child as DisplayObjectContainer,depth+1);continue;}
    if(!(child is Shape)&&!(child is Bitmap))continue;
    var saved:Object=backdrops[child];
    if(!saved){var bounds:Rectangle=child.getBounds(root);
     if(Math.abs(bounds.width-ORIGINAL_WIDTH)>8||Math.abs(bounds.height-Camera.PLAY_SCREEN_HEIGHT)>8||Math.abs(bounds.y)>8||Math.abs(bounds.x)>8)continue;
     var origin:Point=root.globalToLocal(child.parent.localToGlobal(new Point()));var unit:Point=root.globalToLocal(child.parent.localToGlobal(new Point(1,0)));
     var parentScale:Number=unit.x-origin.x;if(!isFinite(parentScale)||parentScale<=0||Math.abs(unit.y-origin.y)>0.001)continue;
     saved={scale:child.scaleX,width:bounds.width,left:child.getBounds(child).x,inset:bounds.x,parentScale:parentScale};backdrops[child]=saved;
    }
    child.scaleX=saved.scale*(WIDE_WIDTH+4)/saved.width;
    offset(child,(-half-saved.inset-2)/saved.parentScale-saved.left*(child.scaleX-saved.scale));
   }
  }
  private static function layoutScreens(game:Game,half:Number):void {
   var upgradeSpace:Number=0;
   if(game.mUIManager&&game.mUIManager.var_1240)for each(var screen:class_32 in game.mUIManager.var_1240){
    if(!screen||!screen.mWindow||!screen.mWindow.mMovieClip)continue;
    var amount:Number=half;
    // These roots contain mouse/world-positioned content rather than centered
    // panels. Moving their parent misplaces NPC names, loot and tooltips.
    if(screen.var_1173.indexOf("Floater")>=0||screen==game.screenHudTooltip||screen==game.screenNotification)amount=0;
    if(screen==game.var_2306)amount=half; // centered room/dungeon title
    if(screen==game.screenHud||screen==game.screenLinkBar||screen==game.var_1828)amount=0;
    if(screen==game.screenChat||screen==game.screenHudTopRight)amount=half*2;
    screenOffset(screen,amount);
    if(amount==half){
     stretchBackdrop(screen.mWindow.mMovieClip,half);
     var upgrade:DisplayObject=screen.mWindow.mMovieClip.getChildByName("am_GlobalUpgradePanel");
     // Building strips occupy the power section, after the health orb. Their
     // parent menu centers, but the strip keeps this independent HUD anchor.
     offset(upgrade,80-half);
     if(upgrade&&upgrade.visible&&screen.mWindow.mMovieClip.visible)upgradeSpace=80;
    }
   }
   // A mixed asset: party controls live at the upper left, utility buttons at
   // the bottom center. Move the individual party controls within that root.
   screenOffset(game.screenHudTop,0);
   if(game.screenHudTop&&game.screenHudTop.var_2){
    var top:MovieClip=game.screenHudTop.var_2;
    var utilities:Array=["am_Inventory","am_GoHome","am_Sigil","am_Spellbook","am_Social"];
    for(var n:int=0;n<utilities.length;n++)offset(top.getChildByName(utilities[n]),half*2*(n+1)/6);
    for each(var name:String in ["am_GoLeave","am_GoLeaveDungeon"])offset(top.getChildByName(name),half*2/3);
    offset(top.getChildByName("am_GearNotify"),half/3);offset(top.getChildByName("am_SocialNotify"),half*5/3);offset(top.getChildByName("am_SocialCount"),half*5/3);
   }
   screenOffset(game.screenLinkBar,0);screenOffset(game.screenHudTopRight,half*2);
   screenOffset(game.screenHud,0);screenOffset(game.screenChat,half*2);screenOffset(game.screenQuestTracker,upgradeSpace);
   if(game.screenQuestTracker&&game.screenQuestTracker.var_2){
    var quest:MovieClip=game.screenQuestTracker.var_2;
    for each(name in ["am_CacheIcon","am_Selector","am_QuestName","am_QuestDesc","am_ProgressText","am_Progress"])widen(quest.getChildByName(name),half*2-upgradeSpace);
    var contact:DisplayObjectContainer=quest.getChildByName("am_ContactMatte") as DisplayObjectContainer;
    if(contact){for(var k:int=0;k<contact.numChildren;k++)if(contact.getChildAt(k) is Shape)widen(contact.getChildAt(k),half*2-upgradeSpace);offset(contact.getChildByName("am_Tooltip"),(half*2-upgradeSpace)/2);}
    // This cover contains the Map button's lettering. Center it at its native
    // size; resizing the hit matte and text fields above never scales fonts.
    offset(quest.getChildByName("am_InitialMapCover"),(half*2-upgradeSpace)/2);
   }
   if(game.screenFriend&&game.screenFriend.var_26&&game.screenFriend.var_26.parent==game.var_89)offset(game.screenFriend.var_26,half);
   if(game.screenChat&&game.screenChat.var_230)offset(game.screenChat.var_230,half*2);
  }
  private static function restore():void {
   for(var clipped:Object in clips)clipped.scrollRect=clips[clipped].original;
   clips=new Dictionary(true);interiorLimited=false;interiorClip=null;
   for(var object:Object in offsets){if(Math.abs(object.x-offsets[object].last)<0.001)object.x=offsets[object].base;}
   for(var edge:Object in edges)edge.visible=edges[edge];
   for(var backdrop:Object in backdrops)backdrop.scaleX=backdrops[backdrop].scale;
   for(var sized:Object in sizes)if(Math.abs(sized.width-sizes[sized].last)<0.1)sized.width=sizes[sized].width;
   offsets=new Dictionary(true);edges=new Dictionary(true);backdrops=new Dictionary(true);matteScans=new Dictionary(true);sizes=new Dictionary(true);wideGame=null;
   if(frame&&frame.parent)frame.parent.removeChild(frame);frame=null;frameStyle="";
   if(hudFrame&&hudFrame.parent)hudFrame.parent.removeChild(hudFrame);hudFrame=null;
  }
  private static function hideEdge(object:DisplayObject):void {
   if(!object)return;if(edges[object]===undefined)edges[object]=object.visible;object.visible=false;
  }
  private static function UpdateWidescreen(event:Event=null):void {
   if(!main||!main.stage)return;
   // Keep the active game's presentation through an actual scene transfer.
   // A pending second Game must not produce a one-frame original-width flash.
   var game:Game=null;
   if(wideRequested&&main.var_523){
    for each(var candidate:Game in main.var_523)if(candidate.gameState==Game.STATE_PLAY){game=candidate;break;}
    if(!game&&wideGame&&main.var_523.indexOf(wideGame)>=0&&wideGame.gameState==Game.STATE_TRANSFER)game=wideGame;
   }
   if(game!=wideGame)restore();
   var width:Number=game?WIDE_WIDTH:ORIGINAL_WIDTH;
   if(Camera.SCREEN_WIDTH!=width){
    // The original staggered terrain cache covers four half-tile columns.
    // Widescreen needs six (keep the count even for its alternating rows).
    // Tile dimensions/pool budget remain original; change coverage only once.
    class_23.method_1579(ORIGINAL_WIDTH*0.5,Camera.PLAY_SCREEN_HEIGHT,0,game?6:4,100);
    Camera.SCREEN_WIDTH=width;main.overallScale=0;
    main.method_561(main.stage.stageWidth,main.stage.stageHeight);
   }
   if(!game){PositionCounter();return;}
   wideGame=game;
   var half:Number=(WIDE_WIDTH-ORIGINAL_WIDTH)*0.5;
   // Leave both shared roots at their original world-coordinate origin.
   // Anchor independent screens; otherwise world labels, skull/party HUD and
   // menu hit testing all inherit an unrelated half-width translation.
   layoutScreens(game,half);
   LimitInterior(game,half);
   if(game.edgeLayer){hideEdge(game.edgeLayer.getChildByName("am_EdgeFull"));hideEdge(game.edgeLayer.getChildByName("am_EdgeNarrow"));}
   DrawFrame(game);DrawHudFrame(game);PositionCounter();
  }
  private static function LimitInterior(game:Game,half:Number):void {
   // Keep the outer frame, HUD, raster budget and clocks stable. Home's rooms
   // share an outdoor layer; show only a centered original-width scene there
   // rather than changing the entire window layout or fabricating scenery.
   var limited:Boolean=Boolean(game.level&&game.level.var_333&&game.clientEnt&&game.clientEnt.currRoom&&game.clientEnt.currRoom.var_150&&
    getQualifiedClassName(game.clientEnt.currRoom.var_150)!="a_Room_Main");
   if(limited){
    // A scene fade replaces the Bitmap itself. Keep each old canvas clipped
    // through that fade, and restore every saved canvas on leaving this game.
    if(!clips[main.var_147])clips[main.var_147]={original:main.var_147.scrollRect};
    var rect:Rectangle=new Rectangle(half*main.overallScale,0,ORIGINAL_WIDTH*main.overallScale,main.var_147.bitmapData.height);
    if(!main.var_147.scrollRect||!main.var_147.scrollRect.equals(rect))main.var_147.scrollRect=rect;
    interiorClip=rect;
    offset(main.var_147,half*main.overallScale);interiorLimited=true;
   }else if(interiorLimited){
    for(var clipped:Object in clips){clipped.scrollRect=clips[clipped].original;offset(clipped as DisplayObject,0);}
    clips=new Dictionary(true);interiorLimited=false;interiorClip=null;
   }
  }
  private static function DrawHudFrame(game:Game):void {
   if(!game.screenHud||!game.screenHud.mWindow||!game.screenHud.mWindow.mMovieClip||game.screenHud.mWindow.mMovieClip.parent!=game.var_89)return;
   var base:DisplayObject=game.screenHud.mWindow.mMovieClip.getChildByName("am_CacheIcon");
   if(!base||!ApplicationDomain.currentDomain.hasDefinition("a_Hud"))return;
   if(!hudFrame){
    var type:Class=ApplicationDomain.currentDomain.getDefinition("a_Hud") as Class;
    var source:MovieClip=new type() as MovieClip;StopArtwork(source);var original:DisplayObjectContainer=source.getChildByName("am_CacheIcon") as DisplayObjectContainer;
    if(!original)return;var bounds:Rectangle=original.getBounds(original);if(bounds.width<1100||bounds.height>150)return;
    var originX:Number=original.x;var originY:Number=original.y;
    var cuts:Array=[bounds.x,440-originX,680-originX,bounds.right];var delta:Number=WIDE_WIDTH-ORIGINAL_WIDTH;
    hudFrame=new Sprite();hudFrame.name="blitz-wide-hud-frame";hudFrame.mouseEnabled=false;hudFrame.mouseChildren=false;
    // The old utility slots leave transparent gaps when spread apart. Keep
    // that new center space on the original HUD's muted sage backing, beneath
    // its vector trim and every real button; never paint over game content.
    hudFrame.graphics.beginFill(0xa4b39c);
    hudFrame.graphics.drawRect(440,Camera.PLAY_SCREEN_HEIGHT+2,240+delta,108);
    hudFrame.graphics.endFill();
    // Extend only the neutral center of the original decorative HUD plate.
    // Health/power artwork and the chat end keep their original proportions.
    for(var i:int=0;i<3;i++){
     var asset:MovieClip=i==0?source:new type() as MovieClip;StopArtwork(asset);
     var clip:DisplayObjectContainer=asset.getChildByName("am_CacheIcon") as DisplayObjectContainer;clip.x=0;clip.y=0;
     var slice:Sprite=new Sprite();slice.mouseEnabled=false;slice.mouseChildren=false;slice.addChild(clip);
     slice.scrollRect=new Rectangle(cuts[i],bounds.y,cuts[i+1]-cuts[i],bounds.height);
     slice.x=originX+cuts[i]+(i==2?delta:0);slice.y=originY+bounds.y;
     if(i==1)slice.scaleX=(cuts[i+1]-cuts[i]+delta)/(cuts[i+1]-cuts[i]);hudFrame.addChild(slice);
    }
   }
   hideEdge(base);if(hudFrame.parent!=game.var_89)game.var_89.addChildAt(hudFrame,0);
  }
  private static function DrawFrame(game:Game):void {
   if(!game.edgeLayer||game.edgeLayer.parent!=main)return;
   if(!frame){
    if(!ApplicationDomain.currentDomain.hasDefinition("a_EdgeHud"))return;
    var type:Class=ApplicationDomain.currentDomain.getDefinition("a_EdgeHud") as Class;
    var original:MovieClip=new type() as MovieClip;StopArtwork(original);
    var bounds:Rectangle=original.getBounds(original);
    if(bounds.width<ORIGINAL_WIDTH||bounds.height<Camera.PLAY_SCREEN_HEIGHT)return;
    frame=new Sprite();frame.name="blitz-wide-frame";frame.mouseEnabled=false;frame.mouseChildren=false;frame.tabEnabled=false;
    // Use the loaded game's own vector artwork. Preserve both corner/side
    // sections at their original size; extend only the horizontal middle.
    // These are decorative asset instances, never copies of game frames.
    var cuts:Array=[bounds.x,192,ORIGINAL_WIDTH-192,bounds.right];
    var delta:Number=WIDE_WIDTH-ORIGINAL_WIDTH;
    for(var i:int=0;i<3;i++){
     var clip:MovieClip=i==0?original:new type() as MovieClip;StopArtwork(clip);
     var slice:Sprite=new Sprite();slice.mouseEnabled=false;slice.mouseChildren=false;
     slice.addChild(clip);slice.scrollRect=new Rectangle(cuts[i],bounds.y,cuts[i+1]-cuts[i],bounds.height);
     slice.x=cuts[i]+(i==2?delta:0);slice.y=bounds.y;
     if(i==1)slice.scaleX=(cuts[i+1]-cuts[i]+delta)/(cuts[i+1]-cuts[i]);
     frame.addChild(slice);
    }
    frameStyle="original-vector-three-slice";
   }
   if(frame.parent!=main)main.addChildAt(frame,main.getChildIndex(game.edgeLayer));
   if(frame.scaleX!=main.overallScale)frame.scaleX=main.overallScale;
   if(frame.scaleY!=main.overallScale)frame.scaleY=main.overallScale;
  }
  private static function StopArtwork(value:DisplayObject):void {
   // Decorative clones have no game UI controller. Freeze their nested
   // timelines too, just as the original game's static cache captures them.
   // Stopping only the root leaves child timelines running in the live stage.
   var movie:MovieClip=value as MovieClip;if(movie)movie.stop();
   var container:DisplayObjectContainer=value as DisplayObjectContainer;
   if(container)for(var i:int=0;i<container.numChildren;i++)StopArtwork(container.getChildAt(i));
  }
  private static function ArtworkPlaying(value:DisplayObject):Boolean {
   var movie:MovieClip=value as MovieClip;if(movie&&movie.isPlaying)return true;
   var container:DisplayObjectContainer=value as DisplayObjectContainer;
   if(container)for(var i:int=0;i<container.numChildren;i++)if(ArtworkPlaying(container.getChildAt(i)))return true;
   return false;
  }
  public static function SetZoom(value:Number,magnification:Number=1):Boolean {
   if(!isFinite(value)||value<0.5||value>3||!isFinite(magnification)||magnification<0.1||magnification>16||!main||!main.stage)return false;
   zoom=value;main.method_561(main.stage.stageWidth,main.stage.stageHeight);
   BlitzFrameCounter.SetMagnification(magnification);if(wideRequested)UpdateWidescreen();PositionCounter();return true;
  }
  private static function boundedZoom():Number {
   if(!main||!main.stage)return 1;
   return Math.min(zoom,4096/Math.max(1,main.stage.stageWidth),2730/Math.max(1,main.stage.stageHeight));
  }
  public static function Width(value:int):int {return Math.max(1,int(value*boundedZoom()));}
  public static function Height(value:int):int {return Math.max(1,int(value*boundedZoom()));}
  private static function PositionCounter():void {
   if(!main||!main.stage)return;
   // Include the original frame's border, not only the inner game bitmap.
   var width:Number=(Camera.SCREEN_WIDTH+Main.var_1876*2)*main.overallScale;
   var left:Number=(main.stage.stageWidth-width)*0.5;
   BlitzFrameCounter.Layout(left,left+width);
  }
  public static function Snapshot():Object {
   if(!main||!main.stage)return null;
   return {stageWidth:main.stage.stageWidth,stageHeight:main.stage.stageHeight,zoom:zoom,
    nativeScale:main.overallScale,bitmapWidth:main.var_147.bitmapData?main.var_147.bitmapData.width:0,
    bitmapHeight:main.var_147.bitmapData?main.var_147.bitmapData.height:0,quality:main.stage.quality,
    animationRate:main.stage.frameRate,frameCounter:BlitzFrameCounter.Snapshot(),
    widescreen:{requested:wideRequested,active:wideGame!=null,logicalWidth:Camera.SCREEN_WIDTH,
     logicalHeight:Camera.SCREEN_HEIGHT,uiOffset:wideGame&&wideGame.var_89?wideGame.var_89.x:0,
     frameAttached:Boolean(frame&&frame.parent==main),frameStyle:frameStyle,
     frameInteractive:frame?frame.mouseEnabled||frame.mouseChildren:false,decorationAnimating:ArtworkPlaying(frame)||ArtworkPlaying(hudFrame),interiorLimited:interiorLimited,
     interiorSceneWidth:interiorClip?interiorClip.width/main.overallScale:null}};
  }
 }
}
