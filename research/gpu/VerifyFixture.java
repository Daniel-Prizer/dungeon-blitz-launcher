import java.io.*;import java.util.*;import com.jpexs.decompiler.flash.SWF;import com.jpexs.decompiler.flash.abc.ABC;import com.jpexs.decompiler.flash.abc.types.traits.*;
// Imports may edit only methods of the launcher-owned offline fixture class.
public class VerifyFixture{
 static Set<String> owned=new HashSet<>(Set.of("DungeonBlitz"));
 static boolean allowed(String name){for(String c:owned)if(name.startsWith(c+"."))return true;return false;}
 static Map<String,byte[]> methods(String path)throws Exception{
  Map<String,byte[]> result=new TreeMap<>();int tag=0;
  for(var t:new SWF(new FileInputStream(path),false).getAbcList()){
   ABC a=t.getABC();Map<Integer,String> names=new HashMap<>();
   for(int i=0;i<a.instance_info.size();i++){
    String c=a.constants.getString(a.constants.getMultiname(a.instance_info.get(i).name_index).name_index);
    names.put(a.instance_info.get(i).iinit_index,c+".iinit");names.put(a.class_info.get(i).cinit_index,c+".cinit");
    for(var ts:new Traits[]{a.instance_info.get(i).instance_traits,a.class_info.get(i).static_traits})for(var trait:ts.traits)if(trait instanceof TraitMethodGetterSetter m)names.put(m.method_info,c+"."+a.constants.getString(a.constants.getMultiname(m.name_index).name_index));
   }
   for(int i=0;i<a.script_info.size();i++){
    var script=a.script_info.get(i);String owner="script-"+i;
    for(var trait:script.traits.traits)if(trait instanceof TraitClass c){String className=a.constants.getString(a.constants.getMultiname(a.instance_info.get(c.class_info).name_index).name_index);if(owned.contains(className))owner=className+".script";}
    names.put(script.init_index,owner+".init");
   }
   boolean changed;do{changed=false;for(var b:a.bodies)if(allowed(names.getOrDefault(b.method_info,"")))for(var instruction:b.getCode().code)if(instruction.definition.instructionName.equals("newfunction")){int closure=instruction.operands[0];if(!names.containsKey(closure)){names.put(closure,"DungeonBlitz.closure-"+closure);changed=true;}}}while(changed);
   for(var b:a.bodies){String name=names.getOrDefault(b.method_info,"anonymous-"+b.method_info);if(allowed(name))continue;
    var bytes=new ByteArrayOutputStream();var data=new DataOutputStream(bytes);data.write(b.getCodeBytes());data.writeInt(b.max_stack);data.writeInt(b.max_regs);data.writeInt(b.init_scope_depth);data.writeInt(b.max_scope_depth);for(var e:b.exceptions){data.writeInt(e.start);data.writeInt(e.end);data.writeInt(e.target);data.writeInt(e.type_index);data.writeInt(e.name_index);}result.put(tag+":"+name,bytes.toByteArray());
   }tag++;
  }return result;
 }
 public static void main(String[]args)throws Exception{for(int i=2;i<args.length;i++)owned.add(args[i]);var before=methods(args[0]);var after=methods(args[1]);if(!before.keySet().equals(after.keySet())){var removed=new TreeSet<>(before.keySet());removed.removeAll(after.keySet());var added=new TreeSet<>(after.keySet());added.removeAll(before.keySet());throw new Exception("Native method set changed: removed="+removed+" added="+added);};for(var key:before.keySet())if(!Arrays.equals(before.get(key),after.get(key)))throw new Exception("Native method changed: "+key);System.out.println("Preserved "+before.size()+" non-fixture method bodies");}
}
