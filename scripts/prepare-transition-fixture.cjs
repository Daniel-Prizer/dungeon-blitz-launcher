const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const singleplayer=process.argv.includes('--singleplayer'),root=path.resolve(__dirname,'..'),dir=path.join(root,'.test-tools/transition'+(singleplayer?'-singleplayer':'')),lib=path.join(root,'.test-tools/focus/ffdec/lib/*'),jar=path.join(root,'.test-tools/focus/ffdec/ffdec.jar');
fs.mkdirSync(dir,{recursive:true});
execFileSync('javac',['-cp',lib,'-d',dir,path.join(__dirname,'TransitionFixtureBuilder.java')],{stdio:'inherit',windowsHide:true});
for(const mode of (process.argv.includes('--camera')||singleplayer?['fixed','camera-baseline']:['fixed','baseline','cache-baseline','reuse-baseline','camera-baseline'])){
 execFileSync('java',['-Djava.awt.headless=true','-cp',dir+path.delimiter+lib,'TransitionFixtureBuilder',path.join(root,'.test-tools/audio'+(singleplayer?'-singleplayer':'-adaptive')+'/audio.swf'),path.join(dir,mode+'-stub.swf'),mode,path.join(root,'.test-tools/focus/'+(singleplayer?'singleplayer.swf':'deployed.swf')),path.join(root,'.test-tools/focus/latest.swf'),...(singleplayer?['--singleplayer']:[])],{stdio:'inherit',windowsHide:true});
 execFileSync('java',['-Djava.awt.headless=true','-jar',jar,'-importScript',path.join(dir,mode+'-stub.swf'),path.join(dir,mode+'.swf'),path.join(root,'test/transition-fixture')],{stdio:'inherit',windowsHide:true});
}
