package {
 import flash.display.MovieClip;
 import flash.system.ApplicationDomain;
 // Presentation alias only: retain the loaded game's original vector icon.
 public class a_PowerIcon_CrimsonShot extends MovieClip {
  public function a_PowerIcon_CrimsonShot() {
   var artwork:Class=ApplicationDomain.currentDomain.getDefinition("a_PowerIcon_FireBall") as Class;
   addChild(new artwork());
  }
 }
}
