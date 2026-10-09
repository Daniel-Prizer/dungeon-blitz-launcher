import java.io.*;
import java.util.*;
import com.jpexs.decompiler.flash.SWF;
import com.jpexs.decompiler.flash.abc.ABC;
import com.jpexs.decompiler.flash.abc.types.MethodBody;
import com.jpexs.decompiler.flash.abc.types.traits.*;
import com.jpexs.decompiler.flash.abc.avm2.instructions.AVM2Instruction;
import com.jpexs.decompiler.flash.tags.ABCContainerTag;

// Build-time only. Uses JPEXS's relocation-aware instruction insertion to
// preserve branches/exception ranges; never runs in the shipped launcher.
public class AudioPatchBuilder {
 static AVM2Instruction ins(int op,int... args){return new AVM2Instruction(0,op,args);}
 static String name(ABC abc,int index){String value=abc.constants.getString(abc.constants.getMultiname(index).name_index);return value==null?"":value;}
 static List<AVM2Instruction> invoke(ABC abc,String method,String owner) {
  List<AVM2Instruction> code=new ArrayList<>();
  code.add(ins(0x60,abc.constants.getPublicQnameId("BlitzAudio",true)));
  if(owner!=null){code.add(ins(0xd0));if(!owner.equals("this")){
   int field=0;for(int i=1;i<abc.constants.getMultinameCount();i++)if(name(abc,i).equals(owner)){field=i;break;}
   if(field==0)throw new IllegalStateException("Missing owner field "+owner);
   code.add(ins(0x66,field));
  }}
  code.add(ins(0x4f,abc.constants.getPublicQnameId(method,true),owner==null?0:1));return code;
 }
 static int wrap(ABC abc,MethodBody body,String owner,boolean room) {
  int changed=0;
  for(int i=body.getCode().code.size()-1;i>=0;i--){
   AVM2Instruction instruction=body.getCode().code.get(i);String op=instruction.definition.instructionName;
   if(!op.equals("callproperty")&&!op.equals("callpropvoid"))continue;
   String target=name(abc,instruction.operands[0]);
   if(!(target.equals("method_82")||target.equals("Play")))continue;
   if(room&&!target.equals("Play"))continue;
   insertAfter(body,i+1,invoke(abc,"Pop",null));
   body.insertAll(i,invoke(abc,room?"PushEnvironment":"PushOwner",room?null:owner));
   changed++;
  }
  if(changed>0){body.max_stack+=2;body.getCode().checkValidOffsets(body);body.setModified();}
  return changed;
 }
 static void insertAfter(MethodBody body,int position,List<AVM2Instruction> instructions){for(AVM2Instruction instruction:instructions)body.insertInstruction(position++,instruction,true);}
 static List<AVM2Instruction> call(ABC abc,String method,int... locals){
  List<AVM2Instruction> code=new ArrayList<>();code.add(ins(0x60,abc.constants.getPublicQnameId("BlitzAudio",true)));
  for(int local:locals)code.add(ins(0x62,local));code.add(ins(0x4f,abc.constants.getPublicQnameId(method,true),locals.length));return code;
 }
 static void soundHooks(ABC abc){
  MethodBody tick=abc.findBodyByClassAndName("SoundManager","method_1017");
  for(int i=tick.getCode().code.size()-1;i>=0;i--)if(tick.getCode().code.get(i).definition.instructionName.equals("returnvoid"))tick.insertAll(i,call(abc,"AfterTick"));
  tick.insertAll(0,call(abc,"BeforeTick"));tick.max_stack+=1;tick.setModified();tick.getCode().checkValidOffsets(tick);
  String[] methods={"Play","method_103","method_748","method_218"};int[] locals={11,6,6,5};int[] expected={2,1,1,1};
  for(int n=0;n<methods.length;n++){
   MethodBody body=abc.findBodyByClassAndName("SoundManager",methods[n]);int count=0;
   for(int i=body.getCode().code.size()-1;i>=0;i--){AVM2Instruction inst=body.getCode().code.get(i);
    if(inst.definition.instructionName.equals("setproperty")&&name(abc,inst.operands[0]).equals("soundTransform")){
     insertAfter(body,i+1,n==0?call(abc,"Track",locals[n]):call(abc,"TrackStream",1,locals[n]));count++;
    }
   }
   if(count!=expected[n])throw new IllegalStateException("Reviewed gain assignment count changed: "+methods[n]+" "+count);
   body.max_stack+=3;body.setModified();body.getCode().checkValidOffsets(body);
  }
 }
 public static void main(String[] args)throws Exception {
  SWF swf=new SWF(new FileInputStream(args[0]),false);
  Map<String,String> owners=Map.of("Entity","this","ActivePower","var_4","CombatState","var_3","ChatBubble","var_19","class_130","var_19");
  int total=0;
  for(ABCContainerTag tag:swf.getAbcList()){
   ABC abc=tag.getABC();boolean edited=false;
   Map<Integer,byte[]> original=new HashMap<>();for(MethodBody body:abc.bodies)original.put(body.method_info,body.getCodeBytes().clone());
   Set<Integer> allowed=new HashSet<>();
   for(String method:new String[]{"method_1017","Play","method_103","method_748","method_218"}){MethodBody body=abc.findBodyByClassAndName("SoundManager",method);if(body!=null)allowed.add(body.method_info);}
   if(abc.findClassByName("SoundManager")>=0){soundHooks(abc);edited=true;}
   for(int ci=0;ci<abc.instance_info.size();ci++){
    String cls=name(abc,abc.instance_info.get(ci).name_index);if(!owners.containsKey(cls)&&!cls.equals("Room"))continue;
    Set<Integer> methods=new HashSet<>();methods.add(abc.instance_info.get(ci).iinit_index);
    for(Trait trait:abc.instance_info.get(ci).instance_traits.traits)if(trait instanceof TraitMethodGetterSetter)methods.add(((TraitMethodGetterSetter)trait).method_info);
    for(int id:methods){MethodBody body=abc.findBody(id);if(body==null)continue;int count=wrap(abc,body,owners.get(cls),cls.equals("Room"));if(count>0){allowed.add(id);total+=count;edited=true;System.out.println("Audio owner routes: "+cls+" method "+id+" calls "+count);}}
   }
   if(edited)((com.jpexs.decompiler.flash.tags.Tag)tag).setModified(true);
   for(MethodBody body:abc.bodies)if(!allowed.contains(body.method_info)&&!Arrays.equals(original.get(body.method_info),body.getCodeBytes()))throw new IllegalStateException("Non-audio method changed: "+body.method_info);
   if(edited)System.out.println("Verified untouched original method bodies: "+(abc.bodies.size()-allowed.size()));
  }
  if(total!=21)throw new IllegalStateException("Reviewed call count changed: "+total);
  try(OutputStream stream=new FileOutputStream(args[1])){swf.saveTo(stream);}
 }
}
