using System;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
using System.Collections.Concurrent;

// Only owns and positions the game HWND supplied by the launcher process.
// No network access, arbitrary commands, or remote IPC surface.
public static class NativeHost {
  [ComImport, Guid("56FDF344-FD6D-11D0-958A-006097C9A090")] class TaskbarList {}
  [ComImport, Guid("602D4995-B13A-429B-A66E-1935E44F4317"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface ITaskbarList2 {
    [PreserveSig] int HrInit();
    [PreserveSig] int AddTab(IntPtr window);
    [PreserveSig] int DeleteTab(IntPtr window);
    [PreserveSig] int ActivateTab(IntPtr window);
    [PreserveSig] int SetActiveAlt(IntPtr window);
    [PreserveSig] int MarkFullscreenWindow(IntPtr window, [MarshalAs(UnmanagedType.Bool)] bool fullscreen);
  }
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr hwnd, uint command);
  [StructLayout(LayoutKind.Sequential)] struct Point { public int x, y; }
  [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr hwnd, ref Point point);
  [DllImport("user32.dll")] static extern IntPtr GetWindowLongPtr(IntPtr hwnd, int index);
  [DllImport("user32.dll")] static extern IntPtr SetWindowLongPtr(IntPtr hwnd, int index, IntPtr value);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr hwnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hwnd, int cmd);
  [DllImport("user32.dll")] static extern uint GetDpiForWindow(IntPtr hwnd);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
  [StructLayout(LayoutKind.Sequential)] struct Rect { public int left,top,right,bottom; }
  [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr hwnd,out Rect rect);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hwnd,out Rect rect);
  [DllImport("user32.dll",SetLastError=true)] static extern IntPtr SendMessageTimeout(IntPtr hwnd,uint message,IntPtr w,IntPtr l,uint flags,uint timeout,out IntPtr result);
  [DllImport("user32.dll",EntryPoint="ClipCursor",SetLastError=true)] static extern bool Clip(ref Rect rect);
  [DllImport("user32.dll",EntryPoint="ClipCursor")] static extern bool Unclip(IntPtr rect);
  [DllImport("user32.dll")] static extern bool GetClipCursor(out Rect rect);
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern bool SetProp(IntPtr hwnd,string name,IntPtr data);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern IntPtr RemoveProp(IntPtr hwnd,string name);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern IntPtr GetProp(IntPtr hwnd,string name);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern IntPtr FindWindow(string className,string title);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool IsChild(IntPtr parent, IntPtr child);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
  delegate IntPtr HookProc(int code, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int id, HookProc proc, IntPtr module, uint thread);
  [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hook);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr w, IntPtr l);
  [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string name);
  static IntPtr parent, child, hook;
  static bool visible, fullscreen;
  static int viewX,viewY,viewWidth,viewHeight;
  static Rect ViewRectangle() {
    double scale=GetDpiForWindow(parent)/96.0;if(scale<=0)scale=1;
    Point origin=new Point{x=(int)(viewX*scale),y=(int)(viewY*scale)};ClientToScreen(parent,ref origin);
    return new Rect{left=origin.x,top=origin.y,right=origin.x+(int)(viewWidth*scale),bottom=origin.y+(int)(viewHeight*scale)};
  }
  // Queries only our test HWND. No pointer/keyboard events or interactive move loop.
  static void ReportWindow() {
    Rect actual;GetWindowRect(child,out actual);Rect expected=ViewRectangle();
    var hits=new System.Collections.Generic.List<object>();
    foreach(int x in new[]{0,1,2,(actual.right-actual.left)/2,actual.right-actual.left-3,actual.right-actual.left-1})
      foreach(int y in new[]{0,1,(actual.bottom-actual.top)/2,actual.bottom-actual.top-1}) {
        IntPtr result;uint point=(((uint)(actual.top+y)&65535)<<16)|((uint)(actual.left+x)&65535);
        bool ok=SendMessageTimeout(child,0x84,IntPtr.Zero,new IntPtr(point),2,500,out result)!=IntPtr.Zero;
        hits.Add(new{x=x,y=y,ok=ok,hit=result.ToInt64()});
      }
    Rect cursorArea;bool cursorAreaValid=ConfinementRectangle(out cursorArea);
    Rect launcherClient;GetClientRect(parent,out launcherClient);Point launcherOrigin=new Point();ClientToScreen(parent,ref launcherOrigin);
    launcherClient.left+=launcherOrigin.x;launcherClient.right+=launcherOrigin.x;launcherClient.top+=launcherOrigin.y;launcherClient.bottom+=launcherOrigin.y;
    bool cursorAllowed=cursor.ShouldConfine(visible,IsWindow(parent)&&IsWindow(child)&&LauncherForeground());
    bool menuAllowed=cursor.ShouldConfine(visible,LauncherForeground(parent));
    bool gameAllowed=cursor.ShouldConfine(visible,LauncherForeground(child));
    bool externalAllowed=cursor.ShouldConfine(visible,LauncherForeground(IntPtr.Zero));
    uint cursorDpi=GetDpiForWindow(fullscreen?child:parent);
    bool nonRude=GetProp(child,"NonRudeHWND")!=IntPtr.Zero;
    Emit("WINDOWTEST "+new System.Web.Script.Serialization.JavaScriptSerializer().Serialize(new{actual=actual,expected=expected,hits=hits,cursorArea=cursorArea,cursorAreaValid=cursorAreaValid,launcherClient=launcherClient,cursorAllowed=cursorAllowed,menuAllowed=menuAllowed,gameAllowed=gameAllowed,externalAllowed=externalAllowed,cursorDpi=cursorDpi,fullscreen=fullscreen,dryRun=dryRun,nonRude=nonRude,visibilityTransitions=visibilityTransitions}));
  }
  static readonly CursorLockState cursor=new CursorLockState();
  static bool clipped,dryRun;static Rect ownClip;static string lastCursor;
  static int visibilityTransitions;
  static readonly ConcurrentQueue<string> commands=new ConcurrentQueue<string>();
  static volatile int volume=100;
  static volatile bool audioRunning=true;
  static readonly AutoResetEvent audioChanged=new AutoResetEvent(false);
  static bool LauncherForeground(IntPtr fg) { return fg!=IntPtr.Zero&&(fg==child||IsChild(child,fg)||fg==parent||IsChild(parent,fg)); }
  static bool LauncherForeground() { return LauncherForeground(GetForegroundWindow()); }
  static bool ConfinementRectangle(out Rect area) {
    // In windowed mode include the launcher's menu, preserving the side/bottom
    // inset. Fullscreen has no menu and retains the game inset on every edge.
    IntPtr target=fullscreen?child:parent;area=new Rect();Rect client;Point origin=new Point();
    if(!GetClientRect(target,out client)||!ClientToScreen(target,ref origin)||client.right<=0||client.bottom<=0)return false;
    var bounds=CursorLockState.Bounds(client.right,client.bottom,GetDpiForWindow(target)/96.0,!fullscreen);
    area=new Rect{left=origin.x+bounds.left,top=origin.y+bounds.top,right=origin.x+bounds.right,bottom=origin.y+bounds.bottom};return true;
  }
  static void UpdateCursor() {
    bool active=cursor.ShouldConfine(visible,IsWindow(parent)&&IsWindow(child)&&LauncherForeground());
    if(active) {
      Rect rect;
      if(ConfinementRectangle(out rect)) {
        // Test windows run on another desktop, but the user's cursor is shared.
        // Never call ClipCursor in test mode, even on the inactive desktop.
        if(!dryRun) { clipped=Clip(ref rect);ownClip=rect;active=clipped; }
      } else active=false;
    }
    if(!active&&clipped){
      Rect current;
      // Do not remove a newer clipping rectangle installed by another app.
      if(GetClipCursor(out current)&&current.left==ownClip.left&&current.top==ownClip.top&&current.right==ownClip.right&&current.bottom==ownClip.bottom)Unclip(IntPtr.Zero);
      clipped=false;
    }
    string status="CURSOR "+(cursor.Enabled?"1":"0")+" "+(cursor.Suspended?"1":"0")+" "+(active?"1":"0")+" "+(dryRun?"1":"0");
    if(lastCursor!=status){lastCursor=status;Emit(status);}
  }
  static HookProc callback = Keyboard;
  // The focused surface is a separate HWND, so marking only its launcher owner
  // fullscreen leaves Explorer's taskbar above the game. Notify the Shell about
  // this HWND; never hide the system taskbar or make the app always-on-top.
  static void MarkGameFullscreen(ITaskbarList2 taskbar, bool value, int initResult) {
    if(value)RemoveProp(child,"NonRudeHWND");
    else SetProp(child,"NonRudeHWND",new IntPtr(1));
    int result=initResult;
    try { if(taskbar!=null && initResult>=0)result=taskbar.MarkFullscreenWindow(child,value); }
    catch(COMException e){result=e.ErrorCode;}
    Emit("FULLSCREEN " +(value?"1":"0")+" "+result+" "+child.ToInt64()+" "+initResult+" "+(FindWindow("Shell_TrayWnd",null)!=IntPtr.Zero?"1":"0")+" "+(GetProp(child,"NonRudeHWND")!=IntPtr.Zero?"1":"0"));
  }
  static void Emit(string message) { Console.WriteLine(message); Console.Out.Flush(); }
  static IntPtr Keyboard(int code, IntPtr w, IntPtr l) {
    if(code>=0) {
      int message=w.ToInt32();bool down=message==0x100||message==0x104;
      if(down||message==0x101||message==0x105) {
        bool handled=cursor.Key(Marshal.ReadInt32(l),down,visible&&LauncherForeground());UpdateCursor();
        if(handled)return new IntPtr(1);
      }
    }
    if (code >= 0 && visible && (w.ToInt32() == 0x100 || w.ToInt32() == 0x104)) {
      IntPtr fg = GetForegroundWindow();
      if (fg == parent || fg == child || IsChild(child, fg)) {
        int key = Marshal.ReadInt32(l);
        bool ctrl = (GetAsyncKeyState(0x11) & 0x8000) != 0;
        string action = null;
        if (key == 0x7A) action = "fullscreen";
        else if (key == 0x1B && fullscreen) action = "exit-fullscreen";
        else if (ctrl && key == 0xBC) action = "settings";
        if (action != null) { Emit("KEY " + action); return new IntPtr(1); }
      }
    }
    return CallNextHookEx(hook, code, w, l);
  }
  [STAThread] public static int Main(string[] args) {
    if (args.Length != 2) return 2;
    parent = new IntPtr(long.Parse(args[0])); child = new IntPtr(long.Parse(args[1]));
    if (!IsWindow(parent) || !IsWindow(child)) return 3;
    dryRun=Environment.GetEnvironmentVariable("BLITZ_HOST_TEST")=="1";
    uint gamePid;GetWindowThreadProcessId(child,out gamePid);
    long style = GetWindowLongPtr(child, -16).ToInt64();
    // Keep Chromium's window top-level, with its own activation and input queue.
    // Reparenting it under a foreign STATIC window made renderer focus look valid
    // while Windows keyboard focus belonged to the wrapper instead of Chromium.
    // An owned popup stays above the launcher in exactly the viewport rectangle,
    // hides with its owner, and preserves native mouse/keyboard/clipboard handling.
    SetWindowLongPtr(child, -16, new IntPtr((style | 0x80000000L) & ~0x40000000L & ~0x00CF0000L));
    long extended = GetWindowLongPtr(child, -20).ToInt64();
    SetWindowLongPtr(child, -20, new IntPtr((extended | 0x80L) & ~0x08040000L));
    SetWindowLongPtr(child, -8, parent); // GWLP_HWNDPARENT sets owner for a popup.
    if (GetWindow(child, 4) != parent) { Emit("ERROR Could not attach game window owner."); return 4; }
    hook = SetWindowsHookEx(13, callback, GetModuleHandle(null), 0);
    if(hook==IntPtr.Zero){Emit("ERROR Game shortcut hook could not start.");return 5;}
    Emit("READY");
    var input = new Thread(() => {string line;while((line=Console.ReadLine())!=null)commands.Enqueue(line);commands.Enqueue("QUIT");});
    input.IsBackground=true;input.Start();
    ITaskbarList2 taskbar=null;int initResult=unchecked((int)0x80004005);bool? marked=null;bool wasGameForeground=false;
    try{taskbar=(ITaskbarList2)new TaskbarList();initResult=taskbar.HrInit();}catch(COMException e){initResult=e.ErrorCode;}
    // Audio COM work runs on its own MTA thread so device stalls cannot block
    // cursor release or the low-level keyboard hook's message pump.
    var audioThread=new Thread(()=>{
      string lastAudio=null;
      while(audioRunning&&IsWindow(child)) {
        string audio=GameAudio.Apply(gamePid,volume);if(audio!=lastAudio){lastAudio=audio;Emit("AUDIO "+audio);}
        audioChanged.WaitOne(1000);
      }
    });audioThread.SetApartmentState(ApartmentState.MTA);audioThread.IsBackground=true;audioThread.Start();
    var timer=new System.Windows.Forms.Timer();timer.Interval=15;
    timer.Tick+=(sender,eventArgs)=>{
      string line;int budget=100;
      while (budget-->0&&commands.TryDequeue(out line)) {
        string[] p = line.Split(' ');
        try {
          if (p[0] == "BOUNDS" && p.Length == 9) {
            viewX=int.Parse(p[1]);viewY=int.Parse(p[2]);viewWidth=int.Parse(p[3]);viewHeight=int.Parse(p[4]);
            double scale = GetDpiForWindow(parent) / 96.0; if (scale <= 0) scale = 1;
            visible = p[5] == "1"; fullscreen = p[6] == "1";
            int width = (int)(int.Parse(p[3])*scale), height = (int)(int.Parse(p[4])*scale);
            Point origin = new Point { x = (int)(int.Parse(p[1])*scale), y = (int)(int.Parse(p[2])*scale) };
            ClientToScreen(parent, ref origin);
            // Chromium owns sizing on its own window thread. Cross-process
            // sizing races its cached widget bounds and can restore an old
            // renderer size during zoom. This helper owns position only.
            SetWindowPos(child, IntPtr.Zero, origin.x, origin.y, width, height, 0x0010 | 0x0004 | 0x0200 | 0x0001);
            bool shellFullscreen=fullscreen && visible;
            // Avoid redundant show operations around Shell classification.
            // Show only on an actual visibility transition, and
            // notify after showing/placing the focused game's own HWND.
            if(IsWindowVisible(child)!=visible){ShowWindow(child, visible ? 4 : 0);visibilityTransitions++;}
            if(marked!=shellFullscreen||shellFullscreen){MarkGameFullscreen(taskbar,shellFullscreen,initResult);marked=shellFullscreen;}
            Emit("PLACED "+p[8]);
          } else if (p[0] == "ACTIVATE" && visible && fullscreen) {
            IntPtr foreground=GetForegroundWindow();
            if(foreground==child || IsChild(child,foreground))MarkGameFullscreen(taskbar,true,initResult);
          } else if(p[0]=="CURSOR"&&p.Length==3) {
            int shortcut=int.Parse(p[2]);
            if(CursorLockState.ValidShortcut(shortcut))cursor.Configure(p[1]=="1",shortcut);
          } else if(p[0]=="TOGGLECURSOR")cursor.Toggle();
          else if(p[0]=="VOLUME"&&p.Length==2) {int requested=int.Parse(p[1]);if(requested>=0&&requested<=100){volume=requested;audioChanged.Set();}}
          else if(p[0]=="TESTKEY"&&p.Length==4&&dryRun)cursor.Key(int.Parse(p[1]),p[2]=="1",p[3]=="1");
          else if(p[0]=="TESTWINDOW"&&dryRun)ReportWindow();
          else if (p[0] == "QUIT") {visible=false;UpdateCursor();Application.Exit();return;}
        } catch { Emit("ERROR Invalid host command."); }
      }
      if(!IsWindow(parent)||!IsWindow(child)){visible=false;UpdateCursor();Application.Exit();return;}
      IntPtr currentForeground=GetForegroundWindow();
      bool gameForeground=visible&&(currentForeground==child||IsChild(child,currentForeground));
      if(gameForeground&&!wasGameForeground&&fullscreen)MarkGameFullscreen(taskbar,true,initResult);
      wasGameForeground=gameForeground;
      UpdateCursor();
    };
    timer.Start();
    try { Application.Run(); } finally {
      timer.Stop();timer.Dispose();visible=false;UpdateCursor();audioRunning=false;audioChanged.Set();
      if(marked==true && IsWindow(child))MarkGameFullscreen(taskbar,false,initResult);
      if(taskbar!=null)Marshal.FinalReleaseComObject(taskbar);
      if(IsWindow(child))ShowWindow(child,0);
    }
    if (hook != IntPtr.Zero) UnhookWindowsHookEx(hook);
    return 0;
  }
}
