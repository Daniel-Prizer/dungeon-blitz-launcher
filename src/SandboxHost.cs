using System;
using System.IO;
using System.Text;
using System.Threading;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Web.Script.Serialization;
using System.Collections.Generic;
using System.Security.Cryptography;

// Trusted, non-elevated launcher. No shell execution, game-controlled commands,
// inherited handles, global policy changes or unsandboxed fallback.
public static class SandboxHost {
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct Startup { public int cb;public string reserved,desktop,title;public int x,y,w,h,cols,rows,fill,flags;public short show,bytes;public IntPtr reserved2,input,output,error; }
  [StructLayout(LayoutKind.Sequential)] struct ExtendedStartup { public Startup startup;public IntPtr attributes; }
  [StructLayout(LayoutKind.Sequential)] struct ProcessInfo { public IntPtr process,thread;public uint pid,tid; }
  [StructLayout(LayoutKind.Sequential)] struct SidAttribute { public IntPtr sid;public uint attributes; }
  [StructLayout(LayoutKind.Sequential)] struct Capabilities { public IntPtr sid,capabilities;public uint count,reserved; }
  [StructLayout(LayoutKind.Sequential)] struct BasicLimit { public long processTime,jobTime;public uint flags;public UIntPtr minWorking,maxWorking;public uint processes;public UIntPtr affinity;public uint priority,scheduling; }
  [StructLayout(LayoutKind.Sequential)] struct IoCounters { public ulong a,b,c,d,e,f; }
  [StructLayout(LayoutKind.Sequential)] struct ExtendedLimit { public BasicLimit basic;public IoCounters io;public UIntPtr processMemory,jobMemory,peakProcess,peakJob; }
  [DllImport("userenv.dll",CharSet=CharSet.Unicode)] static extern int CreateAppContainerProfile(string name,string display,string description,IntPtr caps,uint count,out IntPtr sid);
  [DllImport("userenv.dll",CharSet=CharSet.Unicode)] static extern int DeriveAppContainerSidFromAppContainerName(string name,out IntPtr sid);
  [DllImport("advapi32.dll")] static extern IntPtr FreeSid(IntPtr sid);
  [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool ConvertStringSidToSid(string text,out IntPtr sid);
  [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr value);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool InitializeProcThreadAttributeList(IntPtr list,int count,uint flags,ref IntPtr length);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool UpdateProcThreadAttribute(IntPtr list,uint flags,IntPtr attribute,IntPtr value,IntPtr size,IntPtr previous,IntPtr returned);
  [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr list);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcess(string app,StringBuilder command,IntPtr processSecurity,IntPtr threadSecurity,bool inherit,uint flags,IntPtr environment,string directory,ref ExtendedStartup startup,out ProcessInfo process);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern IntPtr CreateJobObject(IntPtr security,string name);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int info,ref ExtendedLimit data,int length);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
  [DllImport("kernel32.dll")] static extern uint ResumeThread(IntPtr thread);
  [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr handle,uint ms);
  [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr process,out uint code);
  [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr process,uint code);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  delegate bool EnumProc(IntPtr window,IntPtr value);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback,IntPtr value);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window,out uint pid);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
  [StructLayout(LayoutKind.Sequential)] struct Rect {public int left,top,right,bottom;}
  [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr window,out Rect rect);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr window,StringBuilder title,int length);
  [DllImport("user32.dll")]static extern IntPtr OpenInputDesktop(uint flags,bool inherit,uint access);
  [DllImport("user32.dll")]static extern bool CloseDesktop(IntPtr desktop);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern bool GetUserObjectInformation(IntPtr handle,int index,StringBuilder value,int size,out int needed);
  static bool PrivateDesktop(string expected){if(expected==null||!System.Text.RegularExpressions.Regex.IsMatch(expected,@"^BlitzTest-[a-f0-9]{32}$"))return false;IntPtr input=OpenInputDesktop(0,false,1);if(input==IntPtr.Zero)return false;try{int needed;var name=new StringBuilder(256);return GetUserObjectInformation(input,2,name,512,out needed)&&name.ToString()!=expected;}finally{CloseDesktop(input);}}
  static string CheckedPath(string value){string full=Path.GetFullPath(value);var current=new DirectoryInfo(Directory.Exists(full)?full:Path.GetDirectoryName(full));for(;current!=null;current=current.Parent)if(current.Exists&&(current.Attributes&FileAttributes.ReparsePoint)!=0)throw new Exception("Sandbox path contains a reparse point");if(File.Exists(full)&&(File.GetAttributes(full)&FileAttributes.ReparsePoint)!=0)throw new Exception("Sandbox file is a link");return full;}
  static void Grant(string directory,SecurityIdentifier sid,FileSystemRights rights) {
    var info=new DirectoryInfo(directory);var acl=info.GetAccessControl();
    acl.AddAccessRule(new FileSystemAccessRule(sid,rights,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));info.SetAccessControl(acl);
  }
  static string Quote(string value) { if(value.Contains("\"")||value.Contains("\r")||value.Contains("\n"))throw new Exception("Invalid process argument");return "\""+value+"\""; }
  static IntPtr Alloc(object value) { IntPtr p=Marshal.AllocHGlobal(Marshal.SizeOf(value));Marshal.StructureToPtr(value,p,false);return p; }
  static volatile bool closing;
  public static int Main(string[] args) {
    IntPtr sid=IntPtr.Zero,internet=IntPtr.Zero,attributes=IntPtr.Zero,capsMemory=IntPtr.Zero,sidMemory=IntPtr.Zero,childPolicy=IntPtr.Zero,job=IntPtr.Zero,environment=IntPtr.Zero;
    ProcessInfo child=new ProcessInfo();
    try {
      if(args.Length!=1)throw new Exception("One trusted configuration file required");
      var json=new JavaScriptSerializer();var config=json.Deserialize<System.Collections.Generic.Dictionary<string,object>>(File.ReadAllText(args[0]));
      string executable=CheckedPath((string)config["executable"]),content=(string)config["content"],profile=(string)config["profile"],data=CheckedPath((string)config["dataDirectory"]);
      bool network=config.ContainsKey("internet")&&(bool)config["internet"];
      if(!System.Text.RegularExpressions.Regex.IsMatch(profile,@"^Blitz\.Projector\.[A-Za-z0-9.-]{1,80}$"))throw new Exception("Invalid sandbox identity");
      if(!File.Exists(executable)||!executable.EndsWith("flashplayer_32_sa.exe",StringComparison.OrdinalIgnoreCase))throw new Exception("Verified projector required");
      Directory.CreateDirectory(data);
      string desktop=Environment.GetEnvironmentVariable("BLITZ_PRIVATE_DESKTOP");if(desktop!=null&&!PrivateDesktop(desktop))throw new Exception("Test desktop is not verified inactive");
      using(var sha=SHA256.Create())using(var file=File.OpenRead(executable)){string hash=BitConverter.ToString(sha.ComputeHash(file)).Replace("-","").ToLowerInvariant();if(hash!="a4b333ac1da12026989549015303d82231982838bccfb544ba5fd188746066f0"&&!(desktop!=null&&config.ContainsKey("probe")&&(bool)config["probe"]))throw new Exception("Projector integrity verification failed");}
      int result=CreateAppContainerProfile(profile,profile,"Isolated Dungeon Blitz Flash game",IntPtr.Zero,0,out sid);
      if(result<0 && DeriveAppContainerSidFromAppContainerName(profile,out sid)<0)Marshal.ThrowExceptionForHR(result);
      var identity=new SecurityIdentifier(sid);
      Grant(Path.GetDirectoryName(executable),identity,FileSystemRights.ReadAndExecute);
      Grant(data,identity,FileSystemRights.Modify);
      var caps=new Capabilities();caps.sid=sid;
      if(network){if(!ConvertStringSidToSid("S-1-15-3-1",out internet))throw new Exception("Internet capability unavailable");sidMemory=Alloc(new SidAttribute{sid=internet,attributes=4});caps.capabilities=sidMemory;caps.count=1;}
      capsMemory=Alloc(caps);IntPtr length=IntPtr.Zero;InitializeProcThreadAttributeList(IntPtr.Zero,2,0,ref length);attributes=Marshal.AllocHGlobal(length);
      if(!InitializeProcThreadAttributeList(attributes,2,0,ref length))throw new Exception("Sandbox attributes unavailable");
      if(!UpdateProcThreadAttribute(attributes,0,new IntPtr(0x20009),capsMemory,new IntPtr(Marshal.SizeOf(caps)),IntPtr.Zero,IntPtr.Zero))throw new Exception("AppContainer policy unavailable");
      childPolicy=Marshal.AllocHGlobal(4);Marshal.WriteInt32(childPolicy,1);
      if(!UpdateProcThreadAttribute(attributes,0,new IntPtr(0x2000e),childPolicy,new IntPtr(4),IntPtr.Zero,IntPtr.Zero))throw new Exception("Child process policy unavailable");
      job=CreateJobObject(IntPtr.Zero,null);var limit=new ExtendedLimit();limit.basic.flags=0x2000|8;limit.basic.processes=1;
      if(job==IntPtr.Zero||!SetInformationJobObject(job,9,ref limit,Marshal.SizeOf(limit)))throw new Exception("Sandbox job unavailable");
      var startup=new ExtendedStartup();startup.startup.cb=Marshal.SizeOf(startup);startup.attributes=attributes;
      if(desktop!=null)startup.startup.desktop="WinSta0\\"+desktop;
      var clean=new SortedDictionary<string,string>(StringComparer.OrdinalIgnoreCase);string windows=Environment.GetFolderPath(Environment.SpecialFolder.Windows),storage=Path.Combine(data,"profile"),temp=Path.Combine(data,"temp");Directory.CreateDirectory(temp);Directory.CreateDirectory(Path.Combine(storage,"AppData","Roaming"));Directory.CreateDirectory(Path.Combine(storage,"AppData","Local"));
      Directory.CreateDirectory(Path.Combine(storage,"AppData","LocalLow"));Directory.CreateDirectory(Path.Combine(storage,"AppData","Local","Packages",profile,"AC"));
      clean["SystemRoot"]=windows;clean["WINDIR"]=windows;clean["PATH"]=Path.Combine(windows,"System32");clean["TEMP"]=temp;clean["TMP"]=temp;clean["USERPROFILE"]=storage;clean["APPDATA"]=Path.Combine(storage,"AppData","Roaming");clean["LOCALAPPDATA"]=Path.Combine(storage,"AppData","Local");
      var block=new StringBuilder();foreach(var pair in clean)block.Append(pair.Key+"="+pair.Value+'\0');block.Append('\0');environment=Marshal.StringToHGlobalUni(block.ToString());
      if(!CreateProcess(executable,new StringBuilder(Quote(executable)+(content.Length==0?"":" "+Quote(content))),IntPtr.Zero,IntPtr.Zero,false,0x80404,environment,data,ref startup,out child))throw new Exception("Sandbox launch failed: "+Marshal.GetLastWin32Error());
      if(!AssignProcessToJobObject(job,child.process))throw new Exception("Sandbox job assignment failed");
      ResumeThread(child.thread);CloseHandle(child.thread);child.thread=IntPtr.Zero;
      Console.WriteLine("SANDBOX "+json.Serialize(new{pid=child.pid,appContainer=true,childProcesses=false,internet=network,profile=profile}));Console.Out.Flush();
      var reader=new Thread(()=>{while(Console.ReadLine()!=null){}closing=true;});reader.IsBackground=true;reader.Start();
      bool reported=false;DateTime deadline=DateTime.UtcNow.AddSeconds(20);
      while(!closing&&WaitForSingleObject(child.process,100)==258){
        if(!reported){IntPtr window=IntPtr.Zero;EnumWindows((handle,value)=>{uint pid;Rect rect;GetWindowThreadProcessId(handle,out pid);if(pid==child.pid&&IsWindowVisible(handle)&&GetClientRect(handle,out rect)&&rect.right>=200&&rect.bottom>=200){window=handle;return false;}return true;},IntPtr.Zero);
          if(window!=IntPtr.Zero){var title=new StringBuilder(256);GetWindowText(window,title,256);Console.WriteLine("READY "+json.Serialize(new{pid=child.pid,hwnd=window.ToInt64().ToString(),title=title.ToString()}));Console.Out.Flush();reported=true;}
          else if(DateTime.UtcNow>deadline)throw new Exception("Projector did not create a sandboxed game window");
        }
      }
      if(closing)return 0;uint code;GetExitCodeProcess(child.process,out code);Console.WriteLine("EXIT "+code);return (int)code;
    } catch(Exception error){Console.Error.WriteLine(error.Message);return 1;}
    finally{if(child.process!=IntPtr.Zero){TerminateProcess(child.process,0);CloseHandle(child.process);}if(child.thread!=IntPtr.Zero)CloseHandle(child.thread);if(job!=IntPtr.Zero)CloseHandle(job);if(attributes!=IntPtr.Zero){DeleteProcThreadAttributeList(attributes);Marshal.FreeHGlobal(attributes);}foreach(IntPtr p in new[]{capsMemory,sidMemory,childPolicy,environment})if(p!=IntPtr.Zero)Marshal.FreeHGlobal(p);if(internet!=IntPtr.Zero)LocalFree(internet);if(sid!=IntPtr.Zero)FreeSid(sid);}
  }
}
