using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Collections.Generic;
using System.Web.Script.Serialization;

// Suppress only the Shift accessibility activation shortcuts while this game's
// HWND is foreground. Never disable an accessibility feature already in use.
// No persistent Windows preference writes or key swallowing. The journal is
// recovery data for an abnormal host exit, not an application setting.
public sealed class AccessibilityShortcuts : IDisposable {
  [DllImport("user32.dll", SetLastError=true)]
  static extern bool SystemParametersInfo(uint action,uint size,IntPtr data,uint flags);
  const uint ShortcutMask=12, Enabled=1;
  readonly Func<uint,uint[],bool> spi;
  readonly string journal;
  readonly bool dryRun;
  readonly string mutexName;
  Mutex mutex;
  bool owned;
  readonly Dictionary<uint,uint[]> changed=new Dictionary<uint,uint[]>();
  // GETSTICKYKEYS -> SETSTICKYKEYS, GETFILTERKEYS -> SETFILTERKEYS.
  static readonly uint[] Gets={0x003A,0x0032};
  static int Words(uint get) {return get==0x003A?2:5;}
  static uint Set(uint get) {return get==0x003A?0x003Bu:0x0033u;}
  static bool Native(uint action,uint[] words) {
    IntPtr data=Marshal.AllocHGlobal(words.Length*4);
    try {
      for(int i=0;i<words.Length;i++)Marshal.WriteInt32(data,i*4,unchecked((int)words[i]));
      if(!SystemParametersInfo(action,words[0],data,0))return false;
      for(int i=0;i<words.Length;i++)words[i]=unchecked((uint)Marshal.ReadInt32(data,i*4));return true;
    } finally {Marshal.FreeHGlobal(data);}
  }
  public AccessibilityShortcuts(bool test) : this(test,Native,Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Dungeon Blitz Launcher","accessibility-recovery.json")) {}
  // A fake SPI and disposable journal exercise all state transitions without
  // changing the user's global accessibility preferences, even on a test desktop.
  public AccessibilityShortcuts(bool test,Func<uint,uint[],bool> api,string file,string coordinationName="Local\\DungeonBlitzLauncher-AccessibilityShortcuts") {dryRun=test;spi=api;journal=file;mutexName=coordinationName;}
  uint[] Read(uint get) {var words=new uint[Words(get)];words[0]=(uint)(words.Length*4);return spi(get,words)?words:null;}
  bool Save() {
    try {Directory.CreateDirectory(Path.GetDirectoryName(journal));var records=new Dictionary<string,uint[]>();foreach(var item in changed)records[item.Key.ToString(System.Globalization.CultureInfo.InvariantCulture)]=item.Value;string temporary=journal+".tmp";File.WriteAllText(temporary,new JavaScriptSerializer().Serialize(records));if(File.Exists(journal))File.Delete(journal);File.Move(temporary,journal);return true;}catch{return false;}
  }
  void Recover() {
    try {
      if(!File.Exists(journal)||new FileInfo(journal).Length>2048)return;
      var records=new JavaScriptSerializer().Deserialize<Dictionary<string,uint[]>>(File.ReadAllText(journal));
      foreach(uint get in Gets){uint[] words;if(records.TryGetValue(get.ToString(System.Globalization.CultureInfo.InvariantCulture),out words)&&words!=null&&words.Length==Words(get)&&words[0]==words.Length*4&&(words[1]&Enabled)==0)changed[get]=words;}
      Restore();
    }catch{}
  }
  void Restore() {
    foreach(uint get in Gets) {
      uint[] original;if(!changed.TryGetValue(get,out original))continue;
      uint[] current=Read(get);if(current==null)continue;
      // Merge only our cleared shortcut bits. Preserve changed timings and
      // options; don't overwrite a feature the user enabled meanwhile.
      if((current[1]&(Enabled|ShortcutMask))==0){current[1]|=original[1]&ShortcutMask;if(!spi(Set(get),current))continue;}
      changed.Remove(get);
    }
    if(changed.Count==0){try{if(File.Exists(journal))File.Delete(journal);}catch{}}else Save();
  }
  public void Update(bool active) {
    if(dryRun)return;
    if(!active){if(owned){Restore();mutex.ReleaseMutex();owned=false;}return;}
    if(!owned) {
      if(mutex==null)mutex=new Mutex(false,mutexName);
      try{owned=mutex.WaitOne(0);}catch(AbandonedMutexException){owned=true;}
      if(!owned)return;Recover();
    }
    foreach(uint get in Gets) {
      if(changed.ContainsKey(get))continue;
      uint[] current=Read(get);if(current==null||(current[1]&Enabled)!=0||(current[1]&ShortcutMask)==0)continue;
      changed[get]=(uint[])current.Clone();
      // Record before touching global state so a crash can be recovered.
      if(!Save()){changed.Remove(get);continue;}
      current[1]&=~ShortcutMask;
      if(!spi(Set(get),current)){changed.Remove(get);Save();}
    }
  }
  public void Dispose(){Update(false);if(mutex!=null)mutex.Dispose();}
}
