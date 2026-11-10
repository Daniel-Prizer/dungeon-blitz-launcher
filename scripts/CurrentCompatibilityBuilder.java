import java.io.*;
import java.util.*;
import com.jpexs.decompiler.flash.SWF;
import com.jpexs.decompiler.flash.tags.ABCContainerTag;

// Offline builder for the exact source/method pins checked by the caller.
// Keep upstream damage/passive hooks and map-page selection unchanged.
public class CurrentCompatibilityBuilder {
 public static void main(String[] args)throws Exception {
  SWF swf=new SWF(new FileInputStream(args[0]),false);int changed=0;
  for(ABCContainerTag tag:swf.getAbcList()){
   var abc=tag.getABC();var damage=abc.findBodyByClassAndName("Entity","TakeDamage");
   if(damage==null)continue;
   var original=new HashMap<Integer,byte[]>();
   for(var body:abc.bodies)original.put(body.method_info,body.getCodeBytes().clone());
   if(AudioPatchBuilder.wrap(abc,damage,"this",false)!=3)throw new Exception("Damage sound call count changed");
   var map=DisplayPatchBuilder.correctMapWidth(abc,"OnCreateScreen",1157,
    "bc55cc8f493d168d3ad24a3dfe42889ad6287f43395b14711e5eae4ed8be3428");
   for(var body:abc.bodies)if(body!=damage&&body!=map&&!Arrays.equals(original.get(body.method_info),body.getCodeBytes()))throw new Exception("Unrelated body changed");
   ((com.jpexs.decompiler.flash.tags.Tag)tag).setModified(true);changed++;
  }
  if(changed!=1)throw new Exception("Expected unique main ABC");
  try(var output=new FileOutputStream(args[1])){swf.saveTo(output);}
 }
}
