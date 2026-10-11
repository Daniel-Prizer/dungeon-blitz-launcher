package {
 import flash.external.ExternalInterface;
 import flash.display.DisplayObject;
 import flash.display.DisplayObjectContainer;
 import flash.display.Sprite;
 import flash.display.MovieClip;
 import flash.display.Shape;
 import flash.display.Bitmap;
 import flash.display.BitmapData;
 import flash.display.LoaderInfo;
 import flash.display.StageQuality;
 import flash.events.Event;
 import flash.geom.Rectangle;
 import flash.geom.Point;
 import flash.geom.Matrix;
 import flash.utils.getQualifiedClassName;
 import flash.system.ApplicationDomain;
 import flash.utils.Dictionary;
 import flash.utils.ByteArray;
 import flash.text.TextField;
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
  private static var buttonTransforms:Dictionary=new Dictionary(true);
  private static var questFrames:Dictionary=new Dictionary(true);
  private static var companionFrames:Dictionary=new Dictionary(true);
  private static var upgradePowers:Dictionary=new Dictionary(true);
  private static var buildingInspection:Boolean=false;
  private static var hudStraightBands:Array=[];
  private static var directionPlaceholders:Dictionary=new Dictionary(true);
  private static var lockedSigils:Dictionary=new Dictionary(true);
  private static var skyTransforms:Dictionary=new Dictionary(true);
  private static var roomArt:Object={};
  private static var roomWings:Sprite;
  private static var roomWingKey:String="";
  private static var hasPlayed:Boolean=false;
  private static var companionArt:BitmapData;
  private static const COMPANION_PIXELS:String="__COMPANION_PIXELS__";
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
   if(!value)hasPlayed=false;
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
   // The native power/XP recess ends as one unit. The companion ornament is
   // separate, with clear space on both sides rather than crossing its bevel.
   var questSpace:Number=154.5;
   var questRightInset:Number=10;
   var directionCenter:Number=0;
   var upgradeVisible:Boolean=false;
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
     // Inspection replaces the complete combat section from the left edge.
     // The menu itself stays centered; its native strip has a separate anchor.
     if(upgrade){
      var baseX:Number=offsets[upgrade]?offsets[upgrade].base:upgrade.x;
      offset(upgrade,-screen.mWindow.mMovieClip.x-baseX);
      ReplaceUpgradeBacking(upgrade as DisplayObjectContainer);
      if(upgrade.visible&&screen.mWindow.mMovieClip.visible){upgradeVisible=true;questSpace=Math.max(questSpace,10+upgrade.width-439.25);}
     }
    }
   }
   // A mixed asset: party controls live at the upper left, utility buttons at
   // the bottom center. Move the individual party controls within that root.
   screenOffset(game.screenHudTop,0);
   if(game.screenHudTop&&game.screenHudTop.var_2){
    var top:MovieClip=game.screenHudTop.var_2;
    var utilities:Array=["am_Inventory","am_GoHome","am_Sigil","am_Spellbook","am_Social"];
    var toolbarLeft:Number=439.25+questSpace;
    var toolbarWidth:Number=680+half*2-toolbarLeft-questRightInset;
    // Talent stones retain their dedicated slot when unlocked. Home/Leave
    // share one position, including their original cooldown and input handler.
    // Equal visible gaps, rather than equal centers: the circular direction
    // control is narrower than the square buttons. Ignore hidden tooltips.
    var arrowWidth:Number=31.05;var rowInset:Number=8;
    var widths:Array=[];var faceCenters:Array=[];var rowWidth:Number=arrowWidth;
    for(var utilityIndex:int=0;utilityIndex<utilities.length;utilityIndex++){
     var utility:DisplayObject=top.getChildByName(utilities[utilityIndex]);
     var face:DisplayObject=utility is DisplayObjectContainer?DisplayObjectContainer(utility).getChildByName("am_CacheIcon"):null;
     var originalScale:Number=utility?(buttonTransforms[utility]?buttonTransforms[utility].x:utility.scaleX):0;
     var faceBounds:Rectangle=face?face.getBounds(utility):null;
     var faceWidth:Number=faceBounds?faceBounds.width*originalScale*1.05:35.4;
     faceCenters.push(faceBounds?faceBounds.x+faceBounds.width*0.5:24);
     widths.push(faceWidth);rowWidth+=faceWidth;
    }
    var rowGap:Number=Math.max(0,(toolbarWidth-2*rowInset-rowWidth)/utilities.length);
    directionCenter=toolbarLeft+rowInset+arrowWidth*0.5;
    var cursor:Number=toolbarLeft+rowInset+arrowWidth+rowGap;
    for(var n:int=0;n<utilities.length;n++){
     var center:Number=cursor+widths[n]*0.5;
     placeUtility(top.getChildByName(utilities[n]),center,747.5,1.05,faceCenters[n]);
     if(utilities[n]=="am_GoHome")for each(var name:String in ["am_GoLeave","am_GoLeaveDungeon"])placeUtility(top.getChildByName(name),center,747.5,1.05,faceCenters[n]);
     cursor+=widths[n]+rowGap;
    }
    var sigil:DisplayObject=top.getChildByName("am_Sigil");
    if(sigil)DrawLockedSigil(top,sigil);
    var inventory:DisplayObject=top.getChildByName("am_Inventory");var social:DisplayObject=top.getChildByName("am_Social");
    var inventoryDelta:Number=inventory&&offsets[inventory]?inventory.x-offsets[inventory].base:0;
    offset(top.getChildByName("am_GearNotify"),inventoryDelta);
    if(social){
     PlaceBadge(top.getChildByName("am_SocialCount"),social.x+18,social.y+23,0.7);
     PlaceBadge(top.getChildByName("am_SocialNotify"),social.x+32,social.y-3);
    }
   }
   if(game.screenHud&&game.screenHud.var_2){
    buildingInspection=upgradeVisible;
    // Inspection replaces the combat panel. Hide its values, XP hit area
    // and anonymous XP dividers too; a large overlay alone leaves fragments.
    var hud:MovieClip=game.screenHud.var_2;
    for(var hudIndex:int=0;hudIndex<hud.numChildren;hudIndex++){
     var combat:DisplayObject=hud.getChildAt(hudIndex);
     if(["am_PowerButtons","am_HPBar","am_HPText","am_TempHPText","am_LevelText","am_ManaBar","am_ClassManaBar","am_ManaText","am_ClassManaText","am_XPBar","am_XPContact","am_XPAdd","am_LevelXP"].indexOf(combat.name)<0&&
        !(combat.x>=0&&combat.x<=440&&combat.y>=757&&combat.y<=786&&combat.width<40&&combat.height<34))continue;
     if(upgradeVisible){if(upgradePowers[combat]===undefined)upgradePowers[combat]=combat.visible;combat.visible=false;}
     else if(upgradePowers[combat]!==undefined){if(!combat.visible)combat.visible=upgradePowers[combat];delete upgradePowers[combat];}
    }
    var powers:DisplayObjectContainer=game.screenHud.var_2.getChildByName("am_PowerButtons") as DisplayObjectContainer;
    if(powers){
     // The original strip covered the original compact powers. Relocated
     // companion buttons can otherwise leave a clickable fragment beyond its
     // edge. Hide the power row as a unit while the building strip owns it.
     if(upgradeVisible){if(upgradePowers[powers]===undefined)upgradePowers[powers]=powers.visible;powers.visible=false;}
     else if(upgradePowers[powers]!==undefined){if(!powers.visible)powers.visible=upgradePowers[powers];delete upgradePowers[powers];}
     var changed:Boolean=!buttonTransforms[powers.getChildByName("am_Key7")];
     placeUtility(powers.getChildByName("am_Key7"),482-powers.x,705.05-powers.y,1.66);
     placeUtility(powers.getChildByName("am_Key8"),542-powers.x,705.05-powers.y,1.66);
     // Rebuild native icon rasters once at the new button scale, using the
     // original rendering-only resize path. Preserve power/cooldown handlers.
     if(changed&&game.clientEnt&&game.screenHud.mPowerButtons)game.screenHud.method_1505();
     DrawCompanionFrame(game.screenHud.var_2);
     if(companionFrames[game.screenHud.var_2])companionFrames[game.screenHud.var_2].visible=!upgradeVisible;
    }
    var xp:DisplayObject=game.screenHud.var_2.getChildByName("am_XPBar");
    if(xp){if(!buttonTransforms[xp])buttonTransforms[xp]={x:xp.scaleX,y:xp.scaleY,top:xp.y,width:xp.width};xp.scaleX=buttonTransforms[xp].x*(578.6-xp.x)/buttonTransforms[xp].width;}
    var xpContact:DisplayObjectContainer=game.screenHud.var_2.getChildByName("am_XPContact") as DisplayObjectContainer;
    if(xpContact)for(var contactIndex:int=0;contactIndex<xpContact.numChildren;contactIndex++)if(xpContact.getChildAt(contactIndex) is Shape)widen(xpContact.getChildAt(contactIndex),146.1);
   }
   screenOffset(game.screenLinkBar,0);screenOffset(game.screenHudTopRight,half*2);
   // The seasonal news asset mixes the studio headline at the left with its
   // Hallows' Eve badge/keys at the right. Keep the group/tooltip/left icon
   // native; translate only the three reviewed right-hand event controls.
   if(game.var_1828&&game.var_1828.var_2){
    var eventGroup:DisplayObjectContainer=game.var_1828.var_2.getChildByName("am_TopLeftGroup") as DisplayObjectContainer;
    if(eventGroup&&eventGroup.getChildByName("am_HallowsEveBadge")&&eventGroup.getChildByName("am_HallowsEveKeys")&&eventGroup.getChildByName("am_Title") is TextField){
     for each(var eventName:String in ["am_HallowsEveBadge","am_HallowsEveKeys","am_Title"])offset(eventGroup.getChildByName(eventName),half*2);
    }
   }
   screenOffset(game.screenHud,0);screenOffset(game.screenChat,half*2);screenOffset(game.screenQuestTracker,questSpace);
   if(game.screenQuestTracker&&game.screenQuestTracker.var_2){
    var quest:MovieClip=game.screenQuestTracker.var_2;
    // Never scale the game's cache container: its cache rebuilder measures
    // transformed width and would bake our expansion into it repeatedly.
    var questGrowth:Number=half*2-questSpace-questRightInset;
    DrawQuestFrame(quest,240+questGrowth);
    var arrow:DisplayObject=quest.getChildByName("am_ArrowWrapper");
    if(arrow){
     if(!buttonTransforms[arrow])buttonTransforms[arrow]={x:arrow.scaleX,y:arrow.scaleY,top:arrow.y};
     arrow.scaleX=buttonTransforms[arrow].x*1.15;arrow.scaleY=buttonTransforms[arrow].y*1.15;arrow.y=764.5;
     var arrowBase:Number=offsets[arrow]?offsets[arrow].base:arrow.x;
     offset(arrow,(directionCenter?directionCenter-questSpace:439.25+(240+questGrowth)/12)-arrowBase);
     DrawDirectionPlaceholder(quest,arrow);
    }
    for each(name in ["am_Selector","am_QuestName","am_QuestDesc","am_ProgressText","am_Progress"])widen(quest.getChildByName(name),questGrowth);
    var contact:DisplayObjectContainer=quest.getChildByName("am_ContactMatte") as DisplayObjectContainer;
    if(contact){for(var k:int=0;k<contact.numChildren;k++)if(contact.getChildAt(k) is Shape)widen(contact.getChildAt(k),questGrowth);offset(contact.getChildByName("am_Tooltip"),questGrowth/2);}
    // This cover contains the Map button's lettering. Center it at its native
    // size; resizing the hit matte and text fields above never scales fonts.
    offset(quest.getChildByName("am_InitialMapCover"),questGrowth/2);
   }
   if(game.screenFriend&&game.screenFriend.var_26&&game.screenFriend.var_26.visible&&game.screenFriend.var_26.parent==game.var_89){
    var friend:MovieClip=game.screenFriend.var_26;var friendBounds:Rectangle=friend.getBounds(friend);
    var friendBase:Number=offsets[friend]?offsets[friend].base:friend.x;
    offset(friend,(WIDE_WIDTH-friendBounds.width*friend.scaleX)/2-friendBounds.x*friend.scaleX-friendBase);
   }
   if(game.screenChat&&game.screenChat.var_230&&game.screenChat.var_2){
    // Chat's own controller already includes the shifted root in this matte's
    // x coordinate. Position from the actual text field, never add it twice.
    var history:DisplayObject=game.screenChat.var_2.getChildByName("am_ChatHistory");
    if(history){game.screenChat.var_230.x=game.screenChat.var_2.x+history.x;game.screenChat.var_230.width=history.width;}
   }
  }
  private static function restore():void {
   for(var object:Object in offsets){if(Math.abs(object.x-offsets[object].last)<0.001)object.x=offsets[object].base;}
   for(var edge:Object in edges)edge.visible=edges[edge];
   for(var backdrop:Object in backdrops)backdrop.scaleX=backdrops[backdrop].scale;
   for(var sized:Object in sizes)if(Math.abs(sized.width-sizes[sized].last)<0.1)sized.width=sizes[sized].width;
   for(var button:Object in buttonTransforms){button.scaleX=buttonTransforms[button].x;button.scaleY=buttonTransforms[button].y;button.y=buttonTransforms[button].top;}
   for(var powers:Object in upgradePowers)if(!powers.visible)powers.visible=upgradePowers[powers];upgradePowers=new Dictionary(true);
   buildingInspection=false;
   for(var sky:Object in skyTransforms){var skySaved:Object=skyTransforms[sky];if(skySaved.image.parent)skySaved.image.parent.removeChild(skySaved.image);skySaved.image.bitmapData.dispose();}
   for(var roomName:String in roomArt)roomArt[roomName].pixels.dispose();roomArt={};
   if(roomWings&&roomWings.parent)roomWings.parent.removeChild(roomWings);roomWings=null;roomWingKey="";
   for(var quest:Object in questFrames){var decoration:Sprite=questFrames[quest].frame;if(decoration.parent)decoration.parent.removeChild(decoration);}
   for(var companion:Object in companionFrames){decoration=companionFrames[companion];if(decoration.parent)decoration.parent.removeChild(decoration);}companionFrames=new Dictionary(true);
   for(var locked:Object in lockedSigils){decoration=lockedSigils[locked];if(decoration.parent)decoration.parent.removeChild(decoration);}lockedSigils=new Dictionary(true);
   for(var placeholder:Object in directionPlaceholders){decoration=directionPlaceholders[placeholder];if(decoration.parent)decoration.parent.removeChild(decoration);}directionPlaceholders=new Dictionary(true);
   buttonTransforms=new Dictionary(true);questFrames=new Dictionary(true);skyTransforms=new Dictionary(true);
   offsets=new Dictionary(true);edges=new Dictionary(true);backdrops=new Dictionary(true);matteScans=new Dictionary(true);sizes=new Dictionary(true);wideGame=null;
   if(frame&&frame.parent)frame.parent.removeChild(frame);frame=null;frameStyle="";
   if(hudFrame&&hudFrame.parent)hudFrame.parent.removeChild(hudFrame);hudFrame=null;hudStraightBands=[];
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
    for each(var candidate:Game in main.var_523)if(candidate.gameState==Game.STATE_PLAY){game=candidate;hasPlayed=true;break;}
    // Live transfers also pass through Login and None; the UI fixture did not.
    // Once play has begun keep the same viewport through every travel phase.
    if(!game&&hasPlayed){if(wideGame&&main.var_523.indexOf(wideGame)>=0)game=wideGame;else if(main.var_523.length)game=main.var_523[main.var_523.length-1];}
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
   if(game.edgeLayer){hideEdge(game.edgeLayer.getChildByName("am_EdgeFull"));hideEdge(game.edgeLayer.getChildByName("am_EdgeNarrow"));}
   DrawFrame(game);DrawHudFrame(game);PositionCounter();
  }
  private static function placeUtility(button:DisplayObject,center:Number,top:Number=747.5,factor:Number=1.05,faceCenter:Number=24):void {
   if(!button)return;
   if(!buttonTransforms[button])buttonTransforms[button]={x:button.scaleX,y:button.scaleY,top:button.y};
   button.scaleX=buttonTransforms[button].x*factor;button.scaleY=buttonTransforms[button].y*factor;
   button.y=top;
   var base:Number=offsets[button]?offsets[button].base:button.x;
   offset(button,center-faceCenter*button.scaleX-base);
  }
  private static function PlaceBadge(badge:DisplayObject,x:Number,y:Number,factor:Number=1):void {
   if(!badge)return;if(!buttonTransforms[badge])buttonTransforms[badge]={x:badge.scaleX,y:badge.scaleY,top:badge.y};
   badge.scaleX=buttonTransforms[badge].x*factor;badge.scaleY=buttonTransforms[badge].y*factor;
   var base:Number=offsets[badge]?offsets[badge].base:badge.x;offset(badge,x-base);badge.y=y;
  }
  private static function DrawCompanionFrame(hud:MovieClip):void {
   if(companionFrames[hud])return;
   var decoration:Sprite=new Sprite();decoration.name="blitz-companion-frame";decoration.mouseEnabled=false;decoration.mouseChildren=false;
   // Trusted, build-time artwork. Decode once into a fixed ARGB surface. No
   // Loader, external file access or executable image import is involved.
   if(!companionArt){
    var alphabet:String="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    var bytes:ByteArray=new ByteArray();var bits:uint=0;var count:int=0;
    for(var i:int=0;i<COMPANION_PIXELS.length;i++){
     var value:int=alphabet.indexOf(COMPANION_PIXELS.charAt(i));if(value<0)break;
     bits=(bits<<6)|value;count+=6;if(count>=8){count-=8;bytes.writeByte((bits>>count)&255);}
    }
    bytes.uncompress();if(bytes.length!=576*384*4)return;
    bytes.position=0;companionArt=new BitmapData(576,384,true,0);companionArt.setPixels(companionArt.rect,bytes);
   }
   // A slim shaded underside softens the ornament's flat edge. Keep it a
   // three-pixel bevel, distinct from the separate XP channel below.
   var lip:Shape=new Shape();lip.name="blitz-companion-lower-lip";
   lip.graphics.lineStyle(0.7,0x29251b);lip.graphics.beginFill(0x665326);
   lip.graphics.moveTo(447,762.5);lip.graphics.lineTo(577,762.5);lip.graphics.lineTo(575,765.5);lip.graphics.lineTo(449,765.5);lip.graphics.lineTo(447,762.5);lip.graphics.endFill();
   lip.graphics.lineStyle(0.7,0xaf9443);lip.graphics.moveTo(450,764.5);lip.graphics.lineTo(574,764.5);decoration.addChild(lip);
   var art:Bitmap=new Bitmap(companionArt,"auto",true);art.x=441;art.y=676;art.width=142;art.height=89;decoration.addChild(art);
   hud.addChildAt(decoration,0);companionFrames[hud]=decoration;
  }
  private static function DrawLockedSigil(top:MovieClip,sigil:DisplayObject):void {
   var drawing:Sprite=lockedSigils[top];
   if(!drawing&&ApplicationDomain.currentDomain.hasDefinition("a_HudTop")){
    var type:Class=ApplicationDomain.currentDomain.getDefinition("a_HudTop") as Class;var asset:MovieClip=new type() as MovieClip;StopArtwork(asset);
    var button:DisplayObjectContainer=asset.getChildByName("am_Sigil") as DisplayObjectContainer;
    if(!button)return;var tooltip:DisplayObject=button.getChildByName("am_Tooltip");if(tooltip)tooltip.visible=false;
    button.x=button.y=0;button.scaleX=button.scaleY=1;drawing=new Sprite();drawing.name="blitz-locked-talent-stones";drawing.mouseEnabled=false;drawing.mouseChildren=false;drawing.alpha=0.35;drawing.addChild(button);top.addChildAt(drawing,0);lockedSigils[top]=drawing;
   }
   if(drawing){drawing.x=sigil.x;drawing.y=sigil.y;drawing.scaleX=sigil.scaleX;drawing.scaleY=sigil.scaleY;drawing.visible=!sigil.visible;}
  }
  private static function DrawDirectionPlaceholder(quest:MovieClip,arrow:DisplayObject):void {
   var drawing:Sprite=directionPlaceholders[quest];
   if(!drawing){drawing=new Sprite();drawing.name="blitz-direction-placeholder";drawing.mouseEnabled=false;drawing.mouseChildren=false;drawing.tabEnabled=false;
    drawing.graphics.lineStyle(2,0x879777,0.65);drawing.graphics.beginFill(0x334735,0.75);drawing.graphics.drawCircle(0,0,14.525);drawing.graphics.endFill();
    drawing.graphics.lineStyle(3,0x86a16c,0.65);drawing.graphics.moveTo(-5,0);drawing.graphics.lineTo(5,0);quest.addChild(drawing);directionPlaceholders[quest]=drawing;
   }
   drawing.x=arrow.x;drawing.y=arrow.y;
   var actual:DisplayObjectContainer=arrow as DisplayObjectContainer;var pointer:DisplayObject=actual?actual.getChildByName("am_Arrow"):null;
   drawing.visible=!arrow.visible||Boolean(pointer&&!pointer.visible);
  }
  private static function DrawQuestFrame(quest:MovieClip,width:Number):void {
   var base:DisplayObject=quest.getChildByName("am_CacheIcon");if(!base||!ApplicationDomain.currentDomain.hasDefinition("a_QuestTracker"))return;
   var cuts:Array=[0,12,228,240];var rows:Array=[0,8,59,67];
   var saved:Object=questFrames[quest];
   if(!saved){
    var type:Class=ApplicationDomain.currentDomain.getDefinition("a_QuestTracker") as Class;
    var plate:Sprite=new Sprite();plate.name="blitz-wide-quest-frame";plate.mouseEnabled=false;plate.mouseChildren=false;
    for(var row:int=0;row<3;row++)for(var i:int=0;i<3;i++){
     var asset:MovieClip=new type() as MovieClip;StopArtwork(asset);
     var drawing:DisplayObject=asset.getChildByName("am_CacheIcon");drawing.x=0;drawing.y=0;
     var slice:Sprite=new Sprite();slice.addChild(drawing);slice.scrollRect=new Rectangle(cuts[i],rows[row],cuts[i+1]-cuts[i],rows[row+1]-rows[row]);plate.addChild(slice);
    }
    saved={frame:plate};questFrames[quest]=saved;
   }
   // One native nine-slice box beneath quest, direction and all utility
   // controls. Fixed-size corners remain intact; only neutral center spans.
   var columns:Array=[0,12,width-12,width];var heights:Array=[0,8,95,103];
   for(row=0;row<3;row++)for(i=0;i<3;i++){
    slice=saved.frame.getChildAt(row*3+i) as Sprite;slice.x=columns[i];slice.y=heights[row];slice.scaleX=(columns[i+1]-columns[i])/(cuts[i+1]-cuts[i]);slice.scaleY=(heights[row+1]-heights[row])/(rows[row+1]-rows[row]);
   }
   if(saved.frame.parent!=quest.parent&&quest.parent)quest.parent.addChildAt(saved.frame,0);
   saved.frame.x=quest.x+base.x;saved.frame.y=quest.y+base.y;saved.frame.visible=quest.visible;
   hideEdge(base);
  }
  public static function PrepareFrame(game:Game):void {
   if(!main||!wideRequested)return;
   UpdateWidescreen();
   if(game.gameState==Game.STATE_PLAY&&(!(game.screenMap.mbVisible||game.screenForge.mbVisible)||!game.var_1778)&&main.var_147.bitmapData){
    // Transparent terrain/parallax edges must never leave scenery from an
    // earlier camera position in the persistent final canvas.
    main.var_147.bitmapData.fillRect(main.var_147.bitmapData.rect,4737365);
    ExtendSky(game);ExtendInterior(game);
   }
  }
  private static function ExtendSky(game:Game):void {
   // Only the reviewed passive, backmost sky/cloud planes. Terrain, houses,
   // entities and camera positions retain their original geometry. The game
   // recomputes cache positions each frame; derive our base from that source
   // rather than accumulating an adjustment on the cached Bitmap.
   if(!game.var_77||!game.var_77.var_849)return;
   for each(var group:class_162 in game.var_77.var_849)for each(var part:class_160 in group.var_1244){
    if(part.mRateX>0.02||part.var_2640!=0||!part.var_954||!part.var_954.dObj||!part.var_954.var_716)continue;
    var sky:Bitmap=part.var_954.var_51 as Bitmap;
    if(!sky||!sky.parent||!sky.bitmapData||sky.scaleY<=0)continue;
    var width:Number=sky.bitmapData.width*sky.scaleY;
    if(width<ORIGINAL_WIDTH)continue;
    var base:Number=Math.floor((part.var_954.dObj.x+part.var_2260)*main.overallScale)/main.overallScale;
    var saved:Object=skyTransforms[sky];var factor:Number=WIDE_WIDTH/ORIGINAL_WIDTH;
    if(!saved||saved.source!=sky.bitmapData){
     if(saved){if(saved.image.parent)saved.image.parent.removeChild(saved.image);saved.image.bitmapData.dispose();}
     var matrix:Matrix=part.var_954.var_716.clone();matrix.scale(factor,1);
     var rasterWidth:int=Math.ceil(sky.bitmapData.width*factor);
     if(rasterWidth>8191||rasterWidth*sky.bitmapData.height>8388608)continue;
     var pixels:BitmapData=new BitmapData(rasterWidth,sky.bitmapData.height,true,0);
     // Re-rasterize the original vector at the final resolution once. Never
     // enlarge a cached low-resolution image, nor capture a live game frame.
     pixels.drawWithQuality(part.var_954.dObj,matrix,part.var_954.dObj.transform.colorTransform,null,null,false,StageQuality.HIGH);
     var image:Bitmap=new Bitmap(pixels);image.scaleX=sky.scaleY;image.scaleY=sky.scaleY;
     saved={source:sky.bitmapData,image:image};skyTransforms[sky]=saved;
    }
    saved.image.x=base-width*(factor-1)/2;saved.image.y=sky.y;
    if(saved.image.parent!=sky.parent)sky.parent.addChildAt(saved.image,sky.parent.getChildIndex(sky));
    hideEdge(sky);
   }
  }
  private static function ExtendInterior(game:Game):void {
   // Decorative wall/floor wings only, behind the normal world layers. Keep
   // every player, door and input coordinate visible at its original scale.
   if(roomWings)roomWings.visible=false;
   if(!game.level||!game.level.var_333||!game.clientEnt||!game.clientEnt.currRoom)return;
   var room:MovieClip=game.clientEnt.currRoom.var_150;
   if(!room)return;var name:String=getQualifiedClassName(room);
   if(["a_Room_GreatHall","a_Room_Library"].indexOf(name)<0)return;
   var key:String=name+":"+main.overallScale;var saved:Object=roomArt[key];
   if(!saved){
    // Retain only the active room/scale raster; repeated zooms must not grow
    // an unbounded collection of artwork backing surfaces.
    if(roomWings)while(roomWings.numChildren)roomWings.removeChildAt(0);
    for(var previous:String in roomArt)roomArt[previous].pixels.dispose();
    roomArt={};roomWingKey="";
   // Live level symbols belong to their asset loader's child domain. The
   // UI/current domain is not their owner, even when offline fixtures put
   // every definition there. Resolve through the same registry as Level.
   var info:LoaderInfo=ResourceManager.const_40[game.level.levelFileName];
   var domain:ApplicationDomain=info?info.applicationDomain:ApplicationDomain.currentDomain;
   if(!domain.hasDefinition(name))return;
   var type:Class=domain.getDefinition(name) as Class;
   if(!type)return;
    var source:MovieClip=new type() as MovieClip;StopArtwork(source);
    // The anonymous, largest passive art clip contains the native walls and
    // floor. Named collision volumes, directors, NPCs and doors are excluded.
    var background:DisplayObject=null;var area:Number=0;
    for(var i:int=0;i<source.numChildren;i++){
     var child:DisplayObject=source.getChildAt(i);var cname:String=getQualifiedClassName(child);
     if(!(child is MovieClip)||cname!="flash.display::MovieClip"||child.name.indexOf("instance")!=0)continue;
     var candidate:Rectangle=child.getBounds(source);var size:Number=candidate.width*candidate.height;
     if(size>area){background=child;area=size;}
    }
    if(!background)return;var bounds:Rectangle=background.getBounds(source);
    if(bounds.width<600||bounds.height<400||bounds.height>1600)return;
    var scale:Number=main.overallScale;var rw:int=Math.ceil(64*scale);var rh:int=Math.ceil(bounds.height*scale);
    if(rw<1||rh<1||rh>8191||rw*rh>2097152)return;
    var pixels:BitmapData=new BitmapData(rw,rh,true,0);
    var matrix:Matrix=background.transform.matrix.clone();matrix.translate(-bounds.x-150,-bounds.y);matrix.scale(scale,scale);
    pixels.drawWithQuality(background,matrix,background.transform.colorTransform,null,null,false,StageQuality.HIGH);
    saved={bounds:bounds,pixels:pixels};roomArt[key]=saved;
   }
   if(!roomWings){roomWings=new Sprite();roomWings.name="blitz-native-room-wings";roomWings.mouseEnabled=false;roomWings.mouseChildren=false;}
   if(!game.var_1040||!game.levelLayer||game.levelLayer.parent!=game.var_1040)return;
   if(roomWings.parent!=game.var_1040)game.var_1040.addChildAt(roomWings,game.var_1040.getChildIndex(game.levelLayer));
   if(roomWingKey!=key){
    while(roomWings.numChildren)roomWings.removeChildAt(0);
    for(var n:int=0;n<2;n++){
     var lane:Sprite=new Sprite();
     for(var x:Number=0;x<WIDE_WIDTH;x+=64){var tile:Bitmap=new Bitmap(saved.pixels);tile.scaleX=tile.scaleY=1/main.overallScale;tile.x=x;lane.addChild(tile);}
     roomWings.addChild(lane);
    }
    roomWingKey=key;
   }
   var left:Number=room.x+saved.bounds.x+game.levelLayer.x;
   var right:Number=left+saved.bounds.width;
   var top:Number=room.y+saved.bounds.y+game.levelLayer.y;
   // Native background bounds include transparent edge geometry. Underlap
   // half a tile beneath the untouched room so those edges never expose the
   // outdoor parallax. This is passive backing, below terrain and all actors.
   var ranges:Array=[new Rectangle(0,0,Math.min(WIDE_WIDTH,Math.max(0,left+32)),Camera.PLAY_SCREEN_HEIGHT),new Rectangle(Math.min(WIDE_WIDTH,Math.max(0,right-32)),0,Math.max(0,WIDE_WIDTH-right+32),Camera.PLAY_SCREEN_HEIGHT)];
   for(n=0;n<2;n++){
    var range:Rectangle=ranges[n];lane=roomWings.getChildAt(n) as Sprite;lane.visible=range.width>0;
    if(!lane.scrollRect||!lane.scrollRect.equals(range))lane.scrollRect=range;lane.x=range.x;
    for(i=0;i<lane.numChildren;i++)lane.getChildAt(i).y=top;
   }
   roomWings.visible=true;
  }
  private static function ReplaceUpgradeBacking(panel:DisplayObjectContainer):void {
   if(!panel||!panel.numChildren)return;
   // The shared native HUD plate owns the outer border in inspection too.
   // Replace only the reviewed passive backing, leaving every inner control.
   var art:DisplayObject=panel.getChildAt(0);var bounds:Rectangle=art.getBounds(panel);
   if(art.mask||bounds.width<300||bounds.width>600||bounds.height<100||bounds.height>130||bounds.y<0||bounds.y>3)return;
   hideEdge(art);
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
    var cuts:Array=[96-originX,440-originX,680-originX,bounds.right];var delta:Number=WIDE_WIDTH-ORIGINAL_WIDTH;
    hudFrame=new Sprite();hudFrame.name="blitz-wide-hud-frame";hudFrame.mouseEnabled=false;hudFrame.mouseChildren=false;
    // The old utility slots leave transparent gaps when spread apart. Keep
    // that new center space on the original HUD's muted sage backing, beneath
    // its vector trim and every real button; never paint over game content.
    hudFrame.graphics.beginFill(0xa4b39c);
    hudFrame.graphics.drawRect(440,Camera.PLAY_SCREEN_HEIGHT+8,240+delta,102);
    hudFrame.graphics.endFill();
    // Normal play retains the native open silhouette around the health orb.
    // Only inspection replaces that region with a rectangular backing.
    var inspection:Sprite=new Sprite();inspection.name="blitz-inspection-backing";inspection.mouseEnabled=false;inspection.mouseChildren=false;
    inspection.graphics.beginFill(0xa4b39c);inspection.graphics.drawRect(0,Camera.PLAY_SCREEN_HEIGHT+8,440,102);inspection.graphics.endFill();
    var inspectionAsset:MovieClip=new type() as MovieClip;StopArtwork(inspectionAsset);
    var inspectionClip:DisplayObjectContainer=inspectionAsset.getChildByName("am_CacheIcon") as DisplayObjectContainer;inspectionClip.x=0;inspectionClip.y=0;
    var inspectionPlate:Sprite=new Sprite();inspectionPlate.mouseEnabled=false;inspectionPlate.mouseChildren=false;inspectionPlate.addChild(inspectionClip);
    inspectionPlate.scrollRect=new Rectangle(cuts[1],bounds.y+3,cuts[2]-cuts[1],bounds.height-3);
    inspectionPlate.y=originY+bounds.y+3;inspectionPlate.scaleX=440/(cuts[2]-cuts[1]);inspection.addChild(inspectionPlate);hudFrame.addChild(inspection);
    // The original health curve keeps its complete contour, independently
    // of the straight power section which disappears during inspection.
    var asset:MovieClip=source;var clip:DisplayObjectContainer=asset.getChildByName("am_CacheIcon") as DisplayObjectContainer;clip.x=0;clip.y=0;
    var slice:Sprite=new Sprite();slice.name="blitz-hud-health-curve";slice.mouseEnabled=false;slice.mouseChildren=false;slice.addChild(clip);
    slice.scrollRect=new Rectangle(bounds.x,bounds.y,96-originX-bounds.x,bounds.height);
    slice.x=originX+bounds.x;slice.y=originY+bounds.y;hudFrame.addChild(slice);
    // Extend only the neutral center of the original decorative HUD plate.
    // Powers and the chat end keep their original proportions.
    for(var i:int=0;i<3;i++){
     asset=new type() as MovieClip;StopArtwork(asset);
     clip=asset.getChildByName("am_CacheIcon") as DisplayObjectContainer;clip.x=0;clip.y=0;
     slice=new Sprite();slice.mouseEnabled=false;slice.mouseChildren=false;slice.addChild(clip);
     if(i==0)slice.name="blitz-hud-health-powers";
     slice.scrollRect=new Rectangle(cuts[i],bounds.y,cuts[i+1]-cuts[i],bounds.height);
     slice.x=originX+cuts[i]+(i==2?delta:0);slice.y=originY+bounds.y;
     if(i==1)slice.scaleX=(cuts[i+1]-cuts[i]+delta)/(cuts[i+1]-cuts[i]);hudFrame.addChild(slice);
     if(i<2)hudStraightBands.push({slice:slice,area:slice.scrollRect.clone(),top:slice.y,trim:3});
    }
    // The upgrade strip has its own complete left corners. A plain backing
    // underneath avoids stacking another stretched corner/bevel behind it.
    // Extend the XP channel only. Its narrow band is below the original
    // ability lip (which remains entirely in the untouched left slice).
    for(i=0;i<2;i++){
     asset=new type() as MovieClip;StopArtwork(asset);
     clip=asset.getChildByName("am_CacheIcon") as DisplayObjectContainer;clip.x=originX;clip.y=originY;
     slice=new Sprite();slice.name=i==0?"blitz-xp-channel-middle":"blitz-xp-channel-cap";slice.mouseEnabled=false;slice.mouseChildren=false;slice.addChild(clip);
     slice.scrollRect=new Rectangle(i==0?200:424,770,i==0?24:13,16);
     slice.x=i==0?410:570;slice.y=770;
     if(i==0)slice.scaleX=160/24;
     hudFrame.addChild(slice);
    }
   }
   var left:Sprite=hudFrame.getChildByName("blitz-hud-health-powers") as Sprite;
   if(left)left.visible=!buildingInspection;
   hudFrame.getChildByName("blitz-inspection-backing").visible=buildingInspection;
   // Remove the outer straight rim above the enlarged center in both modes.
   // Keep the orb's curved outline, native ability grooves and chat end.
   for each(var segment:Object in hudStraightBands){
    var band:Sprite=segment.slice;var originalArea:Rectangle=segment.area;var trim:Number=segment.trim;
    var area:Rectangle=new Rectangle(originalArea.x,originalArea.y+trim,originalArea.width,originalArea.height-trim);
    if(!band.scrollRect.equals(area))band.scrollRect=area;
    band.y=segment.top+trim;
   }
   hudFrame.getChildByName("blitz-hud-health-curve").visible=!buildingInspection;
   hudFrame.getChildByName("blitz-xp-channel-middle").visible=!buildingInspection;
   hudFrame.getChildByName("blitz-xp-channel-cap").visible=!buildingInspection;
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
     // The stone frame continues beneath the original HUD in this asset.
     // End its decorative raster at the shared divider, so its outer gray
     // highlight cannot overlap the HUD's independent sage top bevel.
     slice.addChild(clip);slice.scrollRect=new Rectangle(cuts[i],bounds.y,cuts[i+1]-cuts[i],Math.min(bounds.height,Camera.PLAY_SCREEN_HEIGHT+1-bounds.y));
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
    margins:{left:main.parent.x,right:main.stage.stageWidth-main.parent.x-Camera.SCREEN_WIDTH*main.overallScale},
    presentation:PresentationGeometry(),
    widescreen:{requested:wideRequested,active:wideGame!=null,logicalWidth:Camera.SCREEN_WIDTH,
     logicalHeight:Camera.SCREEN_HEIGHT,uiOffset:wideGame&&wideGame.var_89?wideGame.var_89.x:0,
     frameAttached:Boolean(frame&&frame.parent==main),frameStyle:frameStyle,
     frameInteractive:frame?frame.mouseEnabled||frame.mouseChildren:false,decorationAnimating:ArtworkPlaying(frame)||ArtworkPlaying(hudFrame),interiorLimited:false,
     interiorSceneWidth:null,roomWings:geometry(roomWings)}};
  }
  private static function geometry(value:DisplayObject,depth:int=0):Object {
   if(!value)return null;
   var result:Object={name:value.name,type:getQualifiedClassName(value),x:value.x,y:value.y,width:value.width,height:value.height,scaleX:value.scaleX,scaleY:value.scaleY,visible:value.visible};
   var container:DisplayObjectContainer=value as DisplayObjectContainer;
   if(container&&depth<2){result.children=[];for(var i:int=0;i<Math.min(128,container.numChildren);i++)result.children.push(geometry(container.getChildAt(i),depth+1));}
   return result;
  }
  private static function PresentationGeometry():Object {
   var result:Object={games:[],canvas:geometry(main.var_147,2),display:geometry(main)};
   if(main.var_523)for each(var game:Game in main.var_523){
    var value:Object={state:game.gameState,world:geometry(game.var_1040),screens:[],parallax:[]};
    if(game.var_77&&game.var_77.var_849)for each(var group:class_162 in game.var_77.var_849)for each(var part:class_160 in group.var_1244)if(part.var_954&&part.var_954.dObj)value.parallax.push({name:part.var_954.dObj.name,rateX:part.mRateX,rateY:part.var_2640,display:geometry(part.var_954.var_51,2)});
    if(game.clientEnt&&game.clientEnt.currRoom&&game.clientEnt.currRoom.var_150)value.room=geometry(game.clientEnt.currRoom.var_150,2);
    if(game.var_1828&&game.var_1828.var_2)value.news=geometry(game.var_1828.var_2.getChildByName("am_TopLeftGroup"));
    if(game.mUIManager&&game.mUIManager.var_1240)for each(var screen:class_32 in game.mUIManager.var_1240)if(screen&&screen.mWindow&&screen.mWindow.mMovieClip&&screen.mWindow.mMovieClip.visible)value.screens.push({screen:screen.var_1173,display:geometry(screen.mWindow.mMovieClip)});
    result.games.push(value);
   }
   return result;
  }
 }
}
