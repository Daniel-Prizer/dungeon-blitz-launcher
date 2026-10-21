using System;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;

// Controller events cover cross-process focus. A positive own-child focus
// query also handles a focus acquired before the event handlers were attached.
public sealed class NativeGameView:Control {
 [DllImport("user32.dll")]static extern IntPtr GetFocus();
 [DllImport("user32.dll")]static extern bool IsChild(IntPtr parent,IntPtr child);
 CoreWebView2Controller controller;Color background=Color.FromArgb(72,73,85);
 bool controllerFocused;
 public event Action<bool> WebFocusChanged;
 public bool IsWebFocused{get{var focus=GetFocus();return controllerFocused||focus==Handle||IsChild(Handle,focus);}}
 public CoreWebView2 CoreWebView2{get{return controller==null?null:controller.CoreWebView2;}}
 public double ZoomFactor{get{return controller==null?1:controller.ZoomFactor;}set{if(controller!=null)controller.ZoomFactor=value;}}
 public Color DefaultBackgroundColor{get{return background;}set{background=value;if(controller!=null)controller.DefaultBackgroundColor=value;}}
 public NativeGameView(){SetStyle(ControlStyles.Selectable,true);TabStop=true;BackColor=background;}
 public async Task EnsureCoreWebView2Async(CoreWebView2Environment environment){
  if(controller!=null)return;controller=await environment.CreateCoreWebView2ControllerAsync(Handle);controller.Bounds=ClientRectangle;controller.DefaultBackgroundColor=background;controller.IsVisible=Visible;
  controller.GotFocus+=(s,e)=>{controllerFocused=true;if(WebFocusChanged!=null)WebFocusChanged(true);};controller.LostFocus+=(s,e)=>{controllerFocused=false;if(WebFocusChanged!=null)WebFocusChanged(false);};
 }
 public void NotifyParentPosition(){if(controller!=null)controller.NotifyParentWindowPositionChanged();}
 public void FocusWeb(){Focus();if(controller!=null)controller.MoveFocus(CoreWebView2MoveFocusReason.Programmatic);}
 protected override void OnGotFocus(EventArgs e){base.OnGotFocus(e);if(controller!=null)controller.MoveFocus(CoreWebView2MoveFocusReason.Programmatic);}
 protected override void OnSizeChanged(EventArgs e){base.OnSizeChanged(e);if(controller!=null)controller.Bounds=ClientRectangle;}
 protected override void OnVisibleChanged(EventArgs e){base.OnVisibleChanged(e);if(controller!=null)controller.IsVisible=Visible;}
 protected override void Dispose(bool disposing){if(disposing&&controller!=null){controller.Close();controller=null;}base.Dispose(disposing);}
}
