import java.io.*;
import java.nio.file.*;
import java.security.*;
import java.util.*;
import com.jpexs.decompiler.flash.SWF;
import com.jpexs.decompiler.flash.tags.ABCContainerTag;
import com.jpexs.decompiler.flash.abc.types.MethodBody;
import com.jpexs.decompiler.flash.abc.avm2.instructions.AVM2Instruction;

// Build-only replay of existing presentation expressions onto the reviewed
// October 17 recovery client. Keep every upstream handler and native body.
public class RecoveryPatchBuilder {
 static String hash(byte[] b)throws Exception{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(b));}
 static void copy(byte[] from,int start,byte[] to,int target,int length){System.arraycopy(from,start,to,target,length);}
 public static void main(String[] args)throws Exception{
  if(!hash(Files.readAllBytes(Path.of(args[0]))).equals("f4e87370366d35197daf8c5df83e0c3506ba463153df64a3c69772b78601df8a"))throw new IllegalStateException("Unreviewed recovery deployment");
  SWF swf=new SWF(new FileInputStream(args[0]),false);int count=0;
  String[][] pins={{"Main","method_561","9c4e65e8f28a4ce6258b97e7d798416967282913fead8354fe2c82300a337f0a"},{"class_23","method_1753","e4ab29bedfa9af93e3256295f50b38698d3dba57eb7a510ac13960e79413ee6c"},{"Game","method_1946","33b9d40e99af5371046d967a551f12a6c314673fac84db9dc7fbff523f978d6b"}};
  for(ABCContainerTag tag:swf.getAbcList()){
   var abc=tag.getABC();if(abc.findBodyByClassAndName("Main","method_561")==null)continue;
   for(String[] pin:pins){
    MethodBody body=abc.findBodyByClassAndName(pin[0],pin[1]);if(!hash(body.getCodeBytes()).equals(pin[2]))throw new IllegalStateException("Recovery method mismatch");
    byte[] code=body.getCodeBytes().clone(),template=Files.readAllBytes(Path.of(args[2],pin[0]+"."+pin[1]+".bin"));
    if(pin[0].equals("Main")){
     // Same original debug scratch area, raster ceiling and two clip operands.
     copy(template,2,code,2,54);copy(template,218,code,218,2);
     copy(template,513,code,508,4);copy(template,527,code,522,4);
    }else if(pin[0].equals("class_23")){
     byte[] expected=HexFormat.of().parseHex("62082a1203000029d27611040000");
     if(!Arrays.equals(Arrays.copyOfRange(code,321,335),expected))throw new IllegalStateException("Recovery cache rounding expression moved");
     copy(template,131,code,321,14);
    }else copy(template,4,code,4,17);
    body.setCodeBytes(code);body.getCode();
    if(pin[0].equals("Main")){
     // Insert before native centering; JPEXS relocates the new catch target
     // and its jump back to the original normal cleanup tail as well.
     body.insertAll(body.getCode().adr2pos(440),Arrays.asList(new AVM2Instruction(0,0x62,new int[]{9}),new AVM2Instruction(0,0xd5,new int[]{}),new AVM2Instruction(0,0x62,new int[]{10}),new AVM2Instruction(0,0xd6,new int[]{})));
    }
    body.getCode().checkValidOffsets(body);body.setModified();count++;
   }
   ((com.jpexs.decompiler.flash.tags.Tag)tag).setModified(true);
  }
  if(count!=3)throw new IllegalStateException("Expected three presentation methods");
  try(OutputStream out=new FileOutputStream(args[1])){swf.saveTo(out);}
 }
}
