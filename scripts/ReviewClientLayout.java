import java.io.*;
import java.nio.file.*;
import java.security.*;
import java.util.*;
import java.util.zip.*;
import com.jpexs.decompiler.flash.SWF;
import com.jpexs.decompiler.flash.abc.ABC;
import com.jpexs.decompiler.flash.abc.types.MethodBody;
import com.jpexs.decompiler.flash.tags.ABCContainerTag;

// Offline review tool only. Never discover/accept arbitrary revisions at runtime.
// Relocates two whole-hash-identical reviewed methods in a separately pinned SWF.
public class ReviewClientLayout {
 static String hash(byte[] bytes)throws Exception{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));}
 static int unique(byte[] body,byte[] code)throws Exception{
  int found=-1;outer:for(int i=0;i<=body.length-code.length;i++){for(int j=0;j<code.length;j++)if(body[i+j]!=code[j])continue outer;if(found!=-1)throw new Exception("Method body is not unique");found=i;}
  if(found<0)throw new Exception("Method body missing from raw SWF");return found;
 }
 static byte[] u30(int value){ByteArrayOutputStream out=new ByteArrayOutputStream();do{int b=value&127;value>>>=7;out.write(value>0?b|128:b);}while(value>0);return out.toByteArray();}
 static int le32(byte[] body,int p){return (body[p]&255)|((body[p+1]&255)<<8)|((body[p+2]&255)<<16)|((body[p+3]&255)<<24);}
 static ABC mainABC(byte[] input)throws Exception{
  ABC result=null;for(ABCContainerTag tag:new SWF(new ByteArrayInputStream(input),false).getAbcList())if(tag.getABC().findBodyByClassAndName("Main","method_561")!=null){if(result!=null)throw new Exception("Duplicate Main ABC");result=tag.getABC();}
  if(result==null)throw new Exception("Main ABC missing");return result;
 }
 static void checkPool(ABC previous,ABC next)throws Exception{
  var a=previous.constants;var b=next.constants;
  if(b.getMultinameCount()<a.getMultinameCount()||b.getIntCount()<a.getIntCount()||b.getUIntCount()<a.getUIntCount()||b.getDoubleCount()<a.getDoubleCount())throw new Exception("Constant pool shrank");
  for(int i=1;i<a.getMultinameCount();i++)if(!a.getMultiname(i).toString(a,null).equals(b.getMultiname(i).toString(b,null)))throw new Exception("Referenced symbol changed: "+i);
  for(int i=1;i<a.getIntCount();i++)if(a.getInt(i)!=b.getInt(i))throw new Exception("Integer constant changed: "+i);
  for(int i=1;i<a.getUIntCount();i++)if(a.getUInt(i)!=b.getUInt(i))throw new Exception("Unsigned constant changed: "+i);
  for(int i=1;i<a.getDoubleCount();i++)if(Double.doubleToLongBits(a.getDouble(i))!=Double.doubleToLongBits(b.getDouble(i)))throw new Exception("Number constant changed: "+i);
 }
 public static void main(String[] args)throws Exception{
  if(args.length!=3)throw new Exception("Usage: ReviewClientLayout new.swf exact-sha256 reviewed-current.swf");
  byte[] input=Files.readAllBytes(Path.of(args[0]));if(!hash(input).equals(args[1])||input.length>2097152||input[0]!='C'||input[1]!='W'||input[2]!='S')throw new Exception("Unreviewed source hash/format");
  byte[] body;try(var in=new InflaterInputStream(new ByteArrayInputStream(input,8,input.length-8))){body=in.readNBytes(3145729);}
  if(body.length>3145728||le32(input,4)!=body.length+8)throw new Exception("Invalid raw SWF length");
  ABC abc=mainABC(input);byte[] previous=Files.readAllBytes(Path.of(args[2]));
  if(!hash(previous).equals("101d60694c4e5cf916c5167e06e544b9ac5dba8a4a4ba570e4d9972c86c5e31b"))throw new Exception("Reference client is not the reviewed revision");
  checkPool(mainABC(previous),abc);
  MethodBody layout=abc.findBodyByClassAndName("Main","method_561"),focus=abc.findBodyByClassAndName("class_71","method_1156");
  if(layout==null||focus==null||!hash(layout.getCodeBytes()).equals("2adb05e53f8d9ee2df8a9e021b314ae6484db1c9a2bed24a4b893182f852f15e")||!hash(focus.getCodeBytes()).equals("5a4c57331cf8c85ac1ac3af2793560eb44b7e2962e4dda1f99577a048d7693df"))throw new Exception("Reviewed presentation methods changed; review their semantics before adapting");
  int ls=unique(body,layout.getCodeBytes()),fs=unique(body,focus.getCodeBytes()),lengthPosition=ls-u30(layout.getCodeBytes().length).length;
  if(!Arrays.equals(Arrays.copyOfRange(body,lengthPosition,ls),u30(layout.getCodeBytes().length)))throw new Exception("Method length prefix mismatch");
  int position=((5+4*((body[0]&255)>>>3))+7)/8+4,abcPosition=-1,abcLength=0;
  while(position<body.length){if(position<0||position+2>body.length)throw new Exception("Truncated tag");int header=(body[position]&255)|((body[position+1]&255)<<8),length=header&63,bytes=2;if(length==63){if(position+6>body.length)throw new Exception("Truncated tag length");length=le32(body,position+2);bytes=6;}
   if(length<0||length>body.length-position-bytes)throw new Exception("Invalid tag size");
   if((header>>>6)==82&&ls>position+bytes&&ls<position+bytes+length&&fs>position+bytes&&fs<position+bytes+length){if(bytes!=6||abcPosition!=-1)throw new Exception("Ambiguous ABC tag");abcPosition=position+2;abcLength=length;}
   position+=bytes+length;
  }
  if(abcPosition<0)throw new Exception("Raw ABC tag missing");
  System.out.printf("{\"inputHash\":\"%s\",\"bodyLength\":%d,\"abcLengthPosition\":%d,\"abcLength\":%d,\"layout\":{\"start\":%d,\"length\":%d,\"lengthPosition\":%d,\"hash\":\"%s\"},\"focus\":{\"start\":%d,\"length\":%d,\"hash\":\"%s\"}}%n",hash(input),body.length,abcPosition,abcLength,ls,layout.getCodeBytes().length,lengthPosition,hash(layout.getCodeBytes()),fs,focus.getCodeBytes().length,hash(focus.getCodeBytes()));
 }
}
