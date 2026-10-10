package {
 import flash.external.ExternalInterface;
 import flash.display.DisplayObject;
 import flash.display.Sprite;
 import flash.events.Event;
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
  private static var frame:Sprite;
  private static var frameKey:String="";
  private static const ORIGINAL_WIDTH:Number=1152;
  private static const WIDE_WIDTH:Number=768*16/9;
  public static function Attach(value:Main):void {
   main=value;
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
   object.x=saved.base+amount;saved.last=object.x;
  }
  private static function screenOffset(screen:class_32,amount:Number):void {
   if(screen&&screen.mWindow&&screen.mWindow.mMovieClip&&
    screen.mWindow.mMovieClip.parent==wideGame.var_89)offset(screen.mWindow.mMovieClip,amount);
  }
  private static function restore():void {
   for(var object:Object in offsets){if(Math.abs(object.x-offsets[object].last)<0.001)object.x=offsets[object].base;}
   for(var edge:Object in edges)edge.visible=edges[edge];
   offsets=new Dictionary(true);edges=new Dictionary(true);wideGame=null;
   if(frame&&frame.parent)frame.parent.removeChild(frame);frameKey="";
  }
  private static function hideEdge(object:DisplayObject):void {
   if(!object)return;if(edges[object]===undefined)edges[object]=object.visible;object.visible=false;
  }
  private static function UpdateWidescreen(event:Event=null):void {
   if(!main||!main.stage)return;
   // Multiple concurrent Games belong to a connection/scene handover. Keep
   // the original layout there and on all fixed-size title/login/menu artwork.
   var game:Game=wideRequested&&main.var_523&&main.var_523.length==1?main.var_523[0]:null;
   if(game&&game.gameState!=Game.STATE_PLAY)game=null;
   if(game!=wideGame)restore();
   var width:Number=game?WIDE_WIDTH:ORIGINAL_WIDTH;
   if(Camera.SCREEN_WIDTH!=width){
    Camera.SCREEN_WIDTH=width;main.overallScale=0;
    main.method_561(main.stage.stageWidth,main.stage.stageHeight);
   }
   if(!game){PositionCounter();return;}
   wideGame=game;
   var half:Number=(WIDE_WIDTH-ORIGINAL_WIDTH)*0.5;
   offset(game.var_89,half*main.overallScale);offset(game.var_245,half*main.overallScale);
   // Keep the original bottom HUD/chat/quest grouping intact and centered.
   // Move only the independent top controls, including their hit-test roots.
   screenOffset(game.screenHudTop,-half);screenOffset(game.screenLinkBar,-half);
   screenOffset(game.screenHudTopRight,half);
   if(game.edgeLayer){hideEdge(game.edgeLayer.getChildByName("am_EdgeFull"));hideEdge(game.edgeLayer.getChildByName("am_EdgeNarrow"));}
   DrawFrame(game);PositionCounter();
  }
  private static function DrawFrame(game:Game):void {
   if(!game.edgeLayer||game.edgeLayer.parent!=main)return;
   if(!frame){frame=new Sprite();frame.name="blitz-wide-frame";frame.mouseEnabled=false;frame.mouseChildren=false;frame.tabEnabled=false;}
   if(frame.parent!=main)main.addChildAt(frame,main.getChildIndex(game.edgeLayer));
   var key:String=String(main.overallScale);
   if(frameKey==key)return;frameKey=key;
   frame.scaleX=frame.scaleY=main.overallScale;
   var w:Number=WIDE_WIDTH;var h:Number=Camera.SCREEN_HEIGHT;var b:Number=Main.var_1876;
   // Muted gray vector border. Four separate strips leave the entire world
   // unobscured; no transparent input window or per-frame bitmap overlay.
   frame.graphics.clear();frame.graphics.beginFill(0x484955);
   frame.graphics.drawRect(0,Camera.PLAY_SCREEN_HEIGHT,w,h-Camera.PLAY_SCREEN_HEIGHT);
   frame.graphics.drawRect(-b,-b,w+b*2,b);frame.graphics.drawRect(-b,h,w+b*2,b);
   frame.graphics.drawRect(-b,0,b,h);frame.graphics.drawRect(w,0,b,h);frame.graphics.endFill();
   frame.graphics.lineStyle(5,0x343640);frame.graphics.drawRect(-b+3,-b+3,w+b*2-6,h+b*2-6);
   frame.graphics.lineStyle(2,0x656773);frame.graphics.drawRect(-4,-4,w+8,h+8);
   frame.graphics.lineStyle(6,0x343640);
   frame.graphics.moveTo(-b+4,20);frame.graphics.lineTo(18,-b+4);
   frame.graphics.moveTo(w-18,-b+4);frame.graphics.lineTo(w+b-4,20);
   frame.graphics.moveTo(w+b-4,h-20);frame.graphics.lineTo(w-18,h+b-4);
   frame.graphics.moveTo(18,h+b-4);frame.graphics.lineTo(-b+4,h-20);
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
     frameAttached:Boolean(frame&&frame.parent==main),frameInteractive:frame?frame.mouseEnabled||frame.mouseChildren:false}};
  }
 }
}
