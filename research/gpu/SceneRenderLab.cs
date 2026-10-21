using System;
using System.IO;
using System.Drawing;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

// Naturally separate synthetic WebView2 harness. It accepts only a disposable
// loopback fixture, never a live game, player profile, updater or shell command.
public sealed class SceneRenderLab : Form {
 [DllImport("user32.dll")] static extern IntPtr GetThreadDesktop(uint id);
 [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern bool GetUserObjectInformation(IntPtr handle,int index,StringBuilder value,int length,out int needed);
 readonly WebView2 view=new WebView2(); readonly JavaScriptSerializer json=new JavaScriptSerializer();
 readonly string origin,output,profile; readonly Uri target; bool done;
 protected override bool ShowWithoutActivation { get { return true; } }
 protected override CreateParams CreateParams { get { var p=base.CreateParams;p.ExStyle|=0x08000000;return p; } }
 static void CheckDesktop(){string expected=Environment.GetEnvironmentVariable("BLITZ_PRIVATE_DESKTOP");var name=new StringBuilder(256);int size;if(expected==null||!expected.StartsWith("BlitzTest-")||!GetUserObjectInformation(GetThreadDesktop(GetCurrentThreadId()),2,name,512,out size)||name.ToString()!=expected)throw new Exception("Inactive research desktop required");}
 SceneRenderLab(string configuration){CheckDesktop();json.MaxJsonLength=1024*1024;var config=json.DeserializeObject(File.ReadAllText(configuration)) as System.Collections.Generic.Dictionary<string,object>;
  target=new Uri((string)config["url"]);if(target.Scheme!="http"||target.Host!="127.0.0.1"||!String.IsNullOrEmpty(target.UserInfo))throw new Exception("Loopback synthetic fixture required");origin=target.GetLeftPart(UriPartial.Authority);
  output=Path.GetFullPath((string)config["output"]);profile=Path.GetFullPath((string)config["profile"]);string folder=Path.GetDirectoryName(configuration)+Path.DirectorySeparatorChar;if(!output.StartsWith(folder,StringComparison.OrdinalIgnoreCase)||!profile.StartsWith(folder,StringComparison.OrdinalIgnoreCase))throw new Exception("Research paths escaped fixture folder");
  Text="Scene renderer research";ShowInTaskbar=false;StartPosition=FormStartPosition.Manual;Location=new Point(0,0);ClientSize=new Size(1024,768);view.Dock=DockStyle.Fill;Controls.Add(view);Process.GetCurrentProcess().PriorityClass=ProcessPriorityClass.BelowNormal;
  Shown+=async (s,e)=>{try{await Start();}catch(Exception error){FinishError(error);}};
  var timeout=new Timer();timeout.Interval=90000;timeout.Tick+=(s,e)=>{timeout.Stop();if(!done)FinishError(new Exception("Bounded WebView2 probe timed out"));};timeout.Start();FormClosed+=(s,e)=>{timeout.Dispose();view.Dispose();};
 }
 async Task Start(){var env=await CoreWebView2Environment.CreateAsync(null,profile,new CoreWebView2EnvironmentOptions("--enable-unsafe-webgpu --use-angle=d3d11"));await view.EnsureCoreWebView2Async(env);view.DefaultBackgroundColor=Color.FromArgb(72,73,85);var core=view.CoreWebView2;core.IsMuted=true;core.Settings.AreHostObjectsAllowed=false;core.Settings.IsWebMessageEnabled=false;core.Settings.AreDevToolsEnabled=false;core.Settings.AreDefaultContextMenusEnabled=false;core.Settings.AreDefaultScriptDialogsEnabled=false;core.Settings.IsStatusBarEnabled=false;
  core.NavigationStarting+=(s,e)=>{Uri uri;if(!Uri.TryCreate(e.Uri,UriKind.Absolute,out uri)||uri.GetLeftPart(UriPartial.Authority)!=origin)e.Cancel=true;};core.NewWindowRequested+=(s,e)=>e.Handled=true;core.DownloadStarting+=(s,e)=>e.Cancel=true;core.PermissionRequested+=(s,e)=>e.State=CoreWebView2PermissionState.Deny;
  core.AddWebResourceRequestedFilter("*",CoreWebView2WebResourceContext.All,CoreWebView2WebResourceRequestSourceKinds.All);
  core.WebResourceRequested+=(s,e)=>{Uri uri;if(!Uri.TryCreate(e.Request.Uri,UriKind.Absolute,out uri)||uri.GetLeftPart(UriPartial.Authority)!=origin||e.Request.Method!="GET")e.Response=env.CreateWebResourceResponse(new MemoryStream(),403,"Forbidden","Content-Type: text/plain");};
  core.ProcessFailed+=(s,e)=>{if(!done)FinishError(new Exception("Own WebView2 renderer failed: "+e.ProcessFailedKind));};
  core.NavigationCompleted+=async(s,e)=>{if(done)return;try{if(!e.IsSuccess)throw new Exception("Synthetic navigation failed: "+e.WebErrorStatus);string expression="(async()=>{for(let i=0;i<100;i++){if(typeof window.verifyGpu==='function')return await window.verifyGpu();await new Promise(r=>setTimeout(r,50));}throw Error('GPU fixture not ready');})()";
    string result=await core.CallDevToolsProtocolMethodAsync("Runtime.evaluate",json.Serialize(new {expression=expression,awaitPromise=true,returnByValue=true}));var envelope=json.DeserializeObject(result) as System.Collections.Generic.Dictionary<string,object>;if(envelope.ContainsKey("exceptionDetails"))throw new Exception("Owned GPU fixture rejected: "+json.Serialize(envelope["exceptionDetails"]));
    File.WriteAllText(output,result);using(var image=File.Create(Path.ChangeExtension(output,"png")))await core.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,image);done=true;BeginInvoke(new Action(Close));
   }catch(Exception error){FinishError(error);}};core.Navigate(target.AbsoluteUri);
 }
 void FinishError(Exception error){if(done)return;done=true;File.WriteAllText(output,json.Serialize(new {error=error.Message}));Environment.ExitCode=1;BeginInvoke(new Action(Close));}
 [STAThread] public static int Main(string[] args){if(args.Length!=1)return 2;try{Application.EnableVisualStyles();Application.Run(new SceneRenderLab(Path.GetFullPath(args[0])));return Environment.ExitCode;}catch(Exception e){Console.Error.WriteLine(e.Message);return 3;}}
}
