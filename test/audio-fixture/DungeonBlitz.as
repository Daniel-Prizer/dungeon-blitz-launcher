package {
 import flash.display.Sprite;
 import flash.display.StageScaleMode;
 import flash.display.StageAlign;
 import flash.events.Event;
 import flash.events.SampleDataEvent;
 import flash.media.Sound;
 import flash.media.SoundChannel;
 import flash.media.SoundTransform;
 public class DungeonBlitz extends Sprite {
  private var sounds:Array=[];
  private var active:Array=[];
  private var stream:SoundChannel;
  public function DungeonBlitz(){if(stage)setup();else addEventListener(Event.ADDED_TO_STAGE,setup);}
  private function silent():SoundChannel {
   var sound:Sound=new Sound();sounds.push(sound);sound.addEventListener(SampleDataEvent.SAMPLE_DATA,samples);var channel:SoundChannel=sound.play();active.push(channel);return channel;
  }
  private function samples(event:SampleDataEvent):void {for(var i:int=0;i<8192;i++){event.data.writeFloat(0);event.data.writeFloat(0);}}
  private function setup(event:Event=null):void {
   stage.scaleMode=StageScaleMode.NO_SCALE;stage.align=StageAlign.TOP_LEFT;
   graphics.beginFill(0x334455);graphics.drawRect(0,0,10000,10000);graphics.endFill();
   BlitzAudio.Init();BlitzAudio.Track(silent());
   BlitzAudio.PushOwner(null);BlitzAudio.Track(silent());BlitzAudio.Pop();
   BlitzAudio.PushEnvironment();BlitzAudio.Track(silent());BlitzAudio.Pop();
   stream=silent();BlitzAudio.TrackStream(Main.const_77,stream);
   addEventListener(Event.ENTER_FRAME,tick);
  }
  private function tick(event:Event):void {
   BlitzAudio.BeforeTick();var transform:SoundTransform=stream.soundTransform;transform.volume=0.8;stream.soundTransform=transform;BlitzAudio.AfterTick();
  }
 }
}
