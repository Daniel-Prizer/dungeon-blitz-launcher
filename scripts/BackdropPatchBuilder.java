import java.io.*;import java.util.*;import java.security.MessageDigest;
import com.jpexs.decompiler.flash.SWF;import com.jpexs.decompiler.flash.abc.types.MethodBody;import com.jpexs.decompiler.flash.abc.avm2.instructions.AVM2Instruction;import com.jpexs.decompiler.flash.tags.ABCContainerTag;
public class BackdropPatchBuilder {
 public static void main(String[] args)throws Exception{
  SWF swf=new SWF(new FileInputStream(args[0]),false);int changed=0;
  for(ABCContainerTag tag:swf.getAbcList()){var abc=tag.getABC();MethodBody body=abc.findBodyByClassAndName("class_82","method_193");if(body==null)continue;
   if(!HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(body.getCodeBytes())).equals("82f2a3a5afc711433edf76e945cd5852646258b9081610a7b1cf1b4564ae0f06"))throw new Exception("Unreviewed native background cache");
   body.insertAll(body.getCode().adr2pos(536),Arrays.asList(new AVM2Instruction(0,0x60,new int[]{abc.constants.getPublicQnameId("BlitzDisplay",true)}),new AVM2Instruction(0,0x62,new int[]{5}),new AVM2Instruction(0,0x62,new int[]{6}),new AVM2Instruction(0,0x46,new int[]{abc.constants.getPublicQnameId("BackgroundScale",true),2}),new AVM2Instruction(0,0x75,null),new AVM2Instruction(0,0x63,new int[]{6})));
   body.max_stack=Math.max(body.max_stack,3);body.getCode().checkValidOffsets(body);body.setModified();((com.jpexs.decompiler.flash.tags.Tag)tag).setModified(true);changed++;
  }if(changed!=1)throw new Exception("Expected one background cache edit");try(OutputStream out=new FileOutputStream(args[1])){swf.saveTo(out);}
 }
}
