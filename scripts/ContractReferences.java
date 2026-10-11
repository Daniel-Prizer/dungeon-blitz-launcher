import java.io.*;
import java.util.*;
import com.jpexs.decompiler.flash.SWF;
import com.jpexs.decompiler.flash.abc.ABC;
import com.jpexs.decompiler.flash.abc.avm2.AVM2Code;
import com.jpexs.decompiler.flash.tags.ABCContainerTag;

// Build-time only: JPEXS identifies exact operand boundaries in the reviewed
// compiled instructions. The runtime receives bounded relocation records,
// never an opcode scanner, decompiler or source-driven patch generator.
public class ContractReferences {
 static ABC main(String path)throws Exception {for(ABCContainerTag t:new SWF(new FileInputStream(path),false).getAbcList())if(t.getABC().findBodyByClassAndName("Main","method_561")!=null)return t.getABC();throw new Exception("Missing Main");}
 public static void main(String[] args)throws Exception {
  ABC before=main(args[0]),after=main(args[1]);
  Map<Integer,String> kinds=Map.of(AVM2Code.DAT_MULTINAME_INDEX,"multinames",AVM2Code.DAT_STRING_INDEX,"strings",AVM2Code.DAT_INT_INDEX,"ints",AVM2Code.DAT_UINT_INDEX,"uints",AVM2Code.DAT_DOUBLE_INDEX,"doubles",AVM2Code.DAT_NAMESPACE_INDEX,"namespaces");
  Map<String,Integer> counts=Map.of("multinames",before.constants.getMultinameCount(),"strings",before.constants.getStringCount(),"ints",before.constants.getIntCount(),"uints",before.constants.getUIntCount(),"doubles",before.constants.getDoubleCount(),"namespaces",before.constants.getNamespaceCount());
  List<String> records=new ArrayList<>();
  for(var body:after.bodies){var old=before.findBody(body.method_info);if(old==null)throw new Exception("New main body");if(Arrays.equals(old.getCodeBytes(),body.getCodeBytes()))continue;
   for(var instruction:body.getCode().code)for(int n=0;n<instruction.definition.operands.length;n++){String pool=kinds.get(instruction.definition.operands[n]);if(pool==null||instruction.operands[n]<counts.get(pool))continue;
    if(n!=0)throw new Exception("Unreviewed relocation operand "+instruction.definition.instructionName);
    records.add("{\"id\":"+body.method_info+",\"offset\":"+(instruction.getAddress()+1)+",\"pool\":\""+pool+"\",\"index\":"+instruction.operands[n]+"}");
   }
  }
  try(var out=new PrintWriter(args[2])){out.println("["+String.join(",",records)+"]");}
  System.out.println("Reviewed constant-pool relocation operands: "+records.size());
 }
}
