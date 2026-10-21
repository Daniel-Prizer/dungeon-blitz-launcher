import java.io.*;import java.util.*;import com.jpexs.decompiler.flash.SWF;import com.jpexs.decompiler.flash.abc.types.traits.*;
// Enumerate the complete pinned client's possible graphics/cache mutations.
// Names alone are not proof of receiver type; the runtime observer must test
// native BitmapData/Graphics identity and leave the original call untouched.
public class BitmapWriteInventory {
 static final Set<String> names=Set.of("applyFilter","colorTransform","copyChannel","copyPixels","dispose","draw","drawWithQuality","fillRect","floodFill","merge","noise","paletteMap","perlinNoise","pixelDissolve","scroll","setPixel","setPixel32","setPixels","setVector","threshold","clear","beginFill","beginBitmapFill","beginGradientFill","beginShaderFill","lineStyle","lineBitmapStyle","lineGradientStyle","moveTo","lineTo","curveTo","cubicCurveTo","drawCircle","drawEllipse","drawRect","drawRoundRect","drawRoundRectComplex","drawPath","drawTriangles","drawGraphicsData","endFill","copyFrom");
 public static void main(String[] args)throws Exception{
  int tags=0,total=0;
  for(var tag:new SWF(new FileInputStream(args[0]),false).getAbcList()){
   var a=tag.getABC();var owners=new HashMap<Integer,String>();
   for(int i=0;i<a.instance_info.size();i++){
    String c=a.constants.getString(a.constants.getMultiname(a.instance_info.get(i).name_index).name_index);owners.put(a.instance_info.get(i).iinit_index,c+".iinit");owners.put(a.class_info.get(i).cinit_index,c+".cinit");
    for(var ts:new Traits[]{a.instance_info.get(i).instance_traits,a.class_info.get(i).static_traits})for(var t:ts.traits)if(t instanceof TraitMethodGetterSetter m)owners.put(m.method_info,c+"."+a.constants.getString(a.constants.getMultiname(m.name_index).name_index));
   }
   for(var b:a.bodies)for(var instruction:b.getCode().code){String op=instruction.definition.instructionName;if(!op.equals("callproperty")&&!op.equals("callpropvoid"))continue;var multi=a.constants.getMultiname(instruction.operands[0]);String name=a.constants.getString(multi.name_index);if(!names.contains(name))continue;
    total++;System.out.println(tags+":"+b.method_info+" "+owners.getOrDefault(b.method_info,"anonymous")+" @"+instruction.getAddress()+" "+name+" argc="+instruction.operands[1]);
   }tags++;
  }System.out.println("TOTAL "+total);
 }
}
