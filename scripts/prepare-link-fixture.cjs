const path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.test-tools/focus');
execFileSync(process.execPath,[path.join(__dirname,'prepare-margin-fixture.cjs')],{windowsHide:true,stdio:'inherit'});
execFileSync('java',['-Djava.awt.headless=true','-jar',path.join(dir,'ffdec/ffdec.jar'),'-importScript',path.join(dir,'live.swf'),path.join(dir,'link-probe.swf'),path.join(root,'test/link-fixture')],{windowsHide:true,stdio:'inherit'});
