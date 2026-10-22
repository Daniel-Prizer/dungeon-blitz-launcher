package {
 import flash.display.*;import flash.filters.*;import flash.geom.*;import flash.events.*;import flash.net.URLRequest;import flash.system.*;import flash.external.ExternalInterface;import flash.utils.ByteArray;
 public class DungeonBlitz extends Sprite {
  private var checks:Array=[];private var loaded:int=0;private var ready:Boolean=false;private var failure:String="";private var results:Array=[];
  private var icons:Array=["a_PowerIcon_MaceSmash","a_PowerIcon_DivineBolt","a_PowerIcon_DoubleStrike","a_PowerIcon_DaggerFlurry","a_PowerIcon_FireBall","a_PowerIcon_DeathBlow","a_PowerIcon_ShadowStep","a_PowerIcon_ThousandCuts"];
  public function DungeonBlitz(){if(stage)setup();else addEventListener(Event.ADDED_TO_STAGE,setup);}
  private function setup(event:Event=null):void {stage.scaleMode=StageScaleMode.NO_SCALE;stage.align=StageAlign.TOP_LEFT;graphics.beginFill(0x484955);graphics.drawRect(0,0,1600,900);graphics.endFill();ExternalInterface.addCallback("BlitzMediaProbe",snapshot);
   for each(var file:String in ["UI_0.swf","UI_1.swf","UI_2.swf","UI_3.swf","UI_4.swf","UI_Library.swf","UI_Seasonal.swf"]){var l:Loader=new Loader();l.contentLoaderInfo.addEventListener(Event.COMPLETE,complete);l.contentLoaderInfo.addEventListener(IOErrorEvent.IO_ERROR,failed);l.load(new URLRequest("/assets/"+file),new LoaderContext(false,ApplicationDomain.currentDomain));}}
  private function failed(event:IOErrorEvent):void {failure=event.toString();}
  private function stop(value:DisplayObject):void {if(value is MovieClip)MovieClip(value).stop();var c:DisplayObjectContainer=value as DisplayObjectContainer;if(c)for(var i:int=0;i<c.numChildren;i++)stop(c.getChildAt(i));}
  private function complete(event:Event):void {if(++loaded<7)return;try{var main:Main=new Main();main.overallScale=1;var game:Game=new Game(main);for(var i:int=0;i<icons.length;i++){var name:String=icons[i];var exists:Boolean=ApplicationDomain.currentDomain.hasDefinition(name);if(!exists){results.push({name:name,exists:false});continue;}
   var art:MovieClip=class_4.method_16(name);stop(art);art.x=80+i*150;art.y=120;addChild(art);
   var icon:Bitmap=class_4.method_639(game,name,1);var p:BitmapData=icon.bitmapData;icon.x=80+i*150;icon.y=300;addChild(icon);
   var bounds:Rectangle=art.getBounds(art);var raw:ByteArray=p.getPixels(p.rect);raw.compress();results.push({name:name,exists:true,width:p.width,height:p.height,bounds:{x:bounds.x,y:bounds.y,width:bounds.width,height:bounds.height},argb:base64(raw)});
  }filterChecks();ready=true;}catch(e:Error){failure=e.toString()+" "+e.getStackTrace();}}
  private function filterChecks():void {
   var root:Sprite=new Sprite();var child:Sprite=new Sprite();child.graphics.beginFill(0xff0000);child.graphics.drawRect(4,4,16,16);child.graphics.endFill();root.addChild(child);
   child.filters=[new ColorMatrixFilter([0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,1,0])];
   root.filters=[new ColorMatrixFilter([0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,1,0])];
   var b:BitmapData=new BitmapData(32,32,true,0);b.drawWithQuality(root,null,null,null,null,true,StageQuality.HIGH);
   checks.push({name:"Child filter survives offscreen draw, root filter excluded",actual:b.getPixel32(10,10),expected:0xff0000ff});
   b.fillRect(b.rect,0);b.drawWithQuality(child,null,null,null,null,true,StageQuality.HIGH);
   checks.push({name:"Direct source filter remains excluded",actual:b.getPixel32(10,10),expected:0xffff0000});
   b.fillRect(b.rect,0);b.drawWithQuality(root,new Matrix(0.5,0,0,0.5));checks.push({name:"Cached child retains filter at another density",actual:b.getPixel32(5,5),expected:0xff0000ff});
   var mask:Sprite=new Sprite();mask.graphics.beginFill(0xffffff);mask.graphics.drawRect(4,4,6,16);mask.graphics.endFill();root.addChild(mask);child.mask=mask;
   b.fillRect(b.rect,0);b.drawWithQuality(root);checks.push({name:"Mask keeps outside transparent",actual:b.getPixel32(14,10),expected:0});checks.push({name:"Mask retains filtered inside",actual:b.getPixel32(6,10),expected:0xff0000ff});b.dispose();
  }
  private function snapshot():Object {return{checks:checks,ready:ready,error:failure,loaded:loaded,icons:results};}
  private function base64(bytes:ByteArray):String{var alphabet:String="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";var parts:Array=[];bytes.position=0;while(bytes.bytesAvailable){var a:uint=bytes.readUnsignedByte();var hasB:Boolean=bytes.bytesAvailable>0;var b:uint=hasB?bytes.readUnsignedByte():0;var hasC:Boolean=bytes.bytesAvailable>0;var c:uint=hasC?bytes.readUnsignedByte():0;parts.push(alphabet.charAt(a>>2)+alphabet.charAt(((a&3)<<4)|(b>>4))+(hasB?alphabet.charAt(((b&15)<<2)|(c>>6)):"=")+(hasC?alphabet.charAt(c&63):"="));}return parts.join("");}
 }
}
