import java.io.*;import java.util.*;import java.security.*;import com.jpexs.decompiler.flash.SWF;import com.jpexs.decompiler.flash.tags.ABCContainerTag;
// Unshipped fixture only: typed facing holder, no player/account initialization.
// All original key-manager methods and launcher input helper remain intact.
public class ShortcutFixtureBuilder{public static void main(String[]args)throws Exception{
 SWF swf=new SWF(new FileInputStream(args[0]),false);int changed=0;
 for(ABCContainerTag tag:swf.getAbcList()){var abc=tag.getABC();int index=abc.findClassByName("Entity");if(index<0)continue;var body=abc.findBody(abc.instance_info.get(index).iinit_index);
 if(!HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(body.getCodeBytes())).equals("3c1199cad9629ab3a478bf80cdebf36217e38f3cea70b75a66c371b74c7ed6ab"))throw new Exception("Unreviewed fixture Entity constructor");
 body.setCodeBytes(HexFormat.of().parseHex("d030d0490047"));body.getCode();body.exceptions=new com.jpexs.decompiler.flash.abc.types.ABCException[0];body.max_stack=1;body.setModified();((com.jpexs.decompiler.flash.tags.Tag)tag).setModified(true);changed++;}
 if(changed!=1)throw new Exception("Missing unique fixture Entity");swf.saveTo(new FileOutputStream(args[1]));
}}
