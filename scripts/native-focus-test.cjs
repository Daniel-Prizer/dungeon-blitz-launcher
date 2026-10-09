const {_electron:electron}=require('playwright');
const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'docs/private-native');
fs.mkdirSync(out,{recursive:true});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
  execFileSync(path.join(root,'.test-tools/PrivateDesktop.exe'),['--check'],{windowsHide:true});
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const app=await electron.launch({args:[root,'--smoke-test','--private-desktop'],env});
  try{
    const page=await app.firstWindow();await page.waitForFunction(()=>window.blitz);
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].showInactive());
    const call=(n,v)=>page.evaluate(([n,v])=>window.blitz.action(n,v),[n,v]);
    await call('save-settings',{gameURL:'https://dungeonblitzr.theminesa.studio/',volume:100,cursorLock:false,gameZoom:1});await call('restart-game');await wait(15000);
    const game={id:1};assert.equal((await call('state')).error,'');
    const measure=async name=>{
      const file=path.join(out,name);if(fs.existsSync(file+'.json'))fs.unlinkSync(file+'.json');
      await app.evaluate(({},v)=>global.__blitzTest.nativeCommand(v.id,{type:'test-geometry',path:v.file}),{id:game.id,file});
      for(let i=0;i<100&&!fs.existsSync(file+'.json');i++)await wait(100);
      return JSON.parse(fs.readFileSync(file+'.json','utf8'));
    };
    await app.evaluate(()=>global.__blitzTest.runtime().focus());await wait(500);
    const selected=await measure('focus-selected');console.log('Selected game focus',JSON.stringify(selected));
    await call('settings');await wait(200);
    assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFocused()),true,'Settings must return activation to the launcher window');
    await call('dismiss');await wait(500);
    const dismissed=await measure('focus-dismissed');console.log('Return from settings focus',JSON.stringify(dismissed));
    assert(selected.focused&&selected.contentFocused&&selected.geometry.focused,'Selecting game must focus its native window and renderer');
    assert(dismissed.focused&&dismissed.contentFocused&&dismissed.geometry.focused,'Returning from settings must restore native window and renderer focus');
    const command=cmd=>app.evaluate(({},v)=>global.__blitzTest.nativeCommand(v.id,v.cmd),{id:game.id,cmd});
    const input=data=>command({type:'test-input',input:data});
    const click=async(x,y)=>{x=Math.round(x);y=Math.round(y);await input({type:'mouseMove',x,y});await wait(100);await input({type:'mouseDown',button:'left',x,y,clickCount:1});await input({type:'mouseUp',button:'left',x,y,clickCount:1});await wait(250)};
    const key=async(keyCode,modifiers=[])=>{await input({type:'keyDown',keyCode,modifiers});await input({type:'keyUp',keyCode,modifiers});await wait(100)};
    const type=async text=>{for(const c of text){await input({type:'keyDown',keyCode:c});await input({type:'char',keyCode:c});await input({type:'keyUp',keyCode:c})}};
    const capture=async name=>{
      const file=path.join(out,name);if(fs.existsSync(file))fs.unlinkSync(file);
      await command({type:'capture',path:file});for(let i=0;i<50&&!fs.existsSync(file);i++)await wait(100);
      for(let repeat=0;repeat<3;repeat++){await wait(400);await command({type:'capture',path:file})}await wait(400);
      assert(fs.existsSync(file)&&fs.statSync(file).size>100000,'Native Flash must produce a detailed frame');
      console.log('Capture',name,fs.statSync(file).size);
      return file;
    };
    const compareField=async(actual,expected,rect,matching=true)=>{
      const difference=await app.evaluate(({nativeImage},v)=>{
        const a=nativeImage.createFromPath(v.actual).crop(v.rect).toBitmap(),b=nativeImage.createFromPath(v.expected).crop(v.rect).toBitmap();let changed=0;
        for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>25)changed++;
        return changed/(a.length/4);
      },{actual,expected,rect});
      if(matching){assert(difference<.01,`Pasted field must visually match typed reference (${difference})`);console.log('PASS Pasted field matches typed reference pixels',difference);}
      else {assert(difference>.001,`Input must visibly change the empty field (${difference})`);console.log('PASS Field contains visible dummy input',difference);}
    };
    const width=selected.size[0],height=selected.size[1];
    const scale=selected.scale*(selected.renderProbe?.nativeScale||1);
    const originY=(height-768*scale)/2,emailY=originY+334*scale,passwordY=originY+403*scale;
    await command({type:'test-paste-source',text:'-pasted'});await wait(200);
    await click((width-1152*scale)/2+120*scale,originY+735*scale);
    const emptyLogin=await capture('native-login-empty.png');
    await click(width/2,emailY);
    await type('typed-test');
    await key('V',['control']);await key('Insert',['shift']);
    await capture('native-login-input.png');
    await click(width/2,passwordY);
    const pastedEmail=await capture('native-email-paste.png');
    await compareField(pastedEmail,emptyLogin,{x:Math.round(width/2-160*scale),y:Math.round(originY+321*scale),width:Math.round(320*scale),height:Math.round(28*scale)},false);
    await click(width/2,emailY);await key('A',['control']);await type('typed-test-pasted-pasted');await click(width/2,passwordY);
    const typedEmail=await capture('native-email-reference.png');
    await compareField(pastedEmail,typedEmail,{x:Math.round(width/2-160*scale),y:Math.round(originY+321*scale),width:Math.round(320*scale),height:Math.round(28*scale)});
    await type('dummy-only');
    await capture('native-password-input.png');
    await key('A',['control']);await command({type:'test-paste-source',text:'dummy-paste-only'});await key('V',['control']);
    await capture('native-password-paste.png');
    await click(width/2,emailY);const pastedPassword=await capture('native-password-paste-unfocused.png');
    await click(width/2,passwordY);await key('A',['control']);await type('dummy-paste-only');await click(width/2,emailY);
    const typedPassword=await capture('native-password-reference.png');
    await compareField(pastedPassword,emptyLogin,{x:Math.round(width/2-160*scale),y:Math.round(originY+387*scale),width:Math.round(320*scale),height:Math.round(28*scale)},false);
    await compareField(pastedPassword,typedPassword,{x:Math.round(width/2-160*scale),y:Math.round(originY+387*scale),width:Math.round(320*scale),height:Math.round(28*scale)});
    await key('A',['control']);await type('retyped-check');
    await capture('native-replaced-input.png');
    const inputState=await measure('focus-input');assert.deepEqual(inputState.testEdits,['paste','paste','paste'],'Both paste shortcuts must use the real Flash insertion handler');
    await call('fullscreen');await wait(400);assert.equal((await measure('focus-fullscreen')).focused,true);
    await call('exit-fullscreen');await wait(400);assert.equal((await measure('focus-fullscreen-restored')).focused,true);
    console.log('PASS Native window and renderer focus; real paste insertion with a dummy clipboard source');
    fs.writeFileSync(path.join(out,'native-focus-results.json'),JSON.stringify({time:new Date().toISOString(),version:(await call('state')).version,selected,dismissed,inputState,passed:['Native and renderer focus on game launch','Focus transfers to settings and restores to game','Focus preserved through fullscreen and exit','Ctrl+V and Shift+Insert execute real Flash insertion with a dummy text source','Email and masked password paste match typed reference pixels','Native renderer captures selection replacement for visual inspection'],limitation:'Only the clipboard source is replaced with dummy text; the real insertion handler runs. System clipboard is untouched. No login submitted; test input uses renderer events, not physical OS input.'},null,2));
  }finally{await app.evaluate(()=>global.__blitzTest.shutdown()).catch(()=>{});await app.close().catch(()=>{})}
})().catch(e=>{console.error(e);process.exitCode=1});
