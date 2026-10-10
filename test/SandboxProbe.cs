using System;
using System.IO;
using System.Net;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
public static class SandboxProbe {
 [DllImport("advapi32.dll",SetLastError=true)] static extern bool OpenProcessToken(IntPtr process,uint rights,out IntPtr token);
 [DllImport("advapi32.dll",SetLastError=true)] static extern bool GetTokenInformation(IntPtr token,int kind,IntPtr data,int size,out int needed);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
 public static int Main(string[] args){
  var json=new JavaScriptSerializer();string dir=AppDomain.CurrentDomain.BaseDirectory;
  var config=json.Deserialize<System.Collections.Generic.Dictionary<string,object>>(File.ReadAllText(args[0]));
  string outside=(string)config["canary"];bool readBlocked=false,writeBlocked=false,childBlocked=false,networkBlocked=false;
  try{File.ReadAllText(outside);}catch(UnauthorizedAccessException){readBlocked=true;}
  try{File.WriteAllText(outside+".write","probe");}catch(UnauthorizedAccessException){writeBlocked=true;}
  try{using(var p=Process.Start(new ProcessStartInfo(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),"cmd.exe"),"/c exit 0"){UseShellExecute=false,CreateNoWindow=true})){p.WaitForExit();}}catch(System.ComponentModel.Win32Exception){childBlocked=true;}
  try{var request=WebRequest.Create("http://127.0.0.1:47699/");request.Timeout=1500;using(var response=request.GetResponse()){};}catch(WebException){networkBlocked=true;}
  IntPtr token;bool appContainer=false;
  if(OpenProcessToken(Process.GetCurrentProcess().Handle,8,out token)){IntPtr data=Marshal.AllocHGlobal(4);int needed;if(GetTokenInformation(token,29,data,4,out needed))appContainer=Marshal.ReadInt32(data)!=0;Marshal.FreeHGlobal(data);CloseHandle(token);}
  File.WriteAllText(Path.Combine(dir,"result.json"),json.Serialize(new{appContainer=appContainer,readBlocked=readBlocked,writeBlocked=writeBlocked,childBlocked=childBlocked,networkBlocked=networkBlocked,appData=Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),localAppData=Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)}));
  return appContainer&&readBlocked&&writeBlocked&&childBlocked&&networkBlocked?0:1;
 }
}
