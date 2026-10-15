using System;
using System.IO;
using System.Collections.Generic;
using System.Web.Script.Serialization;
public static class AccessibilityTests {
 static void Check(bool v,string message){if(!v)throw new Exception(message);}
 public static void Main(string[] args){
  var state=new Dictionary<uint,uint[]>{{0x3A,new uint[]{8,0x1C}},{0x32,new uint[]{20,0x0C,10,20,30}}};int writes=0;
  Func<uint,uint[],bool> fake=(action,data)=>{uint get=action==0x3B?0x3A:action==0x33?0x32:action;if(action==0x3A||action==0x32)Array.Copy(state[get],data,data.Length);else{state[get]=(uint[])data.Clone();writes++;}return true;};
  string file=Path.Combine(args[0],"accessibility-test.json");
  string coordination="Local\\DungeonBlitzLauncher-Test-"+Guid.NewGuid().ToString("N");
  using(var dry=new AccessibilityShortcuts(true,fake,file,coordination)){dry.Update(true);dry.Update(false);}Check(writes==0&&!File.Exists(file),"Inactive-desktop dry run must never change global settings");
  using(var guard=new AccessibilityShortcuts(false,fake,file,coordination)){
   guard.Update(true);Check(state[0x3A][1]==0x10&&state[0x32][1]==0,"Only hotkey/confirmation flags cleared");Check(File.Exists(file),"Journal persisted before change");
   guard.Update(true);Check(writes==2,"No per-frame preference writes");state[0x32][2]=77;state[0x3A][1]|=0x20;
   guard.Update(false);Check(state[0x3A][1]==0x3C&&state[0x32][1]==0x0C&&state[0x32][2]==77,"Restore shortcuts while preserving unrelated new settings");Check(!File.Exists(file),"Successful restore clears journal");
   state[0x3A][1]=0x0D;guard.Update(true);Check(state[0x3A][1]==0x0D,"Never disable an enabled accessibility feature");guard.Update(false);
  }
  state[0x3A][1]=0;state[0x32][1]=0;
  File.WriteAllText(file,new JavaScriptSerializer().Serialize(new Dictionary<string,uint[]>{{"58",new uint[]{8,12}},{"50",new uint[]{20,12,1,2,3}},{"999",new uint[]{8,12}}}));
  using(var guard=new AccessibilityShortcuts(false,fake,file,coordination)){guard.Update(true);guard.Update(false);}Check(state[0x3A][1]==12&&state[0x32][1]==12,"Recover supported flags from a previous abnormal exit");
  Check(!File.Exists(file),"Recovery cleanup");Console.WriteLine("PASS Accessibility shortcuts: fake SPI, focus restore, enabled features, changed preferences, dry run and crash recovery");
 }
}
