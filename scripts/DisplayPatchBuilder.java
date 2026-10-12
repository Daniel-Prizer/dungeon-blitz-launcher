import java.io.*;
import java.util.*;
import java.security.MessageDigest;
import com.jpexs.decompiler.flash.SWF;
import com.jpexs.decompiler.flash.abc.ABC;
import com.jpexs.decompiler.flash.abc.types.MethodBody;
import com.jpexs.decompiler.flash.abc.avm2.instructions.AVM2Instruction;
import com.jpexs.decompiler.flash.tags.ABCContainerTag;

// Applies only to the exact layout-patched client checked before this builder.
// Same-size substitutions preserve every original branch and exception offset.
public class DisplayPatchBuilder {
 static AVM2Instruction ins(int op,int... args){return new AVM2Instruction(0,op,args);}
 static void reviewInput(ABC abc)throws Exception {
  String[][] methods={
   {"Game","method_1880","50b45ff8778bd836b027deae4276ff80ca9282ac4e438e93020229319bd34727"},
   {"Game","method_702","0950f873106a78d0cc22505770c6dfab10ba11e1787f2ddf32a8bfccedc0fc33"},
   {"Game","method_1949","b69e5a1395896051280a9be625bfc711754fea4862bee8aba76a2a89f0990548"},
   {"class_108","method_31","776c867ca6219b0f7c354a567d61494aae94a82c3fef396d8b1dc256d5b01eb1"},
   {"class_108","method_907","d53a585e33f4b55a6907cfa7345fb64bb9f1694dd9a0f338f9b41e74968f657a"}};
  for(String[] item:methods){MethodBody body=abc.findBodyByClassAndName(item[0],item[1]);
   if(body==null||!HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(body.getCodeBytes())).equals(item[2]))throw new IllegalStateException("Unreviewed key mapping/menu handler: "+item[0]+"."+item[1]);
  }
  System.out.println("Verified original mount key mapping and Escape menu handlers; no input/gameplay body changes");
 }
 static MethodBody correctCacheCheck(ABC abc)throws Exception {
  MethodBody body=abc.findBodyByClassAndName("class_23","method_1753");
  if(body==null||!HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(body.getCodeBytes())).equals("6eb2b5564dc4cfb3ad9afa62e7ef2d264f806416c013229edbcde107067f8a4c"))throw new IllegalStateException("Unreviewed texture-cache resize check");
  // Allocation uses ceil(tileWidth * rasterScale), but this comparison used
  // the fractional product. At widescreen scales that destroys/rebuilds the
  // entire terrain cache every frame. Round exactly as the original allocator.
  // Replace only the always-false obfuscator guard; preserve all offsets.
  byte[] code=body.getCodeBytes().clone();
  byte[] guard=HexFormat.of().parseHex("62082a1203000029d27611040000");
  if(!Arrays.equals(Arrays.copyOfRange(code,0x83,0x91),guard))throw new IllegalStateException("Cache guard mismatch");
  ByteArrayOutputStream replacement=new ByteArrayOutputStream();
  for(AVM2Instruction i:new AVM2Instruction[]{ins(0x60,abc.constants.getPublicQnameId("Math",true)),ins(0x2b),ins(0x46,abc.constants.getPublicQnameId("ceil",true),1)})replacement.write(i.getBytes());
  if(replacement.size()>guard.length)throw new IllegalStateException("Cache rounding exceeds reviewed range");
  Arrays.fill(code,0x83,0x91,(byte)2);System.arraycopy(replacement.toByteArray(),0,code,0x83,replacement.size());
  body.setCodeBytes(code);body.getCode().checkValidOffsets(body);body.setCodeBytes(code);return body;
 }
 static boolean restoreTransition(ABC abc)throws Exception {
  MethodBody body=abc.findBodyByClassAndName("Game","method_1947");if(body==null)throw new IllegalStateException("Missing reviewed transition canvas allocator");
  String hash=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(body.getCodeBytes()));
  if(hash.equals("472c1b22356dac968d260da0a48687c247da761be2e779f1d1a6bf624132b768"))return false;
  // October 11 upstream now sizes the transition from the preceding real
  // canvas bitmap. Keep its complete method intact; the exact source/method
  // hashes and real transition fixture establish compatibility separately.
  if(hash.equals("87bef2738ee6a0d598ea359f8877e38ce742ec1cb80a1ddf97d34ecb84149afc"))return false;
  if(!hash.equals("baf51368e22c568f758efda185540460f7d39b5384b3ff3d6792821838fae506"))throw new IllegalStateException("Unreviewed transition allocation method");
  // The new live client replaced precisely these 38 bytes with fixed 2048x1152
  // dimensions and padding. Restore the original Camera-size * native-scale
  // allocation; retain all branches, fade state, input, clocks and gameplay.
  byte[] code=body.getCodeBytes().clone();
  byte[] original=HexFormat.of().parseHex("602160c70166fa01d0665666e701a246b90201602160c701668904d0665666e701a246b90201");
  System.arraycopy(original,0,code,436,original.length);
  if(!HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(code)).equals("472c1b22356dac968d260da0a48687c247da761be2e779f1d1a6bf624132b768"))throw new IllegalStateException("Transition allocation restoration mismatch");
  body.setCodeBytes(code);body.getCode().checkValidOffsets(body);
  // JPEXS normalizes an unreachable obfuscator jump to the method end when
  // checking offsets. Keep the reviewed raw body, including that original jump.
  body.setCodeBytes(code);return true;
 }
 static MethodBody correctTileReuse(ABC abc)throws Exception {
  MethodBody body=abc.findBodyByClassAndName("class_23","method_1389");
  if(body==null||!HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(body.getCodeBytes())).equals("5f91731eaabfb8a921914bd5b31a8802123761f932292e0ddc841ce57fe1f34d"))throw new IllegalStateException("Unreviewed terrain tile reuse policy");
  byte[] code=body.getCodeBytes().clone();
  if(!Arrays.equals(Arrays.copyOfRange(code,311,340),HexFormat.of().parseHex("2402a0ae092a1252ffff62072a1103000029d276120d00002910a3ffff")))throw new IllegalStateException("Terrain protection range mismatch");
  // The six staggered half-columns also prefetch a seventh boundary column.
  // Protect that complete range, including equal LRU timestamps during a
  // stalled clock. The old start+2 guard can evict an already checked visible
  // tile in that condition. The original 100-MB pool budget is unchanged;
  // original-width rendering keeps the small extra protected cache ring.
  // Change one operand only, preserving all branch/exception addresses.
  code[312]=6;body.setCodeBytes(code);body.getCode().checkValidOffsets(body);body.setCodeBytes(code);return body;
 }
 static MethodBody correctCrop(ABC abc)throws Exception {
  MethodBody body=abc.findBodyByClassAndName("SuperAnimData","method_200");
  if(body==null||!HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(body.getCodeBytes())).equals("c587e8238e1571a12664a441d153dbcbacff303069dc6740c8b7ba192cbff28e"))throw new IllegalStateException("Unreviewed raster crop transform");
  byte[] code=body.getCodeBytes().clone();
  // Consume the clone already on the stack, then mutate that same inverse
  // matrix through the launcher-owned helper. Keep every branch address.
  ByteArrayOutputStream replacement=new ByteArrayOutputStream();
  for(AVM2Instruction i:new AVM2Instruction[]{ins(0x29),ins(0x60,abc.constants.getPublicQnameId("BlitzDisplay",true)),ins(0x62,27),ins(0x62,24),ins(0x4f,abc.constants.getPublicQnameId("CorrectCrop",true),2)})replacement.write(i.getBytes());
  if(replacement.size()>12)throw new IllegalStateException("Crop fix exceeds reviewed call range");
  Arrays.fill(code,2415,2427,(byte)2);System.arraycopy(replacement.toByteArray(),0,code,2415,replacement.size());
  body.setCodeBytes(code);body.getCode().checkValidOffsets(body);body.setCodeBytes(code);return body;
 }
 static MethodBody correctCameraFloor(ABC abc)throws Exception {
  MethodBody body=abc.findBodyByClassAndName("Camera","method_1073");
  if(body==null||!HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(body.getCodeBytes())).equals("123d341e993ad9ae659b7b4fa85d924938c9988f780bc10ab86a7d653ed8bede"))throw new IllegalStateException("Unreviewed camera floor probes");
  byte[] code=body.getCodeBytes().clone();
  int[] starts={2895,2983},rays={29,33},hits={31,35},depths={32,36};
  String[] expected={"621662422a1103000029d17612060000621d660da0756320","621662422a1103000029d076120600006221660da0756324"};
  for(int n=0;n<starts.length;n++){
   int start=starts[n],end=start+24;
   if(!Arrays.equals(Arrays.copyOfRange(code,start,end),HexFormat.of().parseHex(expected[n])))throw new IllegalStateException("Camera probe range mismatch");
   // No incoming edge may land in the replaced expression. All original
   // addresses, exception tables, raycasts and subsequent camera rules remain.
   for(AVM2Instruction i:body.getCode().code)if(i.getAddress()<start||i.getAddress()>=end)for(long target:i.getOffsets())if(target>start&&target<end)throw new IllegalStateException("Incoming camera probe edge");
   for(var exception:body.exceptions)if((exception.start>start&&exception.start<end)||(exception.end>start&&exception.end<end)||(exception.target>start&&exception.target<end))throw new IllegalStateException("Camera probe exception edge");
   ByteArrayOutputStream call=new ByteArrayOutputStream();
   for(AVM2Instruction i:new AVM2Instruction[]{ins(0x60,abc.constants.getPublicQnameId("BlitzDisplay",true)),ins(0x62,22),ins(0x62,rays[n]),ins(0x66,13),ins(0xa0),ins(0x62,hits[n]),ins(0x62,20),ins(0x46,abc.constants.getPublicQnameId("CameraFloor",true),3),ins(0x75),ins(0x63,depths[n])})call.write(i.getBytes());
   if(call.size()>24)throw new IllegalStateException("Camera probe exceeds reviewed range");
   Arrays.fill(code,start,end,(byte)2);System.arraycopy(call.toByteArray(),0,code,start,call.size());
  }
  body.setCodeBytes(code);body.getCode().checkValidOffsets(body);body.setCodeBytes(code);return body;
 }
 static MethodBody correctMapWidth(ABC abc,String name,int start,String expectedHash)throws Exception {
  MethodBody body=abc.findBodyByClassAndName("class_119",name);
  if(body==null||!HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(body.getCodeBytes())).equals(expectedHash))throw new IllegalStateException("Unreviewed map coordinates: "+name);
  byte[] code=body.getCodeBytes().clone();int end=start+6;
  if(!Arrays.equals(Arrays.copyOfRange(code,start,end),HexFormat.of().parseHex("60c70166fa01")))throw new IllegalStateException("Map width range mismatch");
  for(AVM2Instruction i:body.getCode().code)if(i.getAddress()<start||i.getAddress()>=end)for(long target:i.getOffsets())if(target>start&&target<end)throw new IllegalStateException("Incoming map width edge");
  for(var exception:body.exceptions)if((exception.start>start&&exception.start<end)||(exception.end>start&&exception.end<end)||(exception.target>start&&exception.target<end))throw new IllegalStateException("Map width exception edge");
  // GlobalMap artwork, cutout masks and interactive boxes are authored at
  // 1152 logical pixels. Camera width describes the world, not this panel.
  // Keep the original map raster/zoom scale; all handlers stay untouched.
  byte[] replacement=ins(0x25,1152).getBytes();Arrays.fill(code,start,end,(byte)2);System.arraycopy(replacement,0,code,start,replacement.length);
  body.setCodeBytes(code);body.getCode().checkValidOffsets(body);body.setCodeBytes(code);return body;
 }
 static MethodBody prepareCanvas(ABC abc)throws Exception {
  MethodBody body=abc.findBodyByClassAndName("Game","method_1946");
  if(body==null||!HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(body.getCodeBytes())).equals("b4b11cb421ae24a79159618ae97677525949be0d0ac8da653ed2b0349f1946c9"))throw new IllegalStateException("Unreviewed final-canvas draw method");
  byte[] code=body.getCodeBytes().clone();
  if(!Arrays.equals(Arrays.copyOfRange(code,4,21),HexFormat.of().parseHex("100b00009207d20805c20c6310920f6312")))throw new IllegalStateException("Canvas entry guard mismatch");
  // The original entry pushes false/true, stores true in local 17, jumps
  // across dead obfuscator instructions and stores false in local 18. Keep
  // both locals and every later address; add only a presentation callback.
  ByteArrayOutputStream call=new ByteArrayOutputStream();
  for(AVM2Instruction i:new AVM2Instruction[]{ins(0x63,18),ins(0x60,abc.constants.getPublicQnameId("BlitzDisplay",true)),ins(0xd0),ins(0x4f,abc.constants.getPublicQnameId("PrepareFrame",true),1)})call.write(i.getBytes());
  if(call.size()>17)throw new IllegalStateException("Canvas entry call exceeds reviewed range");
  Arrays.fill(code,4,21,(byte)2);System.arraycopy(call.toByteArray(),0,code,4,call.size());
  body.setCodeBytes(code);body.getCode().checkValidOffsets(body);body.setCodeBytes(code);return body;
 }
 public static void main(String[] args)throws Exception {
  SWF swf=new SWF(new FileInputStream(args[0]),false);int changed=0;String correctedCacheHash=null,correctedReuseHash=null,correctedCropHash=null,canvasHash=null,cameraHash=null,mapCreateHash=null,mapRefreshHash=null;
  for(ABCContainerTag tag:swf.getAbcList()){
   ABC abc=tag.getABC();MethodBody layout=abc.findBodyByClassAndName("Main","method_561");if(layout==null)continue;
   reviewInput(abc);
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
   boolean transition=restoreTransition(abc);MethodBody allocation=abc.findBodyByClassAndName("Game","method_1947");
   MethodBody cache=correctCacheCheck(abc);
   MethodBody canvas=prepareCanvas(abc);canvasHash=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(canvas.getCodeBytes()));
   MethodBody crop=correctCrop(abc);correctedCropHash=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(crop.getCodeBytes()));
   MethodBody reuse=correctTileReuse(abc);correctedReuseHash=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(reuse.getCodeBytes()));
   correctedCacheHash=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(cache.getCodeBytes()));
   MethodBody camera=correctCameraFloor(abc);cameraHash=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(camera.getCodeBytes()));
   MethodBody mapCreate=correctMapWidth(abc,"OnCreateScreen",1149,"c8305d08052dc01e8f0a12f30c924a86ab94ca6cab930742597eb39f649a7cba");mapCreateHash=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(mapCreate.getCodeBytes()));
   MethodBody mapRefresh=correctMapWidth(abc,"OnRefreshScreen",788,"b2fba29d71796f332e090e20f9b58d48ca8d482050ab9e459a9d176575517793");mapRefreshHash=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(mapRefresh.getCodeBytes()));
   for(MethodBody b:abc.bodies)if(b!=layout&&b!=cache&&b!=reuse&&b!=crop&&b!=canvas&&b!=camera&&b!=mapCreate&&b!=mapRefresh&&(!transition||b!=allocation)&&!Arrays.equals(original.get(b.method_info),b.getCodeBytes()))throw new IllegalStateException("Non-display method changed: "+b.method_info);
   ((com.jpexs.decompiler.flash.tags.Tag)tag).setModified(true);changed++;
   System.out.println("Verified native raster layout, cache, crop transform, map coordinates, camera floor probes, canvas preparation and transition allocation; untouched method bodies: "+(abc.bodies.size()-(transition?9:8)));
  }
  if(changed!=1)throw new IllegalStateException("Expected exactly one reviewed layout method");
  try(OutputStream out=new FileOutputStream(args[1])){swf.saveTo(out);}
  SWF saved=new SWF(new FileInputStream(args[1]),false);int verified=0;
  for(ABCContainerTag tag:saved.getAbcList()){
   MethodBody allocation=tag.getABC().findBodyByClassAndName("Game","method_1947");if(allocation==null)continue;
   String hash=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(allocation.getCodeBytes()));
   if(!hash.equals("472c1b22356dac968d260da0a48687c247da761be2e779f1d1a6bf624132b768")&&!hash.equals("87bef2738ee6a0d598ea359f8877e38ce742ec1cb80a1ddf97d34ecb84149afc"))throw new IllegalStateException("Serialized transition body changed");verified++;
   MethodBody cache=tag.getABC().findBodyByClassAndName("class_23","method_1753");
   if(cache==null||!HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(cache.getCodeBytes())).equals(correctedCacheHash))throw new IllegalStateException("Serialized terrain cache check changed");
   MethodBody reuse=tag.getABC().findBodyByClassAndName("class_23","method_1389");
   if(reuse==null||!HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(reuse.getCodeBytes())).equals(correctedReuseHash))throw new IllegalStateException("Serialized terrain protection changed");
   MethodBody crop=tag.getABC().findBodyByClassAndName("SuperAnimData","method_200");
   if(crop==null||!HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(crop.getCodeBytes())).equals(correctedCropHash))throw new IllegalStateException("Serialized crop transform changed");
   MethodBody canvas=tag.getABC().findBodyByClassAndName("Game","method_1946");
   if(canvas==null||!HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(canvas.getCodeBytes())).equals(canvasHash))throw new IllegalStateException("Serialized final-canvas entry changed");
   MethodBody camera=tag.getABC().findBodyByClassAndName("Camera","method_1073");
   if(camera==null||!HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(camera.getCodeBytes())).equals(cameraHash))throw new IllegalStateException("Serialized camera probes changed");
   for(String[] item:new String[][]{{"OnCreateScreen",mapCreateHash},{"OnRefreshScreen",mapRefreshHash}}){MethodBody map=tag.getABC().findBodyByClassAndName("class_119",item[0]);if(map==null||!HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(map.getCodeBytes())).equals(item[1]))throw new IllegalStateException("Serialized map width changed");}
  }
  if(verified!=1)throw new IllegalStateException("Serialized allocator missing");
 }
}
