import java.io.*;
import java.util.*;
import java.security.*;
import com.jpexs.decompiler.flash.SWF;
import com.jpexs.decompiler.flash.abc.ABC;
import com.jpexs.decompiler.flash.abc.types.MethodBody;
import com.jpexs.decompiler.flash.abc.avm2.instructions.AVM2Instruction;
import com.jpexs.decompiler.flash.tags.ABCContainerTag;

// Offline fixtures only. Never authenticate or send character-selection packets.
public class RefreshFixtureBuilder {
 static int name(ABC abc,String field)throws Exception {
  for(int i=1;i<abc.constants.getMultinameCount();i++){
   var n=abc.constants.getMultiname(i);
   if(n.name_index>0&&abc.constants.getString(n.name_index).equals(field))return i;
  }
  throw new Exception("Missing fixture field: "+field);
 }
 static byte[] code(ABC abc,Object... parts)throws Exception {
  var out=new ByteArrayOutputStream();
  for(int i=0;i<parts.length;i++){
   int op=(Integer)parts[i];int[] operands=null;
   if(i+1<parts.length&&parts[i+1] instanceof String)operands=new int[]{name(abc,(String)parts[++i])};
   out.write(new AVM2Instruction(0,op,operands).getBytes());
  }
  return out.toByteArray();
 }
 static void body(ABC abc,String owner,String method,byte[] code)throws Exception {
  MethodBody b=abc.findBodyByClassAndName(owner,method);
  if(b==null)throw new Exception("Missing fixture method");
  b.setCodeBytes(code);b.getCode();b.exceptions=new com.jpexs.decompiler.flash.abc.types.ABCException[0];
  b.max_stack=4;b.setModified();b.getCode().checkValidOffsets(b);
 }
 public static void main(String[] args)throws Exception {
  byte[] bytes=java.nio.file.Files.readAllBytes(java.nio.file.Path.of(args[0]));
  if(!HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)).equals(args[2]))throw new Exception("Unexpected guarded fixture input");
  SWF swf=new SWF(new ByteArrayInputStream(bytes),false);int changed=0;
  for(ABCContainerTag tag:swf.getAbcList()){
   ABC abc=tag.getABC();if(abc.findClassByName("ScreenCharacterSelection")<0)continue;
   body(abc,"ScreenCharacterSelection","method_959",code(abc,0xd0,0x30,0xd0,0xd1,0x70,0x61,"var_1329",0x47));
   body(abc,"ScreenCharacterSelection","method_1077",code(abc,0xd0,0x30,0xd0,0x66,"var_1",0xd0,0x66,"var_400",0x61,"var_1125",0xd0,0x66,"var_1",0x2a,0x66,"clientEntID",0x91,0x61,"clientEntID",0x47));
   ((com.jpexs.decompiler.flash.tags.Tag)tag).setModified(true);changed++;
  }
  if(changed!=1)throw new Exception("Missing unique fixture ABC");
  try(var out=new FileOutputStream(args[1])){swf.saveTo(out);}
 }
}
