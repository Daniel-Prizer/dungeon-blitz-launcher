import java.io.*;import java.util.*;import java.security.*;
import com.jpexs.decompiler.flash.SWF;
import com.jpexs.decompiler.flash.abc.ABC;
import com.jpexs.decompiler.flash.abc.types.MethodBody;
import com.jpexs.decompiler.flash.abc.avm2.instructions.AVM2Instruction;
// One reviewed attachment in Main.Init; optional dirty observers preserve all
// original instructions, arguments/results and exception semantics. Clocks,
// gameplay, input and packet operations are never replaced or invoked here.
public class GpuBridgeBuilder {
 static String hash(byte[] b)throws Exception{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(b));}
 static byte[] envelope(MethodBody b)throws Exception{var bytes=new ByteArrayOutputStream();var d=new DataOutputStream(bytes);d.write(b.getCodeBytes());d.writeInt(b.max_stack);d.writeInt(b.max_regs);d.writeInt(b.init_scope_depth);d.writeInt(b.max_scope_depth);for(var e:b.exceptions){d.writeInt(e.start);d.writeInt(e.end);d.writeInt(e.target);d.writeInt(e.type_index);d.writeInt(e.name_index);}return bytes.toByteArray();}
 static AVM2Instruction ins(int op,int... operands){return new AVM2Instruction(0,op,operands);}
 public static void main(String[] args)throws Exception{
  SWF original=new SWF(new FileInputStream(args[0]),false),swf=new SWF(new FileInputStream(args[1]),false);
  if(original.getAbcList().size()+1!=swf.getAbcList().size())throw new Exception("Unexpected research helper tag set");
  boolean mutations=args.length>3,enhanced=args.length>4&&args[4].equals("enhanced"),world=args.length>5&&args[5].equals("gpu-world");int total=0,edited=0,sites=0;var changes=new ArrayList<String>();
  var nativeTags=swf.getAbcList().stream().filter(t->t.getABC().findClassByName("BlitzGpuBridge")<0).toList();
  for(int i=0;i<original.getAbcList().size();i++){
   ABC before=original.getAbcList().get(i).getABC();ABC after=nativeTags.get(i).getABC();
   // The helper is appended after original ABC tags, before ShowFrame.
   if(before.bodies.size()!=after.bodies.size())throw new Exception("Native method count changed");
   MethodBody target=after.findBodyByClassAndName("Main","Init");
   for(int j=0;j<before.bodies.size();j++){var a=before.bodies.get(j);var b=after.bodies.get(j);if(!Arrays.equals(envelope(a),envelope(b)))throw new Exception("Compilation changed native envelope "+i+":"+j);total++;}
   if(mutations)for(var body:after.bodies){if(body==after.findBodyByClassAndName("Game","method_1946"))RawMethodObserver.afterDraw(after,body,enhanced,world);int count=RawMethodObserver.observe(after,body);if(count==0)continue;sites+=count;changes.add(i+":"+body.method_info);((com.jpexs.decompiler.flash.tags.Tag)nativeTags.get(i)).setModified(true);}
   if(target!=null){
    if(!hash(target.getCodeBytes()).equals("6eb0c8e176ad6ae0e8c23f2862882a3f93826f76dcf7c47e7c07582dada7bff9")||target.exceptions.length!=0)throw new Exception("Main.Init reviewed source/envelope changed");
    var code=target.getCode().code;if(!code.get(code.size()-1).definition.instructionName.equals("returnvoid")||code.stream().filter(x->x.definition.instructionName.equals("returnvoid")).count()!=1)throw new Exception("Unexpected attachment return path");
    int at=code.size()-1;target.insertAll(at,List.of(ins(0x60,after.constants.getPublicQnameId("BlitzGpuBridge",true)),ins(0xd0),ins(0x4f,after.constants.getPublicQnameId("Attach",true),1)));
    target.max_stack+=2;target.getCode().checkValidOffsets(target);target.setModified();((com.jpexs.decompiler.flash.tags.Tag)nativeTags.get(i)).setModified(true);edited++;
    // Removing the three owned instructions must recover the exact original
    // body, including branch operands. This catches incoming-edge relocation.
    for(int k=0;k<3;k++)target.removeInstruction(at);
    target.max_stack-=2;if(!Arrays.equals(envelope(target),envelope(before.bodies.get(before.bodies.indexOf(before.findBodyByClassAndName("Main","Init"))))))throw new Exception("Attachment did not reverse exactly");
    target.insertAll(at,List.of(ins(0x60,after.constants.getPublicQnameId("BlitzGpuBridge",true)),ins(0xd0),ins(0x4f,after.constants.getPublicQnameId("Attach",true),1)));target.max_stack+=2;target.getCode().checkValidOffsets(target);target.setModified();
   }
  }
  if(edited!=1)throw new Exception("Expected one attachment");
  if(mutations){var helperTag=swf.getAbcList().stream().filter(t->t.getABC().findClassByName("BlitzGpuBridge")>=0).findFirst().orElseThrow();var helper=helperTag.getABC();var probe=helper.findBodyByClassAndName("BlitzGpuBridge","ObserverProbe");int probeSites=RawMethodObserver.observe(helper,probe);if(probeSites!=10)throw new Exception("Owned native observer probe count changed: "+probeSites);((com.jpexs.decompiler.flash.tags.Tag)helperTag).setModified(true);}
  try(var output=new FileOutputStream(args[2])){swf.saveTo(output);}
  if(mutations){java.nio.file.Files.writeString(java.nio.file.Path.of(args[3]),String.join("\n",changes));if(sites!=(enhanced?395:363))throw new Exception("Pinned mutation inventory count changed: "+sites);}
  System.out.println("Verified "+total+" original envelopes; reversible Main.Init attachment; "+sites+" observer sites in "+changes.size()+" reversible methods");
 }
}
