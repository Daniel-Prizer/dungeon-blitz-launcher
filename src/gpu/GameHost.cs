using System;
using System.IO;
using System.IO.Pipes;
using System.Net;
using System.Net.Http;
using System.Drawing;
using System.Diagnostics;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;

// Dedicated WebView2 game surface. It has no remote host objects, Node API,
// debugging listener, general navigation UI or arbitrary script command.
public partial class GpuGameHost : Form {
 [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr context);
 [DllImport("user32.dll")]static extern uint GetDpiForWindow(IntPtr handle);
 [DllImport("user32.dll")]static extern IntPtr SetActiveWindow(IntPtr handle);
 [StructLayout(LayoutKind.Sequential)]struct IconInfo{public bool icon;public int x,y;public IntPtr mask,color;}
 [DllImport("user32.dll")]static extern bool GetIconInfo(IntPtr handle,out IconInfo info);
 [DllImport("gdi32.dll")]static extern bool DeleteObject(IntPtr handle);
 readonly NativeGameView view=new NativeGameView();readonly JavaScriptSerializer json=new JavaScriptSerializer();readonly object writeLock=new object();
 readonly Dictionary<string,object> config;readonly Dictionary<string,Dictionary<string,object>> artwork=new Dictionary<string,Dictionary<string,object>>(StringComparer.Ordinal);
 readonly HttpClient http;readonly string resources,profile;readonly Uri target;NamedPipeClientStream pipe;StreamWriter writer;CoreWebView2Environment environment;
 readonly Dictionary<string,object> loaderContract,vmContract;
 object settings=new Dictionary<string,object>();bool clientVerified=false,assetsVerified=true,loaderVerified=false,vmVerified=false,frontend=false,closing=false,shown=false;int viewportWidth=1200,viewportHeight=800;
 bool engineVerified{get{return loaderVerified&&vmVerified;}}
 public GpuGameHost(string file){
  json.MaxJsonLength=1024*1024;config=Object(json.DeserializeObject(File.ReadAllText(file)));resources=Path.GetFullPath((string)config["resources"]);profile=Path.GetFullPath((string)config["profile"]);target=new Uri((string)config["url"]);if(!Official(target)||target.Scheme!="https")throw new Exception("Official HTTPS game required");
  ServicePointManager.SecurityProtocol=SecurityProtocolType.Tls12;
  var manifest=Object(json.DeserializeObject(File.ReadAllText(Path.Combine(resources,"assets.json"))));foreach(object entry in (object[])manifest["assets"]){var asset=Object(entry);artwork.Add((string)asset["path"],asset);}
  var runtime=Object(json.DeserializeObject(File.ReadAllText(Path.Combine(resources,"runtime.json"))));loaderContract=Object(runtime["loader"]);vmContract=Object(runtime["wasm"]);
  var handler=new HttpClientHandler{AllowAutoRedirect=false,UseCookies=false,AutomaticDecompression=DecompressionMethods.GZip|DecompressionMethods.Deflate};http=new HttpClient(handler){Timeout=TimeSpan.FromSeconds(25)};
  FormBorderStyle=FormBorderStyle.None;AutoScaleMode=AutoScaleMode.None;ShowInTaskbar=false;StartPosition=FormStartPosition.Manual;Location=new Point(0,0);ClientSize=new Size(1200,800);BackColor=Color.FromArgb(72,73,85);Text="Dungeon Blitz";view.Dock=DockStyle.Fill;Controls.Add(view);
  FormClosing+=(s,e)=>{if(!closing)Emit(new{type="close-window"});closing=true;http.Dispose();if(pipe!=null)pipe.Close();view.Dispose();};
 }
 protected override bool ShowWithoutActivation{get{return true;}}
 public static void RunHost(string file){using(var host=new GpuGameHost(file))using(var loop=new ApplicationContext()){host.FormClosed+=(s,e)=>loop.ExitThread();var handle=host.Handle;host.BeginInvoke(new Action(async()=>{if(host.shown)return;host.shown=true;try{await host.Start();}catch(Exception error){host.Emit(new{type="error",message=error.Message});host.Close();}}));Application.Run(loop);}}
 protected override void WndProc(ref Message m){if(m.Msg==0x84){m.Result=new IntPtr(1);return;}if(m.Msg==0x112&&((m.WParam.ToInt64()&0xfff0)==0xf000||(m.WParam.ToInt64()&0xfff0)==0xf010)){m.Result=IntPtr.Zero;return;}base.WndProc(ref m);if(m.Msg==0x2e0&&!closing)BeginInvoke(new Action(SizeViewport));}
 void SizeViewport(){double density=Math.Max(.5,Math.Min(8,GetDpiForWindow(Handle)/96.0));var size=new Size((int)(viewportWidth*density),(int)(viewportHeight*density));if(ClientSize!=size)ClientSize=size;}
 static Dictionary<string,object> Object(object v){var value=v as Dictionary<string,object>;if(value==null)throw new Exception("Object message required");return value;}
 static bool Official(Uri u){return u!=null&&String.IsNullOrEmpty(u.UserInfo)&&u.IsDefaultPort&&(u.Host=="dungeonblitz.theminesa.studio"||u.Host=="dungeonblitzr.theminesa.studio")&&(u.Scheme=="https"||u.Scheme=="wss");}
 static string Hash(byte[] bytes){using(var hash=SHA256.Create())return BitConverter.ToString(hash.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();}
 void Emit(object value){try{lock(writeLock){if(writer!=null){writer.WriteLine(json.Serialize(value));writer.Flush();}}}catch{}}
 void Post(object value){if(!closing&&frontend)view.CoreWebView2.PostWebMessageAsJson(json.Serialize(value));}
 void Verified(){Post(new{type="assets",verified=clientVerified&&assetsVerified&&engineVerified,integrated=clientVerified&&engineVerified});}
 void Pointer(string kind){if(kind!="default"&&kind!="pointer"&&kind!="crosshair")return;Cursor cursor=kind=="pointer"?Cursors.Hand:kind=="crosshair"?Cursors.Cross:Cursors.Default;IconInfo info;if(!GetIconInfo(cursor.Handle,out info))return;try{using(var icon=Icon.FromHandle(cursor.Handle))using(var bitmap=icon.ToBitmap())using(var stream=new MemoryStream()){if(bitmap.Width>145||bitmap.Height>145)return;bitmap.Save(stream,System.Drawing.Imaging.ImageFormat.Png);string png="data:image/png;base64,"+Convert.ToBase64String(stream.ToArray());if(png.Length>27000)return;Post(new{type="system-pointer",cursor=kind,value=new{width=bitmap.Width,hotspotX=info.x,hotspotY=info.y,png=png}});}}finally{if(info.mask!=IntPtr.Zero)DeleteObject(info.mask);if(info.color!=IntPtr.Zero)DeleteObject(info.color);}}
 async Task NativeFallback(){assetsVerified=false;Verified();try{await view.CoreWebView2.ExecuteScriptAsync("document.querySelector('ruffle-player')?.ruffle().callExternalInterface('BlitzGpuNativeView',false)");}catch{}}
 async Task<byte[]> Fetch(Uri uri,int limit){using(var response=await http.GetAsync(uri,HttpCompletionOption.ResponseHeadersRead)){response.EnsureSuccessStatusCode();if(response.Content.Headers.ContentLength>limit)throw new Exception("Public resource exceeds limit");using(var input=await response.Content.ReadAsStreamAsync())using(var output=new MemoryStream()){byte[] buffer=new byte[65536];int count;while((count=await input.ReadAsync(buffer,0,buffer.Length))>0){if(output.Length+count>limit)throw new Exception("Public resource exceeds limit");output.Write(buffer,0,count);}return output.ToArray();}}}
 async Task Start(){
  string channel=Environment.GetEnvironmentVariable("BLITZ_HOST_CHANNEL"),token=Environment.GetEnvironmentVariable("BLITZ_HOST_TOKEN");if(channel==null||!channel.StartsWith("\\\\.\\pipe\\blitz-game-")||token==null||token.Length!=64)throw new Exception("Authenticated game channel required");
  pipe=new NamedPipeClientStream(".",channel.Substring(9),PipeDirection.InOut,PipeOptions.Asynchronous);await pipe.ConnectAsync(10000);writer=new StreamWriter(pipe,new UTF8Encoding(false),4096,true);Emit(new{type="auth",token=token});
  // No unsafe-WebGPU flag in production: unsupported hardware stays native.
  string switches="--autoplay-policy=no-user-gesture-required --disable-backgrounding-occluded-windows";if(Environment.GetEnvironmentVariable("BLITZ_GAME_ACCELERATION")=="0")switches+=" --disable-gpu";
  environment=await CoreWebView2Environment.CreateAsync(null,profile,new CoreWebView2EnvironmentOptions(switches));await view.EnsureCoreWebView2Async(environment);view.DefaultBackgroundColor=BackColor;var core=view.CoreWebView2;
  core.Settings.AreHostObjectsAllowed=false;core.Settings.AreDevToolsEnabled=false;core.Settings.AreDefaultContextMenusEnabled=false;core.Settings.AreDefaultScriptDialogsEnabled=false;core.Settings.IsStatusBarEnabled=false;core.Settings.IsZoomControlEnabled=false;core.Settings.IsPinchZoomEnabled=false;core.Settings.IsGeneralAutofillEnabled=false;core.Settings.IsPasswordAutosaveEnabled=false;core.Settings.AreBrowserAcceleratorKeysEnabled=false;
#if GPU_PRIVATE_QA
  core.IsMuted=true;
#endif
  core.DownloadStarting+=(s,e)=>e.Cancel=true;core.PermissionRequested+=(s,e)=>e.State=CoreWebView2PermissionState.Deny;
  view.WebFocusChanged+=focused=>Post(new{type="foreground",value=focused});Deactivate+=(s,e)=>Post(new{type="foreground",value=false});Activated+=(s,e)=>Post(new{type="foreground",value=view.IsWebFocused});LocationChanged+=(s,e)=>view.NotifyParentPosition();
  core.NewWindowRequested+=(s,e)=>{e.Handled=true;if(!e.IsUserInitiated)return;Uri uri;if(Uri.TryCreate(e.Uri,UriKind.Absolute,out uri)&&ReloadAlias(uri))core.Reload();else Emit(new{type="external-link",url=e.Uri,userGesture=true});};
  core.NavigationStarting+=(s,e)=>{Uri uri;if(!Uri.TryCreate(e.Uri,UriKind.Absolute,out uri)||uri.GetLeftPart(UriPartial.Authority)!=target.GetLeftPart(UriPartial.Authority)||uri.AbsolutePath!=target.AbsolutePath){e.Cancel=true;if(e.IsUserInitiated){if(uri!=null&&ReloadAlias(uri))BeginInvoke(new Action(()=>core.Navigate(target.AbsoluteUri)));else Emit(new{type="external-link",url=e.Uri,userGesture=true});}return;}frontend=false;clientVerified=false;loaderVerified=false;vmVerified=false;assetsVerified=true;};
  core.NavigationCompleted+=(s,e)=>{Emit(new{type="loading",value=false});if(!e.IsSuccess)Emit(new{type="error",message="Game page failed: "+e.WebErrorStatus});};
  core.ProcessFailed+=(s,e)=>Emit(new{type="error",message="Game renderer stopped. Reconnect to retry."});
  core.WebMessageReceived+=(s,e)=>{
   Uri uri;if(!Uri.TryCreate(e.Source,UriKind.Absolute,out uri)||uri.GetLeftPart(UriPartial.Authority)!=target.GetLeftPart(UriPartial.Authority))return;
   try{string raw=e.WebMessageAsJson;if(raw.Length>8192)return;var message=Object(json.DeserializeObject(raw));string type=message.ContainsKey("type")?message["type"] as string:null;
    if(type=="frontend-ready"){frontend=true;Post(new{type="settings",value=settings});Post(new{type="foreground",value=view.IsWebFocused});Verified();}
    else if(type=="pointer-request"&&message.ContainsKey("cursor"))Pointer(message["cursor"] as string);
    else if(type=="browser-zoom"&&clientVerified){double value=Convert.ToDouble(message["value"]);if(Double.IsNaN(value)||value<0.1||value>10)return;if(Math.Abs(view.ZoomFactor-value)>0.00001)view.ZoomFactor=value;Post(new{type="zoom",value=view.ZoomFactor});Emit(new{type="zoom-applied"});}
    else if(type=="gpu-status"||type=="client-integration"||type=="audio-integration"||type=="original-pointer")Emit(message);
   }catch{}
  };
  core.AddWebResourceRequestedFilter("*",CoreWebView2WebResourceContext.All,CoreWebView2WebResourceRequestSourceKinds.All);
  core.WebResourceRequested+=async(s,e)=>{
   Uri uri;if(!Uri.TryCreate(e.Request.Uri,UriKind.Absolute,out uri))return;
   if(uri.Scheme=="data"||uri.Scheme=="blob")return;
   if(!Official(uri)){e.Response=environment.CreateWebResourceResponse(new MemoryStream(),403,"Forbidden","Content-Type: text/plain");return;}
   if(uri.AbsolutePath.StartsWith("/__launcher_gpu/",StringComparison.Ordinal)){
    string name=uri.AbsolutePath.Substring(16);if(name.IndexOf('/')>=0||name.IndexOf('\\')>=0||name==""||!(name.EndsWith(".mjs")||name=="crosshair.js")){e.Response=environment.CreateWebResourceResponse(new MemoryStream(),404,"Not Found","");return;}
    string path=Path.Combine(resources,name);e.Response=environment.CreateWebResourceResponse(File.Exists(path)?(Stream)File.OpenRead(path):new MemoryStream(),File.Exists(path)?200:404,"Local resource","Content-Type: text/javascript; charset=utf-8\r\nCache-Control: no-store");return;
   }
   if(e.Request.Method!="GET")return;bool swf=uri.AbsolutePath.EndsWith(".swf",StringComparison.OrdinalIgnoreCase),loader=uri.AbsolutePath=="/ruffle/ruffle.js",vm=uri.AbsolutePath.StartsWith("/ruffle/",StringComparison.Ordinal)&&uri.AbsolutePath.EndsWith(".wasm",StringComparison.Ordinal);if(!swf&&!loader&&!vm)return;
   using(var deferral=e.GetDeferral()){try{
    byte[] bytes=await Fetch(uri,vm?64*1024*1024:swf?32*1024*1024:2*1024*1024);string digest=Hash(bytes);
    if(loader||vm){var contract=loader?loaderContract:vmContract;bool verified=uri.AbsolutePath==(string)contract["path"]&&digest==(string)contract["sha256"]&&(!contract.ContainsKey("bytes")||bytes.Length==Convert.ToInt32(contract["bytes"]));if(loader)loaderVerified=verified;else vmVerified=verified;if(!verified){await NativeFallback();Emit(new{type="client-integration",value=false});Emit(new{type="audio-integration",value=false});Emit(new{type="gpu-status",status=new{phase="native",reason="Game runtime needs review"}});}}
    else if(uri.AbsolutePath.EndsWith("/DungeonBlitz.swf",StringComparison.Ordinal)){
     clientVerified=engineVerified&&digest==(string)config["sourceHash"]&&File.Exists((string)config["patched"]);if(clientVerified){byte[] patched=File.ReadAllBytes((string)config["patched"]);if(Hash(patched)!=(string)config["patchedHash"])throw new Exception("Prepared client verification failed");bytes=patched;}else{await NativeFallback();Emit(new{type="client-integration",value=false});Emit(new{type="audio-integration",value=false});}
    }else{
     Dictionary<string,object> asset;if(!artwork.TryGetValue(uri.AbsolutePath,out asset)||digest!=(string)asset["sha256"]||bytes.Length!=Convert.ToInt32(asset["bytes"])){await NativeFallback();Emit(new{type="gpu-status",status=new{phase="native",reason="Artwork needs review: "+Path.GetFileName(uri.AbsolutePath)}});}
    }
    Verified();e.Response=environment.CreateWebResourceResponse(new MemoryStream(bytes),200,"OK","Content-Type: "+(swf?"application/x-shockwave-flash":vm?"application/wasm":"text/javascript")+"\r\nCache-Control: no-store\r\nAccess-Control-Allow-Origin: "+target.GetLeftPart(UriPartial.Authority));
   }catch(Exception){assetsVerified=false;Verified();
#if GPU_PRIVATE_QA
    Emit(new{type="research-resource",file=uri.AbsolutePath,error="Public resource inspection failed; native browser request retained"});
#endif
   }finally{deferral.Complete();}}
  };
  await core.AddScriptToExecuteOnDocumentCreatedAsync(File.ReadAllText(Path.Combine(resources,"bootstrap.js")));
  await core.AddScriptToExecuteOnDocumentCreatedAsync(File.ReadAllText(Path.Combine(resources,"crosshair.js")));
#if GPU_PRIVATE_QA
  await core.AddScriptToExecuteOnDocumentCreatedAsync("window.__gpuQaErrors=[];addEventListener('error',e=>{if(__gpuQaErrors.length<8)__gpuQaErrors.push({message:e.message,file:e.filename,line:e.lineno})});addEventListener('unhandledrejection',e=>{if(__gpuQaErrors.length<8)__gpuQaErrors.push({message:String(e.reason?.message||e.reason)})});");
#endif
  Emit(new{type="ready",hwnd=Handle.ToInt64().ToString(),electron="WebView2",chromium=environment.BrowserVersionString});
  voidRead();core.Navigate(target.AbsoluteUri);
 }
 static bool ReloadAlias(Uri uri){return String.IsNullOrEmpty(uri.UserInfo)&&uri.IsDefaultPort&&(uri.Scheme=="https"||uri.Scheme=="http")&&(uri.AbsolutePath=="/"||uri.AbsolutePath=="/web")&&(Official(uri)||uri.Host=="dungeonblitz.com"||uri.Host=="www.dungeonblitz.com");}
 async void voidRead(){try{byte[] buffer=new byte[4096];var line=new MemoryStream();while(!closing){int count=await pipe.ReadAsync(buffer,0,buffer.Length);if(count==0)break;for(int i=0;i<count;i++){if(buffer[i]!=10){if(line.Length>=32768)throw new Exception("Game command too large");line.WriteByte(buffer[i]);}else{var message=Object(json.DeserializeObject(Encoding.UTF8.GetString(line.ToArray())));line.SetLength(0);Command(message);}}}}catch{}if(!closing){closing=true;Close();}}
 void Command(Dictionary<string,object> command){string type=command.ContainsKey("type")?command["type"] as string:null;object value=command.ContainsKey("value")?command["value"]:null;
  if(type=="quit"){Post(new{type="quit"});closing=true;Close();}
  else if(type=="settings"){settings=value;Post(new{type="settings",value=value});}
  else if(type=="viewport"){int width=Convert.ToInt32(command["width"]),height=Convert.ToInt32(command["height"]);if(width>=1&&height>=1&&width<=8000&&height<=8000){viewportWidth=width;viewportHeight=height;SizeViewport();}}
  else if(type=="visibility"){bool visible=value is bool&&(bool)value;Post(new{type="visibility",value=visible});Visible=visible;}
  else if(type=="focus"){if(Visible){Activate();SetActiveWindow(Handle);view.FocusWeb();Post(new{type="focus"});Post(new{type="foreground",value=view.IsWebFocused});Emit(new{type="focused"});}}
  else if(type=="change-character"){Post(new{type="stop-autorun"});view.CoreWebView2.Reload();}
#if GPU_PRIVATE_QA
  else if(type=="research")Research(command);
#endif
 }
 [STAThread] public static int Main(string[] args){if(args.Length!=0)return 2;try{SetProcessDpiAwarenessContext(new IntPtr(-4));Application.EnableVisualStyles();string config=Environment.GetEnvironmentVariable("BLITZ_GPU_CONFIG");if(String.IsNullOrEmpty(config))return 2;RunHost(config);return 0;}catch(Exception error){Console.Error.WriteLine(error.Message);return 1;}}
}
