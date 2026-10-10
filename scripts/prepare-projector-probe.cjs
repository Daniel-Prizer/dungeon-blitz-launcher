'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.test-tools/projector-probe');fs.mkdirSync(dir,{recursive:true});
const u=value=>{const out=[];do{const b=value&127;value>>>=7;out.push(b|(value?128:0));}while(value);return Buffer.from(out);};
const b=(...parts)=>Buffer.concat(parts.map(p=>Buffer.isBuffer(p)?p:Buffer.from(p))),str=s=>b(u(Buffer.byteLength(s)),Buffer.from(s));
function swf(name,network){
 const pool=b([1,1,1,4],str(name),str('Sprite'),str('flash.display'),[3,0x16,0,0x16,3,1,3,7,1,1,7,2,2]);
 const methods=b([3,0,0,0,0,0,0,0,0,0,0,0,0]),types=b([0,1,1,2,0,0,0,0,1,0,1,2,1,1,4,1,0]);
 const body=(index,stack,scope,code)=>b([index,stack,1,scope,scope+1],u(code.length),code,[0,0]);
 const abc=b([16,0,46,0],pool,methods,types,[3],body(0,1,1,[0xd0,0x30,0xd0,0x49,0,0x47]),body(1,1,1,[0xd0,0x30,0x47]),body(2,2,0,[0xd0,0x30,0x65,0,0x60,2,0x30,0x60,2,0x58,0,0x1d,0x68,1,0x47]));
 const tag=(type,data)=>{const header=Buffer.alloc(6);header.writeUInt16LE((type<<6)|63);header.writeUInt32LE(data.length,2);return b(header,data);};
 // RECT: 0..23040 and 0..15360 twips, then fixed 30fps/one frame.
 const bits='10001'+[0,23040,0,15360].map(x=>x.toString(2).padStart(17,'0')).join('');const rect=Buffer.alloc(Math.ceil(bits.length/8));for(let i=0;i<bits.length;i++)if(bits[i]==='1')rect[i>>3]|=1<<(7-(i&7));
 const content=b(rect,[0,30,1,0],tag(69,[8|(network?1:0),0,0,0]),tag(82,b([0,0,0,0],Buffer.from(name+'\0'),abc)),tag(76,b([1,0,0,0],Buffer.from(name+'\0'))),[0x40,0,0,0]);
 const header=Buffer.alloc(8);header.write('FWS');header[3]=32;header.writeUInt32LE(content.length+8,4);return b(header,content);
}
const jar=path.join(root,'.test-tools/focus/ffdec/ffdec.jar');
for(const [name,network,source,out] of [['BlitzWrapper',true,'projector-wrapper','wrapper.swf'],['BlitzGameProbe',true,'projector-game','game.swf'],['BlitzSettings',true,'projector-wrapper','settings.swf']]){
 const generated=path.join(dir,name);fs.mkdirSync(generated,{recursive:true});const script=path.join(generated,name+'.as');let text=fs.readFileSync(path.join(root,'test',source,name+'.as'),'utf8');if(name==='BlitzSettings')text=text.replace('BLITZ_SETTINGS_PLACEHOLDER',JSON.stringify({schema:1,nonce:'probe-specific-channel',origin:'https://dungeonblitzr.theminesa.studio',zoom:1.5,player:100,music:37,environment:100,creatures:100,showFPS:true,storage:process.argv.includes('--storage')}));fs.writeFileSync(script,text);
 const template=path.join(generated,'stub.swf');fs.writeFileSync(template,swf(name,network));
 const output=path.join(dir,out);execFileSync('java',['-Djava.awt.headless=true','-jar',jar,'-replace',template,output,name,script],{windowsHide:true,stdio:'inherit'});
 const original=fs.readFileSync(output),body=original.subarray(0,3).toString()==='CWS'?zlib.inflateSync(original.subarray(8)):original.subarray(8);let offset=Math.ceil((5+4*(body[0]>>3))/8)+4;
 while(offset<body.length){const header=body.readUInt16LE(offset),size=(header&63)===63?body.readUInt32LE(offset+2):header&63,prefix=(header&63)===63?6:2;if(header>>6===69){body[offset+prefix]=(body[offset+prefix]&~1)|(network?1:0);break;}offset+=prefix+size;}
 const head=Buffer.from(original.subarray(0,8));head.write('FWS');fs.writeFileSync(output,b(head,body));
 if(name==='BlitzSettings'){
  fs.writeFileSync(script,text.replace('"zoom":1.5','"zoom":2').replace('"music":37','"music":62').replace('"showFPS":true','"showFPS":false'));
  execFileSync('java',['-Djava.awt.headless=true','-jar',jar,'-replace',template,path.join(dir,'settings-next.swf'),name,script],{windowsHide:true,stdio:'inherit'});
 }
}
