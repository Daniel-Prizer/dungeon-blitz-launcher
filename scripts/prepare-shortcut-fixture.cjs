const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.test-tools/input-shortcuts');fs.mkdirSync(dir,{recursive:true});
execFileSync('java',['-Djava.awt.headless=true','-jar',path.join(root,'.test-tools/focus/ffdec/ffdec.jar'),'-importScript',path.join(root,'.test-tools/audio-latest/audio.swf'),path.join(dir,'fixture.swf'),path.join(root,'test/shortcut-fixture')],{windowsHide:true,stdio:'inherit'});
