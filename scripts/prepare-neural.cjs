'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const pin='906031bb00c15dd6a6bbbaa21c0eb0b724ca8437';
// The original author supplies the model as an independently replaceable GPL
// shader. Keep its source, notice and license; never download model code at run time.
async function prepare(){
 const dir=path.join(root,'src/neural');fs.mkdirSync(dir,{recursive:true});
 const url=`https://raw.githubusercontent.com/funnyplanter/CuNNy/${pin}/magpie/normal/CuNNy-veryfast-NVL.hlsl`;
 const file=path.join(dir,'CuNNy-veryfast-NVL.hlsl');
 if(!fs.existsSync(file)){const r=await fetch(url);if(!r.ok)throw Error('Neural model download failed');fs.writeFileSync(file,await r.text());}
 const original=fs.readFileSync(file,'utf8');
 if(crypto.createHash('sha256').update(original).digest('hex')!=='18cbe307f256b9ad63864133002a4bacb9c9404cc31e596e6b17a180b8c7db29')throw Error('Neural model checksum mismatch');
 const parts=original.split(/\/\/!PASS \d+\r?\n/).slice(1);
 if(parts.length!==4)throw Error('Unexpected neural model layout');
 const common=`cbuffer Sizes : register(b0) { uint2 inputSize; uint2 outputSize; };\nuint2 GetInputSize(){return inputSize;}\nuint2 GetOutputSize(){return outputSize;}\nfloat2 GetInputPt(){return 1.0/float2(inputSize);}\nfloat2 GetOutputPt(){return 1.0/float2(outputSize);}\nuint2 Rmp8x8(uint i){return uint2(i%8,i/8);}\nSamplerState SP:register(s0);\nSamplerState SL:register(s1);\n#define O(t,x,y) t.SampleLevel(SP,pos+float2(x,y)*pt,0)\n#define V4 min16float4\n#define M4 min16float4x4\n`;
 const passes=parts.map((part,index)=>{
  const inputs=part.match(/\/\/!IN ([^\r\n]+)/)[1].split(/, */),outputs=part.match(/\/\/!OUT ([^\r\n]+)/)[1].split(/, */);
  const block=Number(part.match(/\/\/!BLOCK_SIZE (\d+)/)[1]);
  const declarations=inputs.map((n,i)=>`Texture2D<float4> ${n}:register(t${i});`).concat(outputs.map((n,i)=>`RWTexture2D<float4> ${n}:register(u${i});`)).join('\n');
  const body=part.replace(/^\/\/!.*$/gm,'');
  return {inputs,outputs,block,source:common+declarations+'\n'+body+`\n[numthreads(64,1,1)] void CS(uint3 group:SV_GroupID,uint3 tid:SV_GroupThreadID){Pass${index+1}(group.xy*${block},tid);}\n`};
 });
 const resource=path.join(root,'runtime/game/resources/neural');fs.mkdirSync(resource,{recursive:true});
 fs.writeFileSync(path.join(resource,'passes.json'),JSON.stringify(passes));
 fs.copyFileSync(file,path.join(resource,path.basename(file)));
 for(const name of ['NOTICE.txt','COPYING.GPL3','COPYING.LESSER'])fs.copyFileSync(path.join(dir,name),path.join(resource,name));
 console.log('Prepared four-pass CuNNy neural model:',crypto.createHash('sha256').update(original).digest('hex'));
}
module.exports=prepare;if(require.main===module)prepare().catch(e=>{console.error(e);process.exitCode=1;});
