package {
 import flash.display.MovieClip;
 import flash.system.ApplicationDomain;
 // Presentation alias only: retain the loaded game's original vector icon.
 public class a_PowerIcon_MeteorROR extends MovieClip {
  public function a_PowerIcon_MeteorROR() {
   var artwork:Class=ApplicationDomain.currentDomain.getDefinition("a_PowerIcon_Meteor") as Class;
   addChild(new artwork());
  }
 }
}
