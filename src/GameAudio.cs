using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
// Windows audio-session attenuation, scoped to the supplied game's process tree.
// Never changes endpoint/master volume or another application's audio session.
public static class GameAudio {
  [ComImport,Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator {}
  [ComImport,Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IDevices {
    void EnumAudioEndpoints(int flow,uint state,out IDeviceCollection devices);
    void GetDefaultAudioEndpoint(int flow,int role,out IDevice device);
    void GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id,out IDevice device);
    void RegisterEndpointNotificationCallback(IntPtr callback);void UnregisterEndpointNotificationCallback(IntPtr callback);
  }
  [ComImport,Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IDeviceCollection { void GetCount(out uint count);void Item(uint index,out IDevice device); }
  [ComImport,Guid("D666063F-1587-4E43-81F1-B948E807363F"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IDevice {
    void Activate(ref Guid iid,uint context,IntPtr parameters,[MarshalAs(UnmanagedType.IUnknown)] out object result);
    void OpenPropertyStore(int access,out IntPtr properties);void GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);void GetState(out uint state);
  }
  [ComImport,Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IManager {
    void GetAudioSessionControl(ref Guid session,uint flags,out IntPtr control);void GetSimpleAudioVolume(ref Guid session,uint flags,out IntPtr volume);
    void GetSessionEnumerator(out ISessions sessions);
    void RegisterSessionNotification(IntPtr notification);void UnregisterSessionNotification(IntPtr notification);
    void RegisterDuckNotification([MarshalAs(UnmanagedType.LPWStr)]string id,IntPtr notification);void UnregisterDuckNotification(IntPtr notification);
  }
  [ComImport,Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface ISessions { void GetCount(out int count);void GetSession(int index,[MarshalAs(UnmanagedType.IUnknown)]out object control); }
  [ComImport,Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IControl {
    void GetState(out int state);void GetDisplayName([MarshalAs(UnmanagedType.LPWStr)]out string name);void SetDisplayName([MarshalAs(UnmanagedType.LPWStr)]string name,ref Guid context);
    void GetIconPath([MarshalAs(UnmanagedType.LPWStr)]out string path);void SetIconPath([MarshalAs(UnmanagedType.LPWStr)]string path,ref Guid context);
    void GetGroupingParam(out Guid group);void SetGroupingParam(ref Guid group,ref Guid context);void RegisterAudioSessionNotification(IntPtr notification);void UnregisterAudioSessionNotification(IntPtr notification);
    void GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)]out string id);void GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)]out string id);void GetProcessId(out uint pid);
    [PreserveSig]int IsSystemSoundsSession();void SetDuckingPreference(bool optOut);
  }
  [ComImport,Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IVolume {
    void SetMasterVolume(float volume,ref Guid context);void GetMasterVolume(out float volume);void SetMute([MarshalAs(UnmanagedType.Bool)]bool mute,ref Guid context);void GetMute([MarshalAs(UnmanagedType.Bool)]out bool mute);
  }
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct ProcessEntry {
    public uint size,usage,pid;public IntPtr heap;public uint module,threads,parent;public int priority;public uint flags;
    [MarshalAs(UnmanagedType.ByValTStr,SizeConst=260)]public string name;
  }
  [DllImport("kernel32.dll")]static extern IntPtr CreateToolhelp32Snapshot(uint flags,uint pid);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode)]static extern bool Process32FirstW(IntPtr snapshot,ref ProcessEntry entry);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode)]static extern bool Process32NextW(IntPtr snapshot,ref ProcessEntry entry);
  [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr handle);
  static HashSet<uint> Processes(uint root) {
    var family=new HashSet<uint>();family.Add(root);
    var parents=new Dictionary<uint,uint>();var snapshot=CreateToolhelp32Snapshot(2,0);
    if(snapshot==new IntPtr(-1))return family;
    try { var entry=new ProcessEntry();entry.size=(uint)Marshal.SizeOf(entry);
      if(Process32FirstW(snapshot,ref entry))do{parents[entry.pid]=entry.parent;}while(Process32NextW(snapshot,ref entry));
    } finally { CloseHandle(snapshot); }
    bool changed;do{changed=false;foreach(var pair in parents)if(family.Contains(pair.Value)&&family.Add(pair.Key))changed=true;}while(changed);
    return family;
  }
  static void Release(object value) { if(value!=null&&Marshal.IsComObject(value))Marshal.ReleaseComObject(value); }
  public static string Apply(uint root,int percent) {
    var matches=new List<object>();string error=null,stage="devices";IDevices enumerator=null;IDeviceCollection devices=null;
    try {
      var family=Processes(root);enumerator=(IDevices)new MMDeviceEnumerator();enumerator.EnumAudioEndpoints(0,1,out devices);
      uint count;devices.GetCount(out count);
      for(uint d=0;d<count;d++) {
        IDevice device=null;object activated=null;ISessions sessions=null;
        try {
          stage="activate";devices.Item(d,out device);Guid iid=typeof(IManager).GUID;device.Activate(ref iid,23,IntPtr.Zero,out activated);
          stage="enumerate sessions";
          ((IManager)activated).GetSessionEnumerator(out sessions);int n;sessions.GetCount(out n);
          for(int i=0;i<n;i++) {
            object rawControl=null;
            try { stage="session control";sessions.GetSession(i,out rawControl);var control=(IControl)rawControl;uint pid;control.GetProcessId(out pid);if(!family.Contains(pid))continue;
              stage="session volume";var volume=(IVolume)rawControl;float before,actual;volume.GetMasterVolume(out before);Guid context=Guid.Empty;
              if(Math.Abs(before-percent/100f)>.0001f)volume.SetMasterVolume(percent/100f,ref context);
              volume.GetMasterVolume(out actual);matches.Add(new {pid=pid,volume=actual});
            } catch(COMException e){error="Audio session error: "+e.ErrorCode;}finally{Release(rawControl);}
          }
        }catch(COMException e){error="Audio device error: "+e.ErrorCode;}finally{Release(sessions);Release(activated);Release(device);}
      }
    }catch(Exception e){error=stage+": "+e.GetType().Name;}finally{Release(devices);Release(enumerator);}
    return new JavaScriptSerializer().Serialize(new {requested=percent,sessions=matches,error=error});
  }
}
