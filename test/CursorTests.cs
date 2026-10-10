using System;
public static class CursorTests {
  static void Check(bool condition,string message){if(!condition)throw new Exception(message);}
  public static int Main(){
    foreach(double density in new[]{1.0,1.5,2.0})foreach(bool menu in new[]{false,true}){
      var bounds=CursorLockState.Bounds(1280,900,density,menu);int inset=(int)(12*density);
      Check(bounds.left==inset&&bounds.right==1280-inset&&bounds.bottom==900-inset,"Side/bottom inset retained");
      Check(bounds.top==(menu?0:inset),"Windowed menu reachable; fullscreen top inset retained");
      if(menu)Check(bounds.top<=16*density&&bounds.bottom>16*density,"Menu button centers stay inside lock");
    }
    foreach(bool menu in new[]{false,true}){var bounds=CursorLockState.Bounds(1,1,2,menu);Check(bounds.right>bounds.left&&bounds.bottom>bounds.top,"Tiny clip area stays nonempty");}
    var state=new CursorLockState();Check(!state.ShouldConfine(true,true),"Default off");state.Configure(true,0xA4);
    Check(state.ShouldConfine(true,true),"Enabled foreground");Check(!state.ShouldConfine(false,true),"Hidden release");Check(!state.ShouldConfine(true,false),"Blur release");
    state.Key(0xA4,true,true);state.Key(0xA4,true,true);Check(state.Enabled,"Alt repeats do not toggle");state.Key(0xA4,false,true);Check(!state.Enabled,"Left Alt release disables the checkbox state");
    Check(!state.ShouldConfine(true,true),"Stay unlocked after focus changes");state.Key(0xA4,true,true);state.Key(0xA4,false,true);Check(state.Enabled,"Alt also enables an unchecked lock");
    state.Key(0xA5,true,true);state.Key(0xA5,false,true);Check(state.Enabled,"Right Alt cannot trigger left Alt shortcut");
    foreach(int other in new[]{9,0x73}){state.Key(0xA4,true,true);state.Key(other,true,true);state.Key(0xA4,false,true);Check(state.Enabled,"Alt Tab/F4 is not a toggle");}
    state.Key(0xA4,true,false);state.Key(0xA4,false,false);Check(state.Enabled,"Background keys ignored");
    state.Key(0xA4,true,false);state.Key(0xA4,false,true);Check(state.Enabled,"A background press cannot toggle after focus changes");
    state.Configure(true,0x77);Check(state.Key(0x77,true,true),"Custom key consumed");Check(!state.Enabled,"Custom key disables checkbox");
    state.Configure(false,0x77);Check(state.Key(0x77,true,true),"Held-key repeats remain consumed");Check(!state.Enabled,"Saved-setting acknowledgement preserves held-key repeat guard");
    state.Key(0x77,false,true);state.Key(0x77,true,true);Check(state.Enabled,"Next distinct press enables checkbox");state.Key(0x77,false,true);
    Check(CursorLockState.Inset(1280,852,1)==12,"12px inner boundary");Check(CursorLockState.Inset(1280,852,1.5)==18,"DPI scaled boundary");Check(CursorLockState.Inset(8,4,1)==1,"Small windows retain usable area");Check(CursorLockState.Inset(1,1,1)==0,"Tiny window stays valid");
    state.Configure(true,0xA2);state.Key(0xA2,true,true);state.Key(65,true,true);state.Key(0xA2,false,true);Check(state.Enabled,"Ctrl A remains a chord");state.Key(0xA2,true,true);state.Key(0xA2,false,true);Check(!state.Enabled,"Ctrl alone toggles on release");
    Check(CursorLockState.ValidShortcut(65)&&CursorLockState.ValidShortcut(0xA0)&&!CursorLockState.ValidShortcut(0x7A)&&!CursorLockState.ValidShortcut(0x1B),"Binding validation");state.Configure(false,0xA4);Check(!state.ShouldConfine(true,true),"Checkbox disables");
    Console.WriteLine("PASS Cursor checkbox policy: foreground, visibility, Alt chords, saved-setting acknowledgement, repeat and custom shortcut");return 0;
  }
}
