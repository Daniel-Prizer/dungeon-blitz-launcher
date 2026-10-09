package {
 import flash.display.Stage;
 import flash.display.DisplayObject;
 import flash.events.Event;
 import flash.text.TextField;
 import flash.text.TextFormat;
 import flash.utils.getTimer;
 // Passive Flash frame observer. Never writes a game clock or captures pixels.
 public class BlitzFrameCounter {
  private static var surface:Stage;
  private static var source:DisplayObject;
  private static var label:TextField;
  private static var placement:Function;
  private static var started:uint;
  private static var frames:uint=0;
  private static var total:uint=0;
  private static var updates:uint=0;
  private static var sampledFrames:uint=0;
  private static var sampledMs:uint=0;
  private static var sampledAt:uint=0;
  private static var fps:Number=NaN;
  private static var units:Number=1;
  public static function Attach(stage:Stage,frameSource:DisplayObject,position:Function):void {
   if(!stage||!frameSource)return;
   placement=position;
   if(surface==stage&&source==frameSource)return;
   Detach();surface=stage;source=frameSource;placement=position;
   frames=0;total=0;updates=0;sampledFrames=0;sampledMs=0;fps=NaN;
   started=uint(getTimer());sampledAt=started;
   label=new TextField();label.name="blitz-fps-counter";
   label.defaultTextFormat=new TextFormat("_sans",14,0xC9CDD6);
   label.width=76;label.height=24;label.text="— FPS";
   label.scaleX=units;label.scaleY=units;
   label.mouseEnabled=false;label.selectable=false;label.tabEnabled=false;
   label.visible=false;surface.addChild(label);
   source.addEventListener(Event.ENTER_FRAME,Frame,false,-100,true);
  }
  public static function Detach():void {
   if(source)source.removeEventListener(Event.ENTER_FRAME,Frame);
   if(label&&label.parent)label.parent.removeChild(label);
   surface=null;source=null;label=null;placement=null;
  }
  public static function Layout(pictureLeft:Number,pictureRight:Number):void {
   if(!surface||!label)return;
   var padding:Number=14*units;var show:Boolean=false;var nextX:Number=padding;
   if(isFinite(pictureLeft)&&isFinite(pictureRight)&&surface.stageHeight>=label.height+padding*2){
    if(pictureLeft>=label.width+padding*2)show=true;
    else if(surface.stageWidth-pictureRight>=label.width+padding*2){nextX=surface.stageWidth-label.width-padding;show=true;}
   }
   if(label.x!=nextX)label.x=nextX;
   if(label.y!=padding)label.y=padding;
   if(label.visible!=show)label.visible=show;
  }
  public static function SetMagnification(value:Number):void {
   if(!isFinite(value)||value<0.1||value>16)return;
   units=1/value;
   if(label){label.scaleX=units;label.scaleY=units;}
  }
  private static function Frame(event:Event):void {
   ++frames;++total;
   var now:uint=uint(getTimer());var elapsed:uint=now-started;
   if(elapsed>=1000){
    sampledFrames=frames;sampledMs=elapsed;sampledAt=now;
    fps=1000*frames/elapsed;label.text=Math.round(fps)+" FPS";
    frames=0;started=now;++updates;
   }
   if(placement!=null)placement();
  }
  public static function Snapshot():Object {
   if(!surface||!label)return null;
   var fresh:Boolean=updates>0&&uint(uint(getTimer())-sampledAt)<=2500;
   return {fps:fresh?fps:null,sampleFrames:sampledFrames,sampleMs:sampledMs,totalFrames:total,
    updates:updates,visible:label.visible,text:label.text,x:label.x,y:label.y,
    width:label.width,height:label.height,mouseEnabled:label.mouseEnabled,
    selectable:label.selectable,source:"game-enter-frame"};
  }
 }
}
