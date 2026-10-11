'use strict';
// Bounded structural reader, not a decompiler or an automatic patch compiler.
// Never execute instructions or infer replacements from downloaded game code.
const zlib=require('zlib'),crypto=require('crypto');
const LIMIT=4*1024*1024, COUNT=100000;
function integer(value){const out=[];do{const b=value&127;value>>>=7;out.push(b|(value?128:0));}while(value);return Buffer.from(out);}
const poolKinds=['ints','uints','doubles','strings','namespaces','nsSets','multinames'];
class Reader {
  constructor(bytes,start=0,end=bytes.length){this.bytes=bytes;this.pos=start;this.end=end;}
  take(n){if(!Number.isInteger(n)||n<0||this.pos+n>this.end)throw Error('Truncated SWF/ABC');const start=this.pos;this.pos+=n;return this.bytes.subarray(start,this.pos);}
  byte(){return this.take(1)[0];}
  u32(){let n=0;for(let i=0;i<5;i++){const b=this.byte();if(i===4&&(b&240))throw Error('Invalid variable integer');n+=(b&127)*2**(7*i);if(!(b&128))return n;}throw Error('Invalid variable integer');}
  u30(){const n=this.u32();if(n>0x3fffffff)throw Error('Invalid u30');return n;}
  count(){const n=this.u30();if(n>COUNT)throw Error('Unbounded ABC count');return n;}
}
function readABC(bytes){
  const r=new Reader(bytes);const version=r.take(4);if(version.readUInt16LE(0)!==16||version.readUInt16LE(2)!==46)throw Error('Unsupported ABC version');
  const pools=Object.fromEntries(poolKinds.map(kind=>[kind,[null]]));
  for(let n=r.count();n>1;n--)pools.ints.push(r.u32());
  for(let n=r.count();n>1;n--)pools.uints.push(r.u32());
  for(let n=r.count();n>1;n--)pools.doubles.push(r.take(8).toString('hex'));
  const strings=[''];for(let n=r.count();n>1;n--){const data=r.take(r.u30());pools.strings.push(data.toString('base64'));strings.push(data.toString('utf8'));}
  for(let n=r.count();n>1;n--){const kind=r.byte();if(![5,8,22,23,24,25,26].includes(kind))throw Error('Unknown namespace');pools.namespaces.push([kind,r.u30()]);}
  for(let n=r.count();n>1;n--){const ids=[];for(let p=r.count();p>0;p--)ids.push(r.u30());pools.nsSets.push(ids);}
  const names=[''];for(let n=r.count();n>1;n--){const kind=r.byte();let name='',args=[];
    switch(kind){
      case 7:case 13:args=[r.u30(),r.u30()];name=strings[args[1]];break;
      case 15:case 16:args=[r.u30()];name=strings[args[0]];break;
      case 17:case 18:break;
      case 9:case 14:args=[r.u30(),r.u30()];name=strings[args[0]];break;
      case 27:case 28:args=[r.u30()];break;
      case 29:args=[r.u30()];for(let p=r.count();p>0;p--)args.push(r.u30());break;
      default:throw Error('Unknown multiname');
    }pools.multinames.push([kind,...args]);names.push(name||'');
  }
  const poolEnd=r.pos;
  const refs=new Map();
  const ref=(kind,id,depth=0)=>{if(id===0)return null;if(depth>16||!Number.isInteger(id)||id<0||id>=pools[kind].length)throw Error('Invalid pool reference');const key=kind+':'+id;if(refs.has(key))return refs.get(key);const v=pools[kind][id];let value=v;
    if(kind==='namespaces')value=[v[0],ref('strings',v[1],depth+1),v[0]===5?id:null];
    else if(kind==='nsSets')value=v.map(x=>ref('namespaces',x,depth+1));
    else if(kind==='multinames')switch(v[0]){case 7:case 13:value=[v[0],ref('namespaces',v[1],depth+1),ref('strings',v[2],depth+1)];break;case 15:case 16:value=[v[0],ref('strings',v[1],depth+1)];break;case 9:case 14:value=[v[0],ref('strings',v[1],depth+1),ref('nsSets',v[2],depth+1)];break;case 27:case 28:value=[v[0],ref('nsSets',v[1],depth+1)];break;case 29:value=[v[0],...v.slice(1).map(x=>ref('multinames',x,depth+1))];break;}
    const result=crypto.createHash('sha256').update(JSON.stringify([kind,value])).digest('hex');refs.set(key,result);return result;
  };
  const mn=()=>ref('multinames',r.u30()),str=()=>ref('strings',r.u30());
  const constant=(index,kind)=>{const k={1:'strings',3:'ints',4:'uints',6:'doubles',5:'namespaces',8:'namespaces',22:'namespaces',23:'namespaces',24:'namespaces',25:'namespaces',26:'namespaces'}[kind];if(k)return [kind,ref(k,index)];if(![0,10,11,12].includes(kind))throw Error('Unknown optional constant');return [kind,index];};
  const methodDefs=[],methodCount=r.count();for(let n=methodCount;n>0;n--){const params=r.count(),returns=mn(),types=[];for(let p=params;p>0;p--)types.push(mn());const name=str(),flags=r.byte(),optional=[],paramNames=[];if(flags&8){const options=r.count();if(options>params)throw Error('Invalid options');for(let p=options;p>0;p--){const id=r.u30();optional.push(constant(id,r.byte()));}}if(flags&128)for(let p=params;p>0;p--)paramNames.push(str());methodDefs.push([returns,types,name,flags,optional,paramNames]);}
  const metadata=[];for(let n=r.count();n>0;n--){const name=str(),pairs=r.count(),keys=[],values=[];for(let p=pairs;p>0;p--)keys.push(str());for(let p=pairs;p>0;p--)values.push(str());metadata.push([name,keys,values]);}
  const methodNames=new Map();
  const nameMethod=(id,name)=>{if(id>=methodCount||methodNames.has(id))throw Error('Ambiguous method identity');methodNames.set(id,name);};
  function traits(owner){const result=[];for(let n=r.count();n>0;n--){const nameId=r.u30(),name=names[nameId],attr=r.byte(),entry=[ref('multinames',nameId),attr];switch(attr&15){
    case 0:case 6:entry.push(r.u30(),mn());const value=r.u30();entry.push(value?constant(value,r.byte()):null);break;
    case 1:case 2:case 3:entry.push(r.u30());const id=r.u30();entry.push(id);if(owner)nameMethod(id,owner+'.'+name);break;
    case 4:case 5:entry.push(r.u30(),r.u30());break;
    default:throw Error('Unknown trait');
  }if(attr&64){const ids=[];for(let p=r.count();p>0;p--)ids.push(r.u30());entry.push(ids);}result.push(entry);}return result;}
  const classes=r.count(),classNames=[],instances=[],classDefs=[],scripts=[];
  for(let n=0;n<classes;n++){const id=r.u30(),name=names[id],superName=mn(),flags=r.byte(),protectedName=flags&8?ref('namespaces',r.u30()):null,interfaces=[];classNames.push(name);for(let p=r.count();p>0;p--)interfaces.push(mn());const init=r.u30();nameMethod(init,name+'.iinit');instances.push([ref('multinames',id),superName,flags,protectedName,interfaces,init,traits(name)]);}
  for(let n=0;n<classes;n++){const init=r.u30();nameMethod(init,classNames[n]+'.cinit');classDefs.push([init,traits(classNames[n])]);}
  for(let n=r.count();n>0;n--){scripts.push([r.u30(),traits(null)]);}
  // Hash semantic references rather than compiler-selected duplicate symbols.
  // Existing pool indices/values are checked separately before hook relocation.
  const bodyCount=r.count(),prefix=bytes.subarray(0,r.pos),bodies=[];const ids=new Set();
  const interfaceContract=Buffer.from(JSON.stringify({methodDefs,metadata,instances,classDefs,scripts,bodyCount}));
  for(let n=bodyCount;n>0;n--){const start=r.pos,id=r.u30();if(id>=methodCount||ids.has(id))throw Error('Invalid body identity');ids.add(id);r.u30();r.u30();r.u30();r.u30();const length=r.u30(),codeOffset=r.pos-start,code=r.take(length);
    for(let e=r.count();e>0;e--){const from=r.u30(),to=r.u30(),target=r.u30();if(from>to||to>length||target>=length)throw Error('Invalid exception range');r.u30();r.u30();}traits(null);
    bodies.push({id,name:methodNames.get(id)||'',bytes:bytes.subarray(start,r.pos),code,codeOffset});
  }
  if(r.pos!==r.end)throw Error('Trailing ABC bytes');return {prefix,bodies,pools,poolEnd,interfaceContract,referenceHash:ref};
}
function readSWF(input){
  if(!Buffer.isBuffer(input)||input.length<8||input.length>2*1024*1024||input.toString('ascii',0,3)!=='CWS')throw Error('Unsupported SWF');
  const length=input.readUInt32LE(4);if(length<16||length>LIMIT)throw Error('Unbounded SWF');
  const body=zlib.inflateSync(input.subarray(8),{maxOutputLength:LIMIT});if(length!==body.length+8)throw Error('Invalid SWF length');
  const r=new Reader(body),nbits=body[0]>>3;if(nbits<1||nbits>31)throw Error('Invalid RECT');r.take(Math.ceil((5+4*nbits)/8)+4);const preamble=body.subarray(0,r.pos),tags=[];
  while(r.pos<r.end){if(tags.length>=10000)throw Error('Unbounded SWF tags');const start=r.pos,h=r.take(2).readUInt16LE(0),type=h>>6,length=(h&63)===63?r.take(4).readUInt32LE(0):h&63,data=r.take(length);let abc=null,lead=null;
    if(type===82){let zero=data.indexOf(0,4);if(data.length<9||zero<4||zero>1024)throw Error('Invalid DoABC');lead=data.subarray(0,zero+1);abc=readABC(data.subarray(zero+1));}
    tags.push({type,data,raw:body.subarray(start,r.pos),abc,lead});if(type===0){if(length||r.pos!==r.end)throw Error('Invalid SWF end');break;}
  }
  if(!tags.length||tags[tags.length-1].type!==0)throw Error('Missing SWF end');return {header:input.subarray(0,8),preamble,tags};
}
function encodeTag(type,data){const header=Buffer.alloc(6);header.writeUInt16LE((type<<6)|63);header.writeUInt32LE(data.length,2);return Buffer.concat([header,data]);}
function writeSWF(swf,tags){const body=Buffer.concat([swf.preamble,...tags]);if(body.length+8>LIMIT)throw Error('Unbounded patched SWF');const header=Buffer.from(swf.header);header.writeUInt32LE(body.length+8,4);return Buffer.concat([header,zlib.deflateSync(body)]);}
function encodePools(pools){const chunks=[];for(const kind of poolKinds){const values=pools[kind];chunks.push(integer(values.length));for(const v of values.slice(1)){
  if(kind==='ints'||kind==='uints')chunks.push(integer(v));else if(kind==='doubles')chunks.push(Buffer.from(v,'hex'));else if(kind==='strings'){const bytes=Buffer.from(v,'base64');chunks.push(integer(bytes.length),bytes);}else if(kind==='namespaces')chunks.push(Buffer.from([v[0]]),integer(v[1]));else if(kind==='nsSets')chunks.push(integer(v.length),...v.map(integer));else{chunks.push(Buffer.from([v[0]]));if(v[0]===29)chunks.push(integer(v[1]),integer(v.length-2),...v.slice(2).map(integer));else chunks.push(...v.slice(1).map(integer));}
}}return Buffer.concat(chunks);}
module.exports={readSWF,readABC,encodeTag,writeSWF,encodePools,integer,poolKinds};
