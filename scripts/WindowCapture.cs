using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text;

// Test-only: capture one owned launcher HWND on the guarded inactive desktop.
// No desktop DC, input, focus changes, screen capture or arbitrary HWND lookup.
static class WindowCapture {
  [StructLayout(LayoutKind.Sequential)] struct Rect {public int left,top,right,bottom;}
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window,out uint pid);
  [DllImport("user32.dll")] static extern IntPtr GetThreadDesktop(uint thread);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern bool GetUserObjectInformation(IntPtr handle,int index,StringBuilder value,int length,out int needed);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr window,out Rect rect);
  [DllImport("user32.dll")] static extern bool PrintWindow(IntPtr window,IntPtr dc,uint flags);
  static string Desktop(uint thread){var value=new StringBuilder(256);int needed;return GetUserObjectInformation(GetThreadDesktop(thread),2,value,512,out needed)?value.ToString():"";}
  static int Main(string[] args){
    string expected=Environment.GetEnvironmentVariable("BLITZ_PRIVATE_DESKTOP");
    if(args.Length!=3||expected==null||!expected.StartsWith("BlitzTest-")||Desktop(GetCurrentThreadId())!=expected)return 9;
    IntPtr window=new IntPtr(long.Parse(args[0]));uint owner;uint thread=GetWindowThreadProcessId(window,out owner);
    if(owner!=uint.Parse(args[1])||Desktop(thread)!=expected)return 10;
    Rect rect;if(!GetWindowRect(window,out rect))return 11;
    int width=rect.right-rect.left,height=rect.bottom-rect.top;if(width<1||height<1||width>4096||height>4096)return 12;
    using(var bitmap=new Bitmap(width,height))using(var graphics=Graphics.FromImage(bitmap)){
      IntPtr dc=graphics.GetHdc();bool ok;try{ok=PrintWindow(window,dc,2);}finally{graphics.ReleaseHdc(dc);}
      if(!ok)return 13;bitmap.Save(args[2],ImageFormat.Png);
    }
    return 0;
  }
}
