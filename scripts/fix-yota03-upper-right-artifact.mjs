import fs from 'node:fs';
import assert from 'node:assert/strict';
import sharp from 'sharp';

const source='coloring/yota-03/outline.png';
const backup='artifacts/yota-03-top-cross/outline-original.png';
if(!fs.existsSync(backup))fs.copyFileSync(source,backup);
const [mask,outline]=await Promise.all([
  sharp('coloring/yota-03/regions.png').ensureAlpha().raw().toBuffer({resolveWithObject:true}),
  sharp(backup).ensureAlpha().raw().toBuffer({resolveWithObject:true})
]);
const w=mask.info.width;
let removed=0;
for(let y=755;y<=800;y++)for(let x=690;x<=730;x++){
  const p=(y*w+x)*4;
  const inRegion=mask.data[p]===1&&mask.data[p+1]===0&&mask.data[p+2]===73&&mask.data[p+3]===255;
  const luminance=.2126*outline.data[p]+.7152*outline.data[p+1]+.0722*outline.data[p+2];
  if(inRegion&&outline.data[p+3]&&luminance>120){outline.data[p+3]=0;removed++;}
}
assert.equal(removed,89,'Only the reviewed light overlay pixels may be removed');
await sharp(outline.data,{raw:outline.info}).png().toFile(source);
console.log({region:'region-1',removed,box:{x:690,y:755,width:41,height:46}});
