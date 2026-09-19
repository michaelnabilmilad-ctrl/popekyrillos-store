import fs from 'node:fs';
import assert from 'node:assert/strict';
import sharp from 'sharp';

const source='coloring/yota-03/regions.png';
const backup='artifacts/yota-03-top-cross/regions-before-shoulders.png';
if(!fs.existsSync(backup))fs.copyFileSync(source,backup);
const mask=await sharp(backup).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const w=mask.info.width;
let added=[];
for(let y=750;y<=767;y++)for(let x=654;x<=714;x++){
  const p=(y*w+x)*4;
  if(mask.data[p+3])continue;
  mask.data.set([1,0,73,255],p);
  added.push({x,y});
}
assert.equal(added.length,312,'Only the two reviewed shoulder gaps may be added');
assert.equal(added.filter(p=>p.x<684).length,added.filter(p=>p.x>684).length,'Shoulder repair must be symmetric');
await sharp(mask.data,{raw:mask.info}).png().toFile(source);
console.log({region:'region-1',added:added.length});
