using System;
using System.IO;
using System.Diagnostics;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using System.Text;
using System.Runtime.InteropServices;
using Microsoft.Win32;

// Shared by the signed updater and the setup/uninstall helper. No recursive
// deletion: only recorded application files, then empty directories, are removed.
public static class ManagedInstallation {
 [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access,bool inherit,int pid);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr process,uint flags,StringBuilder name,ref int size);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
 public static string Root(string value){
  string root=Path.GetFullPath(value).TrimEnd(Path.DirectorySeparatorChar);
  if(Path.GetPathRoot(root).TrimEnd(Path.DirectorySeparatorChar)==root)throw new Exception("A drive root cannot be an installation folder");
  for(var d=new DirectoryInfo(root);d!=null;d=d.Parent)if(d.Exists&&(d.Attributes&FileAttributes.ReparsePoint)!=0)throw new Exception("Installation path contains a junction or symbolic link");
  return root;
 }
 static bool Version(string value){return Regex.IsMatch(value,@"^\d{1,5}\.\d{1,5}\.\d{1,5}$");}
 static void NoLink(string file){try{if((File.GetAttributes(file)&FileAttributes.ReparsePoint)!=0)throw new Exception("Installation file is a symbolic link");}catch(FileNotFoundException){}catch(DirectoryNotFoundException){}}
 static string FilePath(string root,string relative){
  if(relative!="Dungeon Blitz Launcher.exe"&&!Regex.IsMatch(relative,@"^release/\d{1,5}\.\d{1,5}\.\d{1,5}/Dungeon Blitz Launcher-win32-x64/.+"))throw new Exception("Unexpected managed file");
  if(relative.Length>240||relative.Contains("\\")||relative.Contains(":"))throw new Exception("Invalid managed path");
  foreach(string part in relative.Split('/'))if(part.Length==0||part=="."||part==".."||part.EndsWith(".")||part.EndsWith(" ")||Regex.IsMatch(part,@"[\x00-\x1f]|^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)",RegexOptions.IgnoreCase))throw new Exception("Invalid managed path component");
  string file=Path.GetFullPath(Path.Combine(root,relative.Replace('/',Path.DirectorySeparatorChar)));
  if(!file.StartsWith(root+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))throw new Exception("Managed file escaped installation");
  Root(Path.GetDirectoryName(file));
  NoLink(file);
  return file;
 }
 public static void Check(string root){
  root=Root(root);
  foreach(var process in Process.GetProcesses())using(process){
   string executable=null;IntPtr handle=OpenProcess(0x1000,false,process.Id);
   if(handle!=IntPtr.Zero)try{var buffer=new StringBuilder(32768);int length=buffer.Capacity;if(QueryFullProcessImageName(handle,0,buffer,ref length))executable=buffer.ToString();}finally{CloseHandle(handle);}
   if(executable!=null&&Path.GetFullPath(executable).StartsWith(root+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)&&!Regex.IsMatch(executable.Substring(root.Length),@"^\\\.launcher-install\\unins\d+\.exe$",RegexOptions.IgnoreCase))throw new Exception("Close the installed Dungeon Blitz Launcher before installing or uninstalling. Your game will not be closed automatically.");
  }
 }
 public static void Record(string root,string version,System.Collections.IEnumerable files){
  root=Root(root);string state=Path.Combine(root,".launcher-install");
  if(!Directory.Exists(state)||!File.Exists(Path.Combine(state,"app-id.txt")))return; // Portable layouts have no Windows registration.
  Root(state);NoLink(Path.Combine(state,"app-id.txt"));if(!Version(version))throw new Exception("Invalid installation version");
  var paths=new List<string>();foreach(var item in files){var file=(Dictionary<string,object>)item;string relative=(string)file["path"];FilePath(root,relative);paths.Add(relative);}
  string ledger=Path.Combine(state,"files-"+version+".txt");
  NoLink(ledger);string temporary=Path.Combine(state,".files-"+Guid.NewGuid().ToString("N")+".new");
  try{using(var stream=new FileStream(temporary,FileMode.CreateNew,FileAccess.Write,FileShare.None))using(var writer=new StreamWriter(stream))foreach(string relative in paths)writer.WriteLine(relative);
   if(File.Exists(ledger))File.Replace(temporary,ledger,null);else File.Move(temporary,ledger);
  }finally{if(File.Exists(temporary))File.Delete(temporary);}
 }
 public static void RefreshVersion(string root,string version){
  root=Root(root);string state=Path.Combine(root,".launcher-install");if(!Directory.Exists(state)||!File.Exists(Path.Combine(state,"app-id.txt")))return;
  Root(state);NoLink(Path.Combine(state,"app-id.txt"));if(!Version(version))throw new Exception("Invalid installation version");
  string identity=File.ReadAllText(Path.Combine(state,"app-id.txt")).Trim();Guid id;
  if(!Guid.TryParse(identity,out id))return;
  // Only metadata on this exact registered installation is updated. Never run
  // a registry command, move profiles or touch another installed copy.
  using(var key=Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\{"+id.ToString().ToUpperInvariant()+"}_is1",true)){
   if(key==null||!string.Equals(key.GetValue("InstallLocation") as string,root+"\\",StringComparison.OrdinalIgnoreCase)||key.GetValue("DisplayName") as string!="Dungeon Blitz Launcher")return;
   key.SetValue("DisplayVersion",version,RegistryValueKind.String);
  }
 }
 public static void Cleanup(string root){
  root=Root(root);Check(root);string state=Path.Combine(root,".launcher-install");Root(state);
  string identity=Path.Combine(state,"app-id.txt");Guid id;
  NoLink(identity);if(!File.Exists(identity)||!Guid.TryParse(File.ReadAllText(identity).Trim(),out id))throw new Exception("Installation record is missing");
  string[] ledgers=Directory.GetFiles(state,"files-*.txt");if(ledgers.Length>1000)throw new Exception("Too many installation records");
  var files=new HashSet<string>(StringComparer.OrdinalIgnoreCase);var directories=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
  foreach(string ledger in ledgers){
   if(!Version(Path.GetFileNameWithoutExtension(ledger).Substring(6))||new FileInfo(ledger).Length>4000000||(File.GetAttributes(ledger)&FileAttributes.ReparsePoint)!=0)throw new Exception("Invalid installation record");
   foreach(string relative in File.ReadAllLines(ledger)){string file=FilePath(root,relative);files.Add(file);if(files.Count>100000)throw new Exception("Too many managed files");}
  }
  // Validate all paths before changing anything. Leave unknown files and all
  // account/settings data alone, even when the user chose a custom directory.
  string previous=Path.Combine(root,"Dungeon Blitz Launcher.previous.exe");if(File.Exists(previous)){FilePath(root,"Dungeon Blitz Launcher.exe");if((File.GetAttributes(previous)&FileAttributes.ReparsePoint)!=0)throw new Exception("Previous launcher is a link");files.Add(previous);}
  foreach(string file in files){for(string d=Path.GetDirectoryName(file);d!=root;d=Path.GetDirectoryName(d))directories.Add(d);if(File.Exists(file))File.Delete(file);}
  var ordered=new List<string>(directories);ordered.Sort((a,b)=>b.Length.CompareTo(a.Length));
  foreach(string directory in ordered)if(Directory.Exists(directory)&&Directory.GetFileSystemEntries(directory).Length==0)Directory.Delete(directory);
  foreach(string ledger in ledgers)File.Delete(ledger);
 }
}
public static class InstallMaintenance {
 public static int Main(string[] args){try{
  if(args.Length!=3||(args[0]!="check"&&args[0]!="cleanup"))throw new Exception("Invalid installation operation");
  if(args[0]=="check")ManagedInstallation.Check(args[1]);else ManagedInstallation.Cleanup(args[1]);
  File.WriteAllText(args[2],"");return 0;
 }catch(Exception error){if(args.Length==3)try{File.WriteAllText(args[2],error.Message);}catch{}return 1;}}
}
