const crypto=require('node:crypto');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
// Build-time delta: retain original byte ranges and store only inserted/replaced
// bytes. The complete fetched game SWF is never bundled with the launcher.
function makeDelta(before,after){
 const index=new Map(),width=32;
 for(let i=0;i<=before.length-width;i+=4){const key=before.subarray(i,i+width).toString('base64');let list=index.get(key);if(!list)index.set(key,list=[]);if(list.length<8)list.push(i);}
 const operations=[];let position=0,start=0;
 while(position<after.length){let offset=-1,length=0;
  if(position<=after.length-width){const candidates=index.get(after.subarray(position,position+width).toString('base64'))||[];
   for(const candidate of candidates){let count=width;while(candidate+count<before.length&&position+count<after.length&&before[candidate+count]===after[position+count])count++;if(count>length){offset=candidate;length=count;}}
  }
  if(length>=width){if(position>start)operations.push({data:after.subarray(start,position).toString('base64')});operations.push({copy:[offset,length]});position+=length;start=position;}else position++;
 }
 if(position>start)operations.push({data:after.subarray(start,position).toString('base64')});
 return {format:1,inputHash:digest(before),outputHash:digest(after),outputLength:after.length,operations};
}
module.exports={makeDelta};
