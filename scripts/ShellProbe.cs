using System;
using System.Runtime.InteropServices;

// Read-only capability check: creates no window, changes no HWND/property,
// never calls MarkFullscreenWindow, and does not manipulate Explorer's taskbar.
public static class ShellProbe {
  [ComImport,Guid("56FDF344-FD6D-11D0-958A-006097C9A090")] class TaskbarList {}
  [ComImport,Guid("602D4995-B13A-429B-A66E-1935E44F4317"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface ITaskbarList2 {
    [PreserveSig] int HrInit();
    [PreserveSig] int AddTab(IntPtr hwnd);
    [PreserveSig] int DeleteTab(IntPtr hwnd);
    [PreserveSig] int ActivateTab(IntPtr hwnd);
    [PreserveSig] int SetActiveAlt(IntPtr hwnd);
    [PreserveSig] int MarkFullscreenWindow(IntPtr hwnd,[MarshalAs(UnmanagedType.Bool)] bool fullscreen);
  }
  [STAThread] public static int Main(){
    ITaskbarList2 taskbar=null;
    try{taskbar=(ITaskbarList2)new TaskbarList();int result=taskbar.HrInit();Console.WriteLine("Read-only Shell fullscreen API initialization: "+result);return result==0?0:1;}
    catch(COMException e){Console.WriteLine("Read-only Shell initialization error: "+e.ErrorCode);return 1;}
    finally{if(taskbar!=null)Marshal.FinalReleaseComObject(taskbar);}
  }
}
