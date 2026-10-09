using System;
using System.IO;
using System.Diagnostics;
using System.Reflection;
using System.Windows.Forms;
[assembly: AssemblyTitle("Dungeon Blitz Launcher")]
[assembly: AssemblyProduct("Dungeon Blitz Launcher")]
[assembly: AssemblyFileVersion("@@VERSION@@.0")]
[assembly: AssemblyVersion("@@VERSION@@.0")]
public static class Launcher {
  [STAThread] public static int Main(string[] args) {
    string root=AppDomain.CurrentDomain.BaseDirectory;
    string executable=Path.Combine(root,"release","@@VERSION@@","Dungeon Blitz Launcher-win32-x64","Dungeon Blitz Launcher.exe");
    bool verify=args.Length==1 && args[0]=="--verify";
    try {
      if(!File.Exists(executable))throw new FileNotFoundException("Keep the release folder alongside this executable.",executable);
      var version=FileVersionInfo.GetVersionInfo(executable);
      if(version.FileMajorPart!=@@MAJOR@@ || version.FileMinorPart!=@@MINOR@@ || version.FileBuildPart!=@@PATCH@@)throw new InvalidOperationException("The installed build does not match the latest launcher.");
      if(verify){Console.WriteLine(executable);return 0;}
      Process.Start(new ProcessStartInfo(executable){WorkingDirectory=Path.GetDirectoryName(executable),UseShellExecute=false});return 0;
    } catch(Exception e) {
      if(verify)Console.Error.WriteLine(e.Message);
      else MessageBox.Show(e.Message,"Dungeon Blitz Launcher could not start",MessageBoxButtons.OK,MessageBoxIcon.Error);
      return 1;
    }
  }
}
