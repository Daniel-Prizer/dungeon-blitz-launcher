package {
 import flash.external.ExternalInterface;
 import flash.media.SoundChannel;
 import flash.media.SoundTransform;
 import flash.utils.Dictionary;
 import flash.events.Event;
 // Launcher-owned mixer. No authentication, packets, saves or entity state edits.
 public class BlitzAudio {
  private static var initialized:Boolean=false;
  private static var levels:Object={player:1,music:1,environment:1,creatures:1};
  private static var channels:Dictionary=new Dictionary(true);
  private static var contexts:Array=[];
  private static var bus:String="player";
  public static function Init():void {
   if(initialized)return;
   if(ExternalInterface.available){
    ExternalInterface.addCallback("BlitzSetAudio",SetMix);
    ExternalInterface.addCallback("BlitzAudioState",Snapshot);
    initialized=true;
   }
  }
  private static function valid(value:Number):Boolean {return isFinite(value)&&value>=0&&value<=100&&int(value)==value;}
  public static function SetMix(player:Number,music:Number,environment:Number,creatures:Number):Boolean {
   if(!valid(player)||!valid(music)||!valid(environment)||!valid(creatures))return false;
   levels={player:player/100,music:music/100,environment:environment/100,creatures:creatures/100};
   for(var key:Object in channels)Apply(key as SoundChannel,channels[key]);
   return true;
  }
  public static function PushOwner(owner:Entity):void {
   contexts.push(bus);bus=owner&&(owner.var_20&Entity.PLAYER)?"player":"creatures";
  }
  public static function PushEnvironment():void {contexts.push(bus);bus="environment";}
  public static function Pop():void {bus=contexts.length?String(contexts.pop()):"player";}
  public static function Track(channel:SoundChannel):void {
   if(!channel)return;
   var record:Object={bus:bus,base:channel.soundTransform.volume,stream:false};channels[channel]=record;channel.addEventListener(Event.SOUND_COMPLETE,Completed,false,0,true);Apply(channel,record);
  }
  public static function TrackStream(index:uint,channel:SoundChannel):void {
   if(!channel)return;
   var record:Object={bus:index==Main.const_77?"music":"environment",base:channel.soundTransform.volume,stream:true};channels[channel]=record;channel.addEventListener(Event.SOUND_COMPLETE,Completed,false,0,true);Apply(channel,record);
  }
  private static function Completed(event:Event):void {delete channels[event.currentTarget];}
  private static function Apply(channel:SoundChannel,record:Object):void {
   if(!channel||!record)return;
   var transform:SoundTransform=channel.soundTransform;transform.volume=Number(record.base)*Number(levels[record.bus]);channel.soundTransform=transform;
  }
  // Run original stream fading against its original gain, then apply bus gain.
  // This prevents a quiet bus from changing the game's fade timing or compounding.
  public static function BeforeTick():void {
   Init();contexts.length=0;bus="player";
   for(var key:Object in channels){var record:Object=channels[key];if(record.stream){var channel:SoundChannel=key as SoundChannel;var transform:SoundTransform=channel.soundTransform;transform.volume=Number(record.base);channel.soundTransform=transform;}}
  }
  public static function AfterTick():void {
   for(var key:Object in channels){var record:Object=channels[key];if(record.stream){var channel:SoundChannel=key as SoundChannel;record.base=channel.soundTransform.volume;Apply(channel,record);}}
  }
  public static function Snapshot():Object {
   var count:Object={player:0,music:0,environment:0,creatures:0};
   var samples:Array=[];
   for(var key:Object in channels){var record:Object=channels[key];count[record.bus]++;if(samples.length<32)samples.push({bus:record.bus,base:record.base,volume:(key as SoundChannel).soundTransform.volume,stream:record.stream});}
   return {levels:levels,channels:count,samples:samples,initialized:initialized,contextDepth:contexts.length};
  }
 }
}
