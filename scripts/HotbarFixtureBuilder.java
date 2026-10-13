import java.io.*;
import java.util.*;
import java.security.*;
import com.jpexs.decompiler.flash.SWF;
import com.jpexs.decompiler.flash.abc.ABC;
import com.jpexs.decompiler.flash.abc.types.MethodBody;
import com.jpexs.decompiler.flash.abc.avm2.instructions.AVM2Instruction;
import com.jpexs.decompiler.flash.tags.ABCContainerTag;
// Unshipped diagnostic only. No account, socket, resource or player startup.
public class HotbarFixtureBuilder {
 static int qname(ABC abc,String value){for(int i=1;i<abc.constants.getMultinameCount();i++){var name=abc.constants.getMultiname(i);if(name.name_index>0&&abc.constants.getString(name.name_index).equals(value))return i;}throw new IllegalStateException(value);}
 static void ctor(ABC abc,String type,int field)throws Exception {
  int index=abc.findClassByName(type);MethodBody body=abc.findBody(abc.instance_info.get(index).iinit_index);
  ByteArrayOutputStream code=new ByteArrayOutputStream();
  for(var i:new AVM2Instruction[]{new AVM2Instruction(0,0xd0,null),new AVM2Instruction(0,0x30,null),new AVM2Instruction(0,0xd0,null),new AVM2Instruction(0,0x49,new int[]{0}),new AVM2Instruction(0,0xd0,null),new AVM2Instruction(0,0xd1,null),new AVM2Instruction(0,0x61,new int[]{field}),new AVM2Instruction(0,0x47,null)})code.write(i.getBytes());
  body.setCodeBytes(code.toByteArray());body.getCode().checkValidOffsets(body);body.exceptions=new com.jpexs.decompiler.flash.abc.types.ABCException[0];body.max_stack=2;body.setModified();
 }
 public static void main(String[] a)throws Exception {
  byte[] bytes=java.nio.file.Files.readAllBytes(java.nio.file.Path.of(a[0]));
  if(!HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)).equals(a[2]))throw new IllegalStateException("Snapshot changed");
  SWF swf=new SWF(new ByteArrayInputStream(bytes),false);int edited=0;
  for(ABCContainerTag tag:swf.getAbcList()){ABC abc=tag.getABC();if(abc.findClassByName("Game")<0)continue;
   ctor(abc,"Game",qname(abc,"main"));ctor(abc,"Entity",qname(abc,"var_1"));((com.jpexs.decompiler.flash.tags.Tag)tag).setModified(true);edited++;
  }
  if(edited!=1)throw new IllegalStateException("Expected one Game");try(OutputStream out=new FileOutputStream(a[1])){swf.saveTo(out);}
 }
}
