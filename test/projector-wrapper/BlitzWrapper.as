package {
 import flash.display.Sprite;
 import flash.display.Loader;
 import flash.display.StageScaleMode;
 import flash.display.StageAlign;
 import flash.events.Event;
 import flash.events.IOErrorEvent;
 import flash.events.SecurityErrorEvent;
 import flash.events.TimerEvent;
 import flash.events.StatusEvent;
 import flash.net.URLRequest;
 import flash.net.LocalConnection;
 import flash.system.LoaderContext;
 import flash.system.ApplicationDomain;
 import flash.utils.Timer;
 import flash.text.TextField;
 public class BlitzWrapper extends Sprite {
  private var connection:LocalConnection=new LocalConnection();
  private var timer:Timer=new Timer(250);
  private var game:Loader=new Loader();
  private var settingsMovie:Loader;
  private var settingsRevision:int=0;
  private var loaded:Boolean=false;
  private var label:TextField=new TextField();
  public function BlitzWrapper(){if(stage)setup();else addEventListener(Event.ADDED_TO_STAGE,setup);}
  private function setup(event:Event=null):void {
   stage.scaleMode=StageScaleMode.NO_SCALE;stage.align=StageAlign.TOP_LEFT;
   label.width=1100;label.height=120;label.text="Wrapper started: "+loaderInfo.url;addChild(label);
   connection.addEventListener(StatusEvent.STATUS,ignore);
   timer.addEventListener(TimerEvent.TIMER,read);timer.start();read();
  }
  private function ignore(event:Event):void{if(event is IOErrorEvent)label.text=IOErrorEvent(event).text;else if(event is SecurityErrorEvent)label.text=SecurityErrorEvent(event).text;}
  private function read(event:Event=null):void {
   if(settingsMovie)return;
   settingsMovie=new Loader();
   settingsMovie.contentLoaderInfo.addEventListener(Event.COMPLETE,apply);
   settingsMovie.contentLoaderInfo.addEventListener(IOErrorEvent.IO_ERROR,function(event:Event):void{settingsMovie=null;});
   settingsMovie.load(new URLRequest(settingsRevision++<8?"settings.swf":"settings-next.swf"),new LoaderContext(false,new ApplicationDomain(null)));
  }
  private function apply(event:Event=null):void {
   var text:String=String(Object(settingsMovie.content).payload);settingsMovie.unloadAndStop();settingsMovie=null;if(text.length>8192)return;
   try{
    label.text=text;
    var value:Object=JSON.parse(text);if(!value||value.schema!==1||!value.nonce||!value.origin)return;
    if(!loaded){var context:LoaderContext=new LoaderContext(false,new ApplicationDomain(null));
     addChild(game);game.load(new URLRequest("game.swf"),context);loaded=true;}
    // Repeat until the game has installed its receiver. Commands cannot request
    // host operations: only bounded presentation/audio values flow into Flash.
    connection.send("_blitz-game-"+String(value.nonce),"configure",Number(value.zoom),Number(value.player),Number(value.music),Number(value.environment),Number(value.creatures),Boolean(value.showFPS),Boolean(value.storage));
   }catch(error:Error){label.text=error.message;}
  }
 }
}
