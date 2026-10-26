import java.io.*;
import java.util.*;
import com.jpexs.decompiler.flash.SWF;
import com.jpexs.decompiler.flash.tags.ABCContainerTag;

// The caller pins the complete source and method envelope. Reapply only the
// existing sound-owner wrapper; retain the new group-damage floater and exits.
public class DamageAudioPatchBuilder {
 public static void main(String[] args)throws Exception {
  SWF swf=new SWF(new FileInputStream(args[0]),false);int changed=0;
  for(ABCContainerTag tag:swf.getAbcList()){
   var abc=tag.getABC();var body=abc.findBodyByClassAndName("Entity","TakeDamage");if(body==null)continue;
   var original=new HashMap<Integer,byte[]>();for(var m:abc.bodies)original.put(m.method_info,m.getCodeBytes().clone());
   int count=AudioPatchBuilder.wrap(abc,body,"this",false);
   if(count!=3)throw new Exception("Unexpected TakeDamage sound call count: "+count);
   for(var m:abc.bodies)if(m!=body&&!Arrays.equals(m.getCodeBytes(),original.get(m.method_info)))throw new Exception("Unrelated method changed");
   ((com.jpexs.decompiler.flash.tags.Tag)tag).setModified(true);changed++;
  }
  if(changed!=1)throw new Exception("Missing unique damage method");
  try(var stream=new FileOutputStream(args[1])){swf.saveTo(stream);}
 }
}
