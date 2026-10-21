import java.io.*;
import java.util.*;
import java.security.MessageDigest;
import com.jpexs.decompiler.flash.SWF;
import com.jpexs.decompiler.flash.abc.ABC;
import com.jpexs.decompiler.flash.abc.types.MethodBody;
import com.jpexs.decompiler.flash.abc.avm2.instructions.AVM2Instruction;
import com.jpexs.decompiler.flash.tags.ABCContainerTag;

// Unshipped fixture only: replace the two network-starting constructors. The
// source is the exact packaged GPU delta, not a guessed or weakened live patch.
public class NativePerfFixtureBuilder {
 public static void main(String[] args)throws Exception {
  byte[] bytes=java.nio.file.Files.readAllBytes(java.nio.file.Path.of(args[0]));
  if(!HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)).equals("1ad85e0c2283c194ab2f1a0a0d65e54e62115b80e3a26fe6b7010a1daf98a974"))throw new Exception("Unreviewed fixture input");
  SWF swf=new SWF(new ByteArrayInputStream(bytes),false);int changed=0;
  for(ABCContainerTag tag:swf.getAbcList()){
   ABC abc=tag.getABC();int game=abc.findClassByName("Game");if(game<0)continue;
   int main=0;for(AVM2Instruction i:abc.findBodyByClassAndName("Game","method_1947").getCode().code)if(i.definition.instructionName.equals("getproperty")&&abc.constants.getString(abc.constants.getMultiname(i.operands[0]).name_index).equals("main")){main=i.operands[0];break;}
   if(main==0)throw new Exception("Missing native main field");
   MethodBody ctor=abc.findBody(abc.instance_info.get(game).iinit_index);ByteArrayOutputStream code=new ByteArrayOutputStream();
   for(AVM2Instruction i:new AVM2Instruction[]{new AVM2Instruction(0,0xd0,null),new AVM2Instruction(0,0x30,null),new AVM2Instruction(0,0xd0,null),new AVM2Instruction(0,0x49,new int[]{0}),new AVM2Instruction(0,0xd0,null),new AVM2Instruction(0,0xd1,null),new AVM2Instruction(0,0x61,new int[]{main}),new AVM2Instruction(0,0x47,null)})code.write(i.getBytes());
   ctor.setCodeBytes(code.toByteArray());ctor.getCode();ctor.max_stack=2;ctor.exceptions=new com.jpexs.decompiler.flash.abc.types.ABCException[0];ctor.setModified();ctor.getCode().checkValidOffsets(ctor);
   int entity=abc.findClassByName("Entity");MethodBody entityCtor=abc.findBody(abc.instance_info.get(entity).iinit_index);
   entityCtor.setCodeBytes(HexFormat.of().parseHex("d030d0490047"));entityCtor.getCode();entityCtor.exceptions=new com.jpexs.decompiler.flash.abc.types.ABCException[0];entityCtor.max_stack=1;entityCtor.setModified();((com.jpexs.decompiler.flash.tags.Tag)tag).setModified(true);changed++;
  }
  if(changed!=1)throw new Exception("Expected exactly one fixture ABC");try(OutputStream out=new FileOutputStream(args[1])){swf.saveTo(out);}
 }
}
