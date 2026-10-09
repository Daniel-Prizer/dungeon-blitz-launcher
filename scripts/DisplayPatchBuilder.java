import java.io.*;
import java.util.*;
import com.jpexs.decompiler.flash.SWF;
import com.jpexs.decompiler.flash.abc.ABC;
import com.jpexs.decompiler.flash.abc.types.MethodBody;
import com.jpexs.decompiler.flash.abc.avm2.instructions.AVM2Instruction;
import com.jpexs.decompiler.flash.tags.ABCContainerTag;

// Applies only to the exact layout-patched client checked before this builder.
// Same-size substitutions preserve every original branch and exception offset.
public class DisplayPatchBuilder {
 static AVM2Instruction ins(int op,int... args){return new AVM2Instruction(0,op,args);}
 public static void main(String[] args)throws Exception {
  SWF swf=new SWF(new FileInputStream(args[0]),false);int changed=0;
  for(ABCContainerTag tag:swf.getAbcList()){
   ABC abc=tag.getABC();MethodBody layout=abc.findBodyByClassAndName("Main","method_561");if(layout==null)continue;
   Map<Integer,byte[]> original=new HashMap<>();for(MethodBody b:abc.bodies)original.put(b.method_info,b.getCodeBytes().clone());
   byte[] code=layout.getCodeBytes().clone();
   byte[] expected={ (byte)0xd1,0x63,9,(byte)0xd2,0x63,10,0x25,(byte)0x80,9,(byte)0xd5,0x25,(byte)0x80,6,(byte)0xd6 };
   if(!Arrays.equals(Arrays.copyOfRange(code,2,16),expected))throw new IllegalStateException("Unexpected pinned layout prefix");
   int helper=abc.constants.getPublicQnameId("BlitzDisplay",true);
   ByteArrayOutputStream prefix=new ByteArrayOutputStream();
   for(AVM2Instruction i:new AVM2Instruction[]{ins(0xd1),ins(0x63,9),ins(0xd2),ins(0x63,10),
    ins(0x60,helper),ins(0xd0),ins(0x4f,abc.constants.getPublicQnameId("Attach",true),1),
    ins(0x60,helper),ins(0xd1),ins(0x46,abc.constants.getPublicQnameId("Width",true),1),ins(0x73),ins(0xd5),
    ins(0x60,helper),ins(0xd2),ins(0x46,abc.constants.getPublicQnameId("Height",true),1),ins(0x73),ins(0xd6)})prefix.write(i.getBytes());
   if(prefix.size()>54)throw new IllegalStateException("Display prefix exceeds reviewed scratch range");
   Arrays.fill(code,2,56,(byte)2);System.arraycopy(prefix.toByteArray(),0,code,2,prefix.size());
   // Remove only the obsolete 1.25 raster-size ceiling, never DevSettings flags.
   // Leave its condition and control-flow in place; keep scale unchanged there.
   if((code[218]&255)!=0x2f||(code[220]&255)!=0x75||(code[221]&255)!=0xd7)throw new IllegalStateException("Unexpected pinned scale clamp");
   code[218]=(byte)0xd3;code[219]=2;
   // The enlarged picture must clip to the actual stage, not the former
   // 1152x768 scratch viewport. Centering/input still use the saved real size.
   for(int position:new int[]{513,527}){
    if((code[position]&255)!=0x25)throw new IllegalStateException("Unexpected pinned clip dimensions");
    Arrays.fill(code,position,position+4,(byte)2);code[position]=(byte)(position==513?0xd1:0xd2);
   }
   layout.setCodeBytes(code);layout.getCode();layout.max_stack=Math.max(layout.max_stack,4);layout.setModified();layout.getCode().checkValidOffsets(layout);
   for(MethodBody b:abc.bodies)if(b!=layout&&!Arrays.equals(original.get(b.method_info),b.getCodeBytes()))throw new IllegalStateException("Non-display method changed: "+b.method_info);
   ((com.jpexs.decompiler.flash.tags.Tag)tag).setModified(true);changed++;
   System.out.println("Verified native raster layout; untouched method bodies: "+(abc.bodies.size()-1));
  }
  if(changed!=1)throw new IllegalStateException("Expected exactly one reviewed layout method");
  try(OutputStream out=new FileOutputStream(args[1])){swf.saveTo(out);}
 }
}
