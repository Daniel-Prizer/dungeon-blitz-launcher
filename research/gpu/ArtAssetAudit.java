import java.io.*;import java.util.*;import com.jpexs.decompiler.flash.SWF;
// Read-only corpus audit for a future art-only structural admission contract.
// This tool does not approve an asset or modify any downloaded instruction.
public class ArtAssetAudit {
 public static void main(String[] args)throws Exception{for(String file:args){var swf=new SWF(new FileInputStream(file),false);var calls=new TreeMap<String,Integer>();var ops=new TreeMap<String,Integer>();var bases=new TreeSet<String>();int bodies=0;
  for(var tag:swf.getAbcList()){var a=tag.getABC();for(var instance:a.instance_info){var n=a.constants.getMultiname(instance.super_index);bases.add(a.constants.getString(n.name_index));}for(var body:a.bodies){bodies++;for(var ins:body.getCode().code){String name=ins.definition.instructionName;ops.merge(name,1,Integer::sum);if(name.equals("callproperty")||name.equals("callpropvoid")||name.equals("constructprop")){var n=a.constants.getMultiname(ins.operands[0]);String target=a.constants.getString(n.name_index);calls.merge(target==null?"[dynamic]":target,1,Integer::sum);}}}}
  System.out.println(new File(file).getName()+" bodies="+bodies+" bases="+bases+" calls="+calls+" ops="+ops);
 }}
}
