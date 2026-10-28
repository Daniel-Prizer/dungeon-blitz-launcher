import java.io.*;
import java.util.*;
import com.jpexs.decompiler.flash.SWF;
import com.jpexs.decompiler.flash.tags.ABCContainerTag;

// Reapply the existing sound-owner wrapper after the upstream own-effects guard.
public class EffectsAudioPatchBuilder {
 public static void main(String[] args)throws Exception {
  SWF swf=new SWF(new FileInputStream(args[0]),false);int changed=0;
  for(ABCContainerTag tag:swf.getAbcList()){
   var abc=tag.getABC();var body=abc.findBodyByClassAndName("CombatState","method_884");if(body==null)continue;
   var original=new HashMap<Integer,byte[]>();for(var m:abc.bodies)original.put(m.method_info,m.getCodeBytes().clone());
   int count=AudioPatchBuilder.wrap(abc,body,"var_3",false);
   if(count!=1)throw new Exception("Unexpected effects sound call count: "+count);
   for(var m:abc.bodies)if(m!=body&&!Arrays.equals(m.getCodeBytes(),original.get(m.method_info)))throw new Exception("Unrelated method changed");
   ((com.jpexs.decompiler.flash.tags.Tag)tag).setModified(true);changed++;
  }
  if(changed!=1)throw new Exception("Missing unique effects method");
  try(var stream=new FileOutputStream(args[1])){swf.saveTo(stream);}
 }
}
