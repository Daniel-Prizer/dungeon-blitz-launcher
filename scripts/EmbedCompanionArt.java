import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.Base64;
import java.util.zip.DeflaterOutputStream;
import javax.imageio.ImageIO;

// Build-time PNG decoding only. Flash receives a fixed, bounded ARGB surface,
// never an image URL, a Loader or executable image/SWF bytes from the network.
public class EmbedCompanionArt {
 public static void main(String[] args) throws Exception {
  BufferedImage original=ImageIO.read(new File(args[0]));
  if(original==null||original.getWidth()>2048||original.getHeight()>2048)throw new IOException("Invalid companion artwork");
  int width=576,height=384;
  BufferedImage image=new BufferedImage(width,height,BufferedImage.TYPE_INT_ARGB);
  Graphics2D graphics=image.createGraphics();
  graphics.setComposite(AlphaComposite.Src);
  graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION,RenderingHints.VALUE_INTERPOLATION_BICUBIC);
  graphics.drawImage(original,0,0,width,height,null);graphics.dispose();
  ByteArrayOutputStream compressed=new ByteArrayOutputStream();
  try(DataOutputStream bytes=new DataOutputStream(new DeflaterOutputStream(compressed))){
   for(int y=0;y<height;y++)for(int x=0;x<width;x++)bytes.writeInt(image.getRGB(x,y));
  }
  String pixels=Base64.getEncoder().encodeToString(compressed.toByteArray());
  if(pixels.length()>800000)throw new IOException("Companion artwork exceeds build budget");
  String source=Files.readString(Path.of(args[1]),StandardCharsets.UTF_8);
  if(!source.contains("__COMPANION_PIXELS__"))throw new IOException("Missing artwork placeholder");
  Files.writeString(Path.of(args[2]),source.replace("__COMPANION_PIXELS__",pixels),StandardCharsets.UTF_8);
 }
}
