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
  }filterChecks();mapMaskChecks();upstreamChecks();guildChecks();ready=true;}catch(e:Error){failure=e.toString()+" "+e.getStackTrace();}}
  private function guildChecks():void {
   var domain:ApplicationDomain=ApplicationDomain.currentDomain;if(!domain.hasDefinition("GuildRaidFund"))return;
   var fund:Class=domain.getDefinition("GuildRaidFund") as Class;var guildNet:Class=domain.getDefinition("GuildNet") as Class;
   fund["Request"]();fund["OnFund"]({openDay:true,paidToday:false,canOpen:false,fund:0,cost:100,gold:0,wait:0,message:"",ok:true,donors:[]});
   checks.push({name:"Guild fund cannot open from an unsolicited disconnected response",actual:fund["IsOpen"]()?1:0,expected:0});
   checks.push({name:"Guild leave request requires a game connection",actual:guildNet["Send"](guildNet["REQ_LEAVE"])?1:0,expected:0});
   var panel:Sprite=new fund() as Sprite;checks.push({name:"Current guild fund artwork constructs",actual:panel&&panel.width>400&&panel.height>500?1:0,expected:1});
   var leave:Class=domain.getDefinition("GuildLeaveDialog") as Class;var dialog:Sprite=new leave("Fixture Guild") as Sprite;
   checks.push({name:"Current guild leave artwork constructs",actual:dialog&&dialog.width>400&&dialog.height>100?1:0,expected:1});
   var view:BitmapData=new BitmapData(500,540,true,0);view.draw(panel);var image:Bitmap=new Bitmap(view);image.x=1050;image.y=350;addChild(image);
   fund["Close"]();checks.push({name:"Guild fund close remains safe without an open modal",actual:fund["IsOpen"]()?1:0,expected:0});
  }
  private function upstreamChecks():void {
   if(ApplicationDomain.currentDomain.hasDefinition("BalanceHooks")){
    var balance:Class=ApplicationDomain.currentDomain.getDefinition("BalanceHooks") as Class;
    checks.push({name:"Balance dot hook retains a missing-owner tick",actual:balance["DotTick"](null,42),expected:42});
    checks.push({name:"Balance minion hook tolerates missing combatants",actual:balance["MinionCurse"](null,null),expected:0});
    balance["AfterHit"](null,null);balance["DerivedStats"](null);
    checks.push({name:"Balance hit and stat hooks tolerate absent game state",actual:1,expected:1});
   }
   if(!ApplicationDomain.currentDomain.hasDefinition("NeoQuests"))return;
   var domain:ApplicationDomain=ApplicationDomain.currentDomain;
   var sentinel:Class=domain.getDefinition("SentinelFormSkills") as Class;
   checks.push({name:"Sentinel gate leaves unrelated skills alone",actual:sentinel["Gate"](null,null),expected:0});
   var raid:Class=domain.getDefinition("GuildRaid") as Class;var quests:Class=domain.getDefinition("NeoQuests") as Class;
   checks.push({name:"Raid hook passes through an absent packet",actual:raid["HandlePacket"](null,null)?1:0,expected:0});
   checks.push({name:"Quest hook passes through an absent packet",actual:quests["HandlePacket"](null,null)?1:0,expected:0});
   var raidNet:Class=domain.getDefinition("GuildRaidNet") as Class;var questNet:Class=domain.getDefinition("NeoQuestsNet") as Class;
   checks.push({name:"Raid request requires a game connection",actual:raidNet["Send"](1)?1:0,expected:0});
   checks.push({name:"Quest request requires a game connection",actual:questNet["Send"](1)?1:0,expected:0});
   checks.push({name:"Raid clock formats elapsed seconds",actual:raidNet["Clock"](61)=="1:01"?1:0,expected:1});
   checks.push({name:"Quest clock formats elapsed milliseconds",actual:questNet["Clock"](61000)=="01:01"?1:0,expected:1});
   var loot:Class=domain.getDefinition("LootPick") as Class;
   checks.push({name:"Loot hook passes unrelated chat through",actual:loot["Run"](null,"not a command")?1:0,expected:0});
   var teleport:Class=domain.getDefinition("MapTeleport") as Class;teleport["Update"](null);
   if(domain.hasDefinition("GuildRaidGold")){
    var gold:Class=domain.getDefinition("GuildRaidGold") as Class;
    checks.push({name:"Raid gold formats grouped digits",actual:gold["Dotted"](1234567)=="1.234.567"?1:0,expected:1});
    gold["Show"](100);gold["Close"]();
    var enemies:Class=domain.getDefinition("GuildRaidEnemies") as Class;enemies["Show"](0,0);enemies["Close"]();
    checks.push({name:"Raid overlays tolerate an absent game",actual:1,expected:1});
    checks.push({name:"Loot command outside a dungeon is consumed safely",actual:loot["Run"](null,"/pick")?1:0,expected:1});
   }
  }
  private function mapMaskChecks():void {
   if(!ApplicationDomain.currentDomain.hasDefinition("MapZoneMask"))return;
   var helper:Class=ApplicationDomain.currentDomain.getDefinition("MapZoneMask") as Class;
   var data:BitmapData=new BitmapData(32,16,true,0xffff3300);var source:Bitmap=new Bitmap(data);var target:BitmapData=new BitmapData(32,16,true,0);
   helper["Draw"](target,source);checks.push({name:"Map helper preserves an unmasked bitmap",actual:target.getPixel32(8,8),expected:0xffff3300});
   var holder:Sprite=new Sprite();var mask:Sprite=new Sprite();mask.graphics.beginFill(0xffffff);mask.graphics.drawRect(4,0,12,16);mask.graphics.endFill();holder.addChild(source);holder.addChild(mask);holder.addChild(new Sprite());mask.visible=false;source.mask=mask;
   target.fillRect(target.rect,0);helper["Draw"](target,source);
   checks.push({name:"Map helper retains masked inside",actual:target.getPixel32(8,8),expected:0xffff3300});checks.push({name:"Map helper clears masked outside",actual:target.getPixel32(24,8),expected:0});
   checks.push({name:"Map helper restores mask ownership and visibility",actual:(holder.numChildren==3&&mask.parent===holder&&holder.getChildIndex(mask)==1&&source.mask===mask&&!mask.visible?1:0),expected:1});target.dispose();data.dispose();
  }
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
