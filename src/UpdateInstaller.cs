using System;
using System.IO;
using System.IO.Compression;
using System.Diagnostics;
using System.Text.RegularExpressions;
using System.Security.Cryptography;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using System.Security.AccessControl;
using System.Security.Principal;
public static class UpdateInstaller {
 static void Preflight(string directory){directory=CheckedRoot(directory);if(!Directory.Exists(directory))throw new Exception("Installation folder is missing");string probe=Path.Combine(directory,".blitz-update-check-"+Guid.NewGuid().ToString("N"));try{using(var stream=new FileStream(probe,FileMode.CreateNew,FileAccess.Write,FileShare.None)){} }finally{if(File.Exists(probe))File.Delete(probe);}}
 static void Protect(string directory){
  directory=CheckedRoot(directory);Directory.CreateDirectory(directory);var acl=new DirectorySecurity();acl.SetAccessRuleProtection(true,false);
  foreach(var identity in new[]{WindowsIdentity.GetCurrent().User,new SecurityIdentifier(WellKnownSidType.LocalSystemSid,null)})acl.AddAccessRule(new FileSystemAccessRule(identity,FileSystemRights.FullControl,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));
  new DirectoryInfo(directory).SetAccessControl(acl);
 }
 static string CheckedRoot(string value){string root=Path.GetFullPath(value);DirectoryInfo info=new DirectoryInfo(root);for(;info!=null;info=info.Parent)if(info.Exists&&(info.Attributes&FileAttributes.ReparsePoint)!=0)throw new Exception("Update path contains a reparse point");return root;}
 static string Resolve(string root,string relative){if(relative.Contains("\\")||relative.Contains(":")||relative.StartsWith("/")||relative.Split('/').Length>20)throw new Exception("Invalid archive path");foreach(string part in relative.TrimEnd('/').Split('/'))if(part.Length==0||part=="."||part==".."||part.EndsWith(".")||part.EndsWith(" ")||Regex.IsMatch(part,@"^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)",RegexOptions.IgnoreCase))throw new Exception("Invalid archive component");string file=Path.GetFullPath(Path.Combine(root,relative.Replace('/',Path.DirectorySeparatorChar)));if(!file.StartsWith(root+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))throw new Exception("Archive escaped staging");return file;}
 static void Extract(string archive,string destination){
  destination=CheckedRoot(destination);if(Directory.Exists(destination))throw new Exception("Extraction destination must be new");
  using(var zip=ZipFile.OpenRead(archive)){if(zip.Entries.Count>10000)throw new Exception("Too many archive entries");long total=0;var seen=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
   foreach(var entry in zip.Entries){Resolve(destination,entry.FullName);if(!seen.Add(entry.FullName.TrimEnd('/'))||((entry.ExternalAttributes>>16)&0xf000)==0xa000)throw new Exception("Duplicate/link archive entry");total=checked(total+entry.Length);if(total>1800000000)throw new Exception("Archive too large");}
   Directory.CreateDirectory(destination);
   foreach(var entry in zip.Entries){string file=Resolve(destination,entry.FullName);if(entry.FullName.EndsWith("/")){Directory.CreateDirectory(file);continue;}Directory.CreateDirectory(Path.GetDirectoryName(file));using(var input=entry.Open())using(var output=new FileStream(file,FileMode.CreateNew,FileAccess.Write,FileShare.None)){var buffer=new byte[65536];long written=0;int count;while((count=input.Read(buffer,0,buffer.Length))>0){written=checked(written+count);if(written>entry.Length)throw new Exception("Archive expanded beyond declared length");output.Write(buffer,0,count);}if(written!=entry.Length)throw new Exception("Archive length mismatch");}}
  }
 }
 static string Hash(string file){using(var sha=SHA256.Create())using(var stream=File.OpenRead(file))return BitConverter.ToString(sha.ComputeHash(stream)).Replace("-","").ToLowerInvariant();}
 static void BootstrapCheck(string root,int allowed){
  root=ManagedInstallation.Root(root);if(allowed<=0)throw new Exception("Invalid setup update process");
  using(var process=Process.GetProcessById(allowed)){
   string executable=Path.GetFullPath(process.MainModule.FileName);
   ManagedInstallation.Root(Path.GetDirectoryName(executable));
   if(!executable.StartsWith(root+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)||!Regex.IsMatch(executable.Substring(root.Length),@"^\\release\\\d{1,5}\.\d{1,5}\.\d{1,5}\\Dungeon Blitz Launcher-win32-x64\\Dungeon Blitz Launcher\.exe$",RegexOptions.IgnoreCase))throw new Exception("Setup update process is outside the installed build");
  }
  ManagedInstallation.Check(root,allowed);
 }
 static void Install(string configFile,bool restart,int bootstrap=0){
  var config=new JavaScriptSerializer{MaxJsonLength=4000000}.Deserialize<Dictionary<string,object>>(File.ReadAllText(configFile));string version=(string)config["version"];
  if(!Regex.IsMatch(version,@"^\d{1,5}\.\d{1,5}\.\d{1,5}$"))throw new Exception("Invalid update version");
  string source=CheckedRoot((string)config["source"]),destination=CheckedRoot((string)config["destination"]);
  var files=(System.Collections.IEnumerable)config["files"];
  foreach(var item in files){var file=(Dictionary<string,object>)item;string relative=(string)file["path"];if(relative!="Dungeon Blitz Launcher.exe"&&!relative.StartsWith("release/"+version+"/Dungeon Blitz Launcher-win32-x64/",StringComparison.Ordinal))throw new Exception("Unexpected installation file");string full=Resolve(source,relative);if((File.GetAttributes(full)&FileAttributes.ReparsePoint)!=0||new FileInfo(full).Length!=Convert.ToInt64(file["size"])||Hash(full)!=(string)file["sha256"])throw new Exception("Staged file changed");}
  if(bootstrap!=0)BootstrapCheck(destination,bootstrap);
  var waits=bootstrap!=0?new object[0]:config.ContainsKey("pids")?(System.Collections.IEnumerable)config["pids"]:new object[]{config["pid"]};
  DateTime deadline=DateTime.UtcNow.AddSeconds(120);
  foreach(var value in waits){int pid=Convert.ToInt32(value);if(pid<=0)throw new Exception("Invalid update wait process");try{using(var parent=Process.GetProcessById(pid)){int remaining=Math.Max(0,(int)(deadline-DateTime.UtcNow).TotalMilliseconds);if(!parent.WaitForExit(remaining))throw new Exception("Launcher or game has not closed; update was not installed");}}catch(ArgumentException){}}
  string releases=Path.Combine(destination,"release");Directory.CreateDirectory(releases);CheckedRoot(releases);string final=Path.Combine(releases,version);
  // Retry after an interrupted root-shim replacement only if this exact signed
  // version is already complete. Never overwrite an unrelated existing build.
  bool present=Directory.Exists(final);
  if(present)foreach(var item in files){var file=(Dictionary<string,object>)item;string relative=(string)file["path"];if(relative=="Dungeon Blitz Launcher.exe")continue;string target=Resolve(destination,relative);CheckedRoot(Path.GetDirectoryName(target));if(!File.Exists(target)||(File.GetAttributes(target)&FileAttributes.ReparsePoint)!=0||new FileInfo(target).Length!=Convert.ToInt64(file["size"])||Hash(target)!=(string)file["sha256"])throw new Exception("Existing update version does not match signed build");}
  string assembling=Path.Combine(releases,".update-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(assembling);
  if(!present){foreach(var item in files){var file=(Dictionary<string,object>)item;string relative=(string)file["path"];if(relative=="Dungeon Blitz Launcher.exe")continue;string target=Resolve(assembling,relative.Substring(("release/"+version+"/").Length));Directory.CreateDirectory(Path.GetDirectoryName(target));File.Copy(Resolve(source,relative),target,false);if(Hash(target)!=(string)file["sha256"])throw new Exception("Installed file mismatch");}Directory.Move(assembling,final);}else Directory.Delete(assembling);
  ManagedInstallation.Record(destination,version,files);
  string rootExe=Path.Combine(destination,"Dungeon Blitz Launcher.exe"),replacement=Path.Combine(destination,"Dungeon Blitz Launcher."+Guid.NewGuid().ToString("N")+".new.exe");
  File.Copy(Path.Combine(source,"Dungeon Blitz Launcher.exe"),replacement,false);
  if(File.Exists(rootExe))File.Replace(replacement,rootExe,Path.Combine(destination,"Dungeon Blitz Launcher.previous.exe"),true);else File.Move(replacement,rootExe);
  ManagedInstallation.RefreshVersion(destination,version);
  if(restart)Process.Start(new ProcessStartInfo(rootExe){UseShellExecute=false,WorkingDirectory=destination});
 }
 public static int Main(string[] args){try{if(args.Length==2&&args[0]=="protect")Protect(args[1]);else if(args.Length==2&&args[0]=="preflight")Preflight(args[1]);else if(args.Length==3&&args[0]=="extract")Extract(args[1],args[2]);else if(args.Length==3&&args[0]=="install"&&(args[2]=="restart"||args[2]=="close"))Install(args[1],args[2]=="restart");else if(args.Length==3&&args[0]=="install-bootstrap"){int pid=int.Parse(args[2]);if(pid<=0)throw new Exception("Invalid setup update process");Install(args[1],false,pid);}else throw new Exception("Invalid updater operation");return 0;}catch(Exception e){Console.Error.WriteLine(e.Message);if(args.Length>1&&File.Exists(args[1])&&(args[0]=="install"||args[0]=="install-bootstrap"))try{File.WriteAllText(Path.Combine(Path.GetDirectoryName(args[1]),"install-error.txt"),e.Message);}catch{}return 1;}}
}
