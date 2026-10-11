import java.io.*;
import java.util.*;
import java.security.MessageDigest;
import com.jpexs.decompiler.flash.SWF;
import com.jpexs.decompiler.flash.abc.ABC;
import com.jpexs.decompiler.flash.abc.types.MethodBody;
import com.jpexs.decompiler.flash.abc.avm2.instructions.AVM2Instruction;
import com.jpexs.decompiler.flash.tags.ABCContainerTag;

// Unshipped fixture only: skip Game's network/resource initialization, retaining
// the actual allocator, display adapter, input conversion and UI root classes.
public class TransitionFixtureBuilder {
 static String name(ABC abc,int n){return abc.constants.getString(abc.constants.getMultiname(n).name_index);}
 public static void main(String[] args)throws Exception {
  SWF swf=new SWF(new FileInputStream(args[0]),false);int changed=0;
  for(ABCContainerTag tag:swf.getAbcList()){
   ABC abc=tag.getABC();int index=abc.findClassByName("Game");if(index<0)continue;
   MethodBody allocator=abc.findBodyByClassAndName("Game","method_1947");
   String hash=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(allocator.getCodeBytes()));
   if(!hash.equals("472c1b22356dac968d260da0a48687c247da761be2e779f1d1a6bf624132b768"))throw new IllegalStateException("Unexpected corrected allocator");
   int main=0;
   for(AVM2Instruction i:allocator.getCode().code)if(i.definition.instructionName.equals("getproperty")&&name(abc,i.operands[0]).equals("main")){main=i.operands[0];break;}
   if(main==0)throw new IllegalStateException("Missing internal main field");
   MethodBody ctor=abc.findBody(abc.instance_info.get(index).iinit_index);
   if(ctor.exceptions.length!=0)throw new IllegalStateException("Unexpected constructor exceptions");
   ByteArrayOutputStream code=new ByteArrayOutputStream();
   for(AVM2Instruction i:new AVM2Instruction[]{new AVM2Instruction(0,0xd0,null),new AVM2Instruction(0,0x30,null),new AVM2Instruction(0,0xd0,null),new AVM2Instruction(0,0x49,new int[]{0}),new AVM2Instruction(0,0xd0,null),new AVM2Instruction(0,0xd1,null),new AVM2Instruction(0,0x61,new int[]{main}),new AVM2Instruction(0,0x47,null)})code.write(i.getBytes());
   ctor.setCodeBytes(code.toByteArray());ctor.getCode();ctor.max_stack=2;ctor.setModified();ctor.getCode().checkValidOffsets(ctor);
   // Owned, unshipped fixture: an empty Entity supplies typed room identity,
   // without running account/network/player initialization or any game input.
   int entity=abc.findClassByName("Entity");
   MethodBody entityCtor=abc.findBody(abc.instance_info.get(entity).iinit_index);
   entityCtor.setCodeBytes(HexFormat.of().parseHex("d030d0490047"));entityCtor.getCode();entityCtor.exceptions=new com.jpexs.decompiler.flash.abc.types.ABCException[0];entityCtor.max_stack=1;entityCtor.setModified();
   if(args.length>2&&args[2].equals("baseline")){
    SWF source=new SWF(new FileInputStream(args[3]),false);
    byte[] originalCrop=null;
    for(ABCContainerTag sourceTag:source.getAbcList()){
     MethodBody crop=sourceTag.getABC().findBodyByClassAndName("SuperAnimData","method_200");
     if(crop!=null)originalCrop=crop.getCodeBytes();
    }
    if(originalCrop==null||!HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(originalCrop)).equals("c587e8238e1571a12664a441d153dbcbacff303069dc6740c8b7ba192cbff28e"))throw new IllegalStateException("Unreviewed crop baseline");
    MethodBody cropBaseline=abc.findBodyByClassAndName("SuperAnimData","method_200");cropBaseline.setCodeBytes(originalCrop);cropBaseline.getCode();
    byte[] original=allocator.getCodeBytes().clone();Arrays.fill(original,436,474,(byte)2);
    byte[] fixed={0x25,(byte)0x80,0x10,0x25,(byte)0x80,9};System.arraycopy(fixed,0,original,436,fixed.length);
    if(!HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(original)).equals("baf51368e22c568f758efda185540460f7d39b5384b3ff3d6792821838fae506"))throw new IllegalStateException("Baseline reconstruction mismatch");
    allocator.setCodeBytes(original);allocator.getCode().checkValidOffsets(allocator);allocator.setCodeBytes(original);
   }
   if(args.length>2&&args[2].equals("cache-baseline")){
    MethodBody cache=abc.findBodyByClassAndName("class_23","method_1753");
    byte[] original=cache.getCodeBytes().clone();
    byte[] guard=HexFormat.of().parseHex("62082a1203000029d27611040000");
    System.arraycopy(guard,0,original,0x83,guard.length);
    if(!HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(original)).equals("6eb2b5564dc4cfb3ad9afa62e7ef2d264f806416c013229edbcde107067f8a4c"))throw new IllegalStateException("Cache baseline reconstruction mismatch");
    cache.setCodeBytes(original);cache.getCode().checkValidOffsets(cache);cache.setCodeBytes(original);
   }
   if(args.length>2&&args[2].equals("reuse-baseline")){
    MethodBody reuse=abc.findBodyByClassAndName("class_23","method_1389");byte[] original=reuse.getCodeBytes().clone();original[312]=2;
    if(!HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(original)).equals("5f91731eaabfb8a921914bd5b31a8802123761f932292e0ddc841ce57fe1f34d"))throw new IllegalStateException("Tile reuse baseline reconstruction mismatch");
    reuse.setCodeBytes(original);reuse.getCode().checkValidOffsets(reuse);reuse.setCodeBytes(original);
   }
   ((com.jpexs.decompiler.flash.tags.Tag)tag).setModified(true);changed++;
  }
  if(changed!=1)throw new IllegalStateException("Fixture must modify one Game only");
  try(OutputStream out=new FileOutputStream(args[1])){swf.saveTo(out);}
 }
}
