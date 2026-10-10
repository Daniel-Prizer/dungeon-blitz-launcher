using System;
// Pure policy: confinement is permitted only for the visible, foreground launcher.
// The shortcut toggles the same enabled preference as the Settings checkbox.
public sealed class CursorLockState {
  public bool Enabled { get; private set; }
  public int Shortcut { get; private set; }
  bool shortcutDown, chord;
  public CursorLockState() { Shortcut=0xA4; }
  public void Configure(bool enabled,int shortcut) {
    // A saved-preference acknowledgement must not turn a held key's repeats
    // into new presses. Reset its state only when the binding itself changes.
    if(Shortcut!=shortcut){shortcutDown=false;chord=false;}
    Enabled=enabled;Shortcut=shortcut;
  }
  public void Toggle() { Enabled=!Enabled; }
  public bool ShouldConfine(bool visible,bool focused) { return Enabled&&visible&&focused; }
  public static int Inset(int width,int height,double scale) { return Math.Min((int)Math.Round(12*scale),Math.Max(0,(Math.Min(width,height)-1)/2)); }
  public struct Area { public int left,top,right,bottom; }
  public static Area Bounds(int width,int height,double scale,bool menuVisible) {
    int inset=Inset(width,height,scale);
    return new Area{left=inset,top=menuVisible?0:inset,right=width-inset,bottom=height-inset};
  }
  public static bool ValidShortcut(int key) {
    return (key>=0xA0&&key<=0xA5)||(key>=0x30&&key<=0x39)||(key>=0x41&&key<=0x5A)||
      (key>=0x60&&key<=0x6F)||(key>=0x70&&key<=0x87&&key!=0x7A)||
      key==8||key==9||key==13||key==0x14||(key>=0x20&&key<=0x28)||key==0x2D||key==0x2E||
      (key>=0xBA&&key<=0xC0)||(key>=0xDB&&key<=0xDE);
  }
  // Alt toggles on release; Alt+Tab and Alt+F4 must remain normal Windows chords.
  public bool Key(int key,bool down,bool focused) {
    bool modifier=Shortcut>=0xA0&&Shortcut<=0xA5;
    if(key!=Shortcut) { if(down&&shortcutDown)chord=true;return false; }
    if(down) {
      if(!focused){shortcutDown=false;chord=false;return false;}
      if(shortcutDown)return !modifier;
      shortcutDown=true;chord=false;
      if(!modifier) { Toggle();return true; }
      return false;
    }
    bool toggle=shortcutDown&&!chord&&modifier&&focused;
    shortcutDown=false;chord=false;
    if(toggle)Toggle();
    return false;
  }
}
