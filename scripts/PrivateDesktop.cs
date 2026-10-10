using System;
using System.IO;
using System.Text;
using System.Runtime.InteropServices;
using System.Security.Principal;

// A disposable Windows desktop for integration tests. NEVER switches the input
// desktop, sends input, or captures the user's screen. Children inherit this desktop.
public static class PrivateDesktop {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct Startup {
    public int cb; public string reserved,desktop,title; public int x,y,w,h,cols,rows,fill,flags; public short show,bytes; public IntPtr reserved2,input,output,error;
  }
  [StructLayout(LayoutKind.Sequential)] struct ProcessInfo { public IntPtr process,thread; public uint pid,tid; }
  [StructLayout(LayoutKind.Sequential)] struct BasicLimit { public long processTime,jobTime; public uint flags; public UIntPtr minWorking,maxWorking; public uint processes; public UIntPtr affinity; public uint priority,scheduling; }
  [StructLayout(LayoutKind.Sequential)] struct IoCounters { public ulong a,b,c,d,e,f; }
  [StructLayout(LayoutKind.Sequential)] struct ExtendedLimit { public BasicLimit basic; public IoCounters io; public UIntPtr processMemory,jobMemory,peakProcess,peakJob; }
  [DllImport("user32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateDesktop(string name,IntPtr device,IntPtr mode,uint flags,uint access,IntPtr security);
  [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr desktop);
  [DllImport("user32.dll")] static extern IntPtr GetThreadDesktop(uint thread);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("user32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool GetUserObjectInformation(IntPtr handle,int index,StringBuilder value,int length,out int needed);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcess(string app,StringBuilder command,IntPtr processSecurity,IntPtr threadSecurity,bool inherit,uint flags,IntPtr environment,string directory,ref Startup startup,out ProcessInfo process);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern IntPtr CreateJobObject(IntPtr attributes,string name);
  [DllImport("kernel32.dll")] static extern bool SetInformationJobObject(IntPtr job,int info,ref ExtendedLimit data,int length);
  [DllImport("kernel32.dll")] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
  [DllImport("kernel32.dll")] static extern uint ResumeThread(IntPtr thread);
  [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr handle,uint ms);
  [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr process,out uint code);
  [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr process,uint code);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  [StructLayout(LayoutKind.Sequential)] struct SecurityAttributes {public int length;public IntPtr descriptor;public bool inherit;}
  [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool ConvertStringSecurityDescriptorToSecurityDescriptor(string text,uint revision,out IntPtr descriptor,out uint length);
  [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr value);
  [DllImport("user32.dll",CharSet=CharSet.Unicode,SetLastError=true,EntryPoint="CreateDesktopW")] static extern IntPtr CreateTestDesktop(string name,IntPtr device,IntPtr mode,uint flags,uint access,ref SecurityAttributes security);
  static bool Check() {
    string expected=Environment.GetEnvironmentVariable("BLITZ_PRIVATE_DESKTOP");
    if(expected==null || !expected.StartsWith("BlitzTest-"))return false;
    int needed;var name=new StringBuilder(256);
    return GetUserObjectInformation(GetThreadDesktop(GetCurrentThreadId()),2,name,512,out needed) && name.ToString()==expected;
  }
  public static int Main(string[] args) {
    if(args.Length==1 && args[0]=="--check")return Check()?0:9;
    if(args.Length!=2 || !File.Exists(args[0]) || !File.Exists(args[1]) || args[0].Contains("\"") || args[1].Contains("\""))return 2;
    string name="BlitzTest-"+Guid.NewGuid().ToString("N");
    // Only this newly created, inactive test desktop admits AppContainer GUI
    // processes. Never change WinSta0 or the user's input desktop permissions.
    IntPtr descriptor;uint descriptorLength;
    string user=WindowsIdentity.GetCurrent().User.Value;
    if(!ConvertStringSecurityDescriptorToSecurityDescriptor("D:(A;;GA;;;"+user+")(A;;GA;;;AC)S:(ML;;NW;;;LW)",1,out descriptor,out descriptorLength))return 3;
    var security=new SecurityAttributes{length=Marshal.SizeOf(typeof(SecurityAttributes)),descriptor=descriptor,inherit=false};
    IntPtr desktop=CreateTestDesktop(name,IntPtr.Zero,IntPtr.Zero,0,0x000F01FF,ref security);LocalFree(descriptor);
    if(desktop==IntPtr.Zero){Console.Error.WriteLine("Cannot create isolated desktop: "+Marshal.GetLastWin32Error());return 3;}
    IntPtr job=CreateJobObject(IntPtr.Zero,null);var limit=new ExtendedLimit();limit.basic.flags=0x2000;
    if(job==IntPtr.Zero || !SetInformationJobObject(job,9,ref limit,Marshal.SizeOf(limit)))return 4;
    Environment.SetEnvironmentVariable("BLITZ_PRIVATE_DESKTOP",name);
    var startup=new Startup();startup.cb=Marshal.SizeOf(startup);startup.desktop="WinSta0\\"+name;
    ProcessInfo child;
    try {
      if(!CreateProcess(args[0],new StringBuilder("\""+args[0]+"\" \""+args[1]+"\""),IntPtr.Zero,IntPtr.Zero,false,0x08000004,IntPtr.Zero,Path.GetDirectoryName(args[1]),ref startup,out child))throw new Exception("CreateProcess: "+Marshal.GetLastWin32Error());
      if(!AssignProcessToJobObject(job,child.process)){TerminateProcess(child.process,5);throw new Exception("Could not isolate test process tree");}
      ResumeThread(child.thread);CloseHandle(child.thread);
      Console.WriteLine("Test process started on a separate desktop; input desktop unchanged.");
      if(WaitForSingleObject(child.process,240000)!=0){CloseHandle(child.process);throw new Exception("Test timed out");}
      uint code;GetExitCodeProcess(child.process,out code);CloseHandle(child.process);Console.WriteLine("Private desktop test exit: "+code);return (int)code;
    } catch(Exception e){Console.Error.WriteLine(e.Message);return 6;}
    finally{CloseHandle(job);CloseDesktop(desktop);}
  }
}
