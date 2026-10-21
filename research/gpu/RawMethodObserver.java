import java.io.*;import java.util.*;
import com.jpexs.decompiler.flash.abc.ABC;
import com.jpexs.decompiler.flash.abc.types.MethodBody;
import com.jpexs.decompiler.flash.abc.avm2.instructions.AVM2Instruction;
// JPEXS normalizes some unreachable obfuscator branches on reassembly. This
// research instrumenter uses it ONLY to identify instruction boundaries and
// native names. Preserve original encoded bytes, relocate raw branch/exception
// destinations, and prove the complete transformation reverses byte-exactly.
public class RawMethodObserver {
 record Piece(int start,int length,byte[] prefix){}
 static byte[] u(int value){var out=new ByteArrayOutputStream();do{int b=value&127;value>>>=7;out.write(b|(value!=0?128:0));}while(value!=0);return out.toByteArray();}
 static void instruction(ByteArrayOutputStream out,int op,int... operands)throws Exception{out.write(op);for(int operand:operands)out.write(u(operand));}
 static int signed(byte[] b,int at){int n=(b[at]&255)|((b[at+1]&255)<<8)|((b[at+2]&255)<<16);return (n&0x800000)!=0?n|0xff000000:n;}
 static void signed(byte[] b,int at,int value)throws Exception{if(value< -0x800000||value>0x7fffff)throw new Exception("Relocated branch exceeds s24");for(int i=0;i<3;i++)b[at+i]=(byte)(value>>(i*8));}
 static int map(int at,List<Piece> pieces){int result=at;for(var p:pieces)if(p.start()<at)result+=p.prefix().length;return result;}
 static int instructionAt(int at,List<Piece> pieces){int result=map(at,pieces);for(var p:pieces)if(p.start()==at)result+=p.prefix().length;return result;}
 static int inverse(int at,List<Piece> pieces,int length)throws Exception{int low=0,high=length;while(low<=high){int middle=low+(high-low)/2,value=map(middle,pieces);if(value==at)return middle;if(value<at)low=middle+1;else high=middle-1;}throw new Exception("Branch enters an owned observer prefix");}
 static List<Integer> branches(byte[] raw,Piece piece)throws Exception{
  int op=raw[piece.start()]&255;if(op>=0x0c&&op<=0x1a){if(piece.length()!=4)throw new Exception("Unexpected branch width");return List.of(1);}
  if(op!=0x1b)return List.of();var result=new ArrayList<Integer>();result.add(1);int at=piece.start()+4,value=0,shift=0;for(;;){if(at>=raw.length||shift>28)throw new Exception("Invalid switch count");int b=raw[at++]&255;value|=(b&127)<<shift;shift+=7;if((b&128)==0)break;}
  if(value>65535||at+3*(value+1)!=piece.start()+piece.length())throw new Exception("Invalid switch extent");for(int i=0;i<=value;i++)result.add(at+3*i-piece.start());return result;
 }
 static int observe(ABC abc,MethodBody body)throws Exception{
  byte[] raw=body.getCodeBytes().clone();var code=body.getCode().code;var pieces=new ArrayList<Piece>();var boundaries=new HashSet<Integer>();int base=body.max_regs,extra=0,count=0;
  for(int i=0;i<code.size();i++){
   var ins=code.get(i);int start=(int)ins.getAddress(),end=i+1<code.size()?(int)code.get(i+1).getAddress():raw.length;if(start<0||end<=start||end>raw.length||raw[start]!=ins.getBytes()[0])throw new Exception("Native instruction boundaries changed");boundaries.add(start);
   byte[] prefix=new byte[0];String op=ins.definition.instructionName;
   if(op.equals("callproperty")||op.equals("callpropvoid")){
    var name=abc.constants.getMultiname(ins.operands[0]);if(BitmapWriteInventory.names.contains(abc.constants.getString(name.name_index))){
     if(name.kind!=7&&name.kind!=9)throw new Exception("Late mutation namespace requires review");int args=ins.operands[1];if(args<0||args>16)throw new Exception("Mutation argument budget exceeded");
     var bytes=new ByteArrayOutputStream();for(int n=args;n>=0;n--)instruction(bytes,0x63,base+n);
     instruction(bytes,0x60,abc.constants.getPublicQnameId("BlitzGpuBridge",true));instruction(bytes,0x62,base);instruction(bytes,0x4f,abc.constants.getPublicQnameId("Mark",true),1);
     for(int n=0;n<=args;n++)instruction(bytes,0x62,base+n);prefix=bytes.toByteArray();extra=Math.max(extra,args+1);count++;
    }
   }pieces.add(new Piece(start,end-start,prefix));
  }
  if(count==0)return 0;rewrite(body,raw,pieces,boundaries,base+extra,2);return count;
 }
 static void afterDraw(ABC abc,MethodBody body,boolean enhanced,boolean world)throws Exception{
  byte[] raw=body.getCodeBytes().clone();String digest=GpuBridgeBuilder.hash(raw);
  // October 21 appends two native multinames. Only the two existing helper
  // operands at code offsets 7/11 relocate by two; all drawing bytes/targets
  // and exception envelopes remain identical. Keep both exact reviewed pins.
  if(enhanced?!Set.of("afb8c09010bf2389a5c5131a0c179845c0a9df15a6606cd5a6917e145380cd15","a22c1e913633a3e8f6abe61303f6c7327499d94d78aec8a72ccc90656990cd7c").contains(digest):!digest.equals("33b9d40e99af5371046d967a551f12a6c314673fac84db9dc7fbff523f978d6b"))throw new Exception("Reviewed final-draw method changed");
  var code=body.getCode().code;var pieces=new ArrayList<Piece>();var boundaries=new HashSet<Integer>();int count=0;
  for(int i=0;i<code.size();i++){var ins=code.get(i);int start=(int)ins.getAddress(),end=i+1<code.size()?(int)code.get(i+1).getAddress():raw.length;byte[] prefix=new byte[0];boundaries.add(start);
   if(ins.definition.instructionName.equals("returnvoid")){var bytes=new ByteArrayOutputStream();instruction(bytes,0x60,abc.constants.getPublicQnameId("BlitzGpuBridge",true));instruction(bytes,0xd0);instruction(bytes,0x4f,abc.constants.getPublicQnameId("AfterDraw",true),1);prefix=bytes.toByteArray();count++;}
   if(world&&start==278){if(!enhanced||!ins.definition.instructionName.equals("getlocal0"))throw new Exception("Reviewed compositor entry changed");var bytes=new ByteArrayOutputStream();instruction(bytes,0x60,abc.constants.getPublicQnameId("BlitzGpuBridge",true));instruction(bytes,0xd0);instruction(bytes,0x46,abc.constants.getPublicQnameId("World",true),1);bytes.write(new byte[]{0x11,0,0,0});prefix=bytes.toByteArray();}pieces.add(new Piece(start,end-start,prefix));
  }if(count!=3||world&&!boundaries.contains(881))throw new Exception("Reviewed final-draw paths changed");
  if(world){var entry=pieces.stream().filter(p->p.start()==278).findFirst().orElseThrow();if(entry.prefix().length<4)throw new Exception("Missing guarded compositor prefix");signed(entry.prefix(),entry.prefix().length-3,map(881,pieces)-(map(278,pieces)+entry.prefix().length));}
  rewrite(body,raw,pieces,boundaries,body.max_regs,2);
 }
 static void rewrite(MethodBody body,byte[] raw,List<Piece> pieces,Set<Integer> boundaries,int registers,int addedStack)throws Exception{
  boundaries.add(raw.length);
  var stream=new ByteArrayOutputStream();for(var p:pieces){stream.write(p.prefix());stream.write(raw,p.start(),p.length());}byte[] output=stream.toByteArray();
  for(var p:pieces)for(int offset:branches(raw,p)){
   int origin=(raw[p.start()]&255)==0x1b?p.start():p.start()+4,oldTarget=origin+signed(raw,p.start()+offset);
   if(!boundaries.contains(oldTarget))throw new Exception("Native branch does not target a reviewed instruction boundary: "+p.start()+" -> "+oldTarget);
   int newOrigin=instructionAt(p.start(),pieces)+((raw[p.start()]&255)==0x1b?0:4);signed(output,instructionAt(p.start(),pieces)+offset,map(oldTarget,pieces)-newOrigin);
  }
  // Remove ONLY inserted prefixes and reverse every relocated raw target.
  var undo=new ByteArrayOutputStream();for(var p:pieces)undo.write(output,instructionAt(p.start(),pieces),p.length());byte[] reversed=undo.toByteArray();
  for(var p:pieces)for(int offset:branches(raw,p)){
   int newOrigin=instructionAt(p.start(),pieces)+((raw[p.start()]&255)==0x1b?0:4),target=newOrigin+signed(output,instructionAt(p.start(),pieces)+offset);
   int oldOrigin=p.start()+((raw[p.start()]&255)==0x1b?0:4);signed(reversed,p.start()+offset,inverse(target,pieces,raw.length)-oldOrigin);
  }
  if(!Arrays.equals(raw,reversed))throw new Exception("Raw mutation observer did not reverse byte-exactly");
  for(var e:body.exceptions){int a=e.start,b=e.end,c=e.target;if(!boundaries.contains(a)||!boundaries.contains(b)||!boundaries.contains(c))throw new Exception("Exception does not use native instruction boundaries");int nextA=map(a,pieces),nextB=map(b,pieces),nextC=map(c,pieces);if(inverse(nextA,pieces,raw.length)!=a||inverse(nextB,pieces,raw.length)!=b||inverse(nextC,pieces,raw.length)!=c)throw new Exception("Exception failed reverse proof");e.start=nextA;e.end=nextB;e.target=nextC;}
  body.max_regs=registers;body.max_stack+=addedStack;body.setModified();body.setCodeBytes(output);
 }
}
