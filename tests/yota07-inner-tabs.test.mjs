import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
const root=path.resolve(import.meta.dirname,'..'),dir=path.join(root,'coloring/yota-07'),art=path.join(root,'artifacts/yota-07-inner-tabs');
const read=async p=>sharp(p).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const before={},after={};
for(const f of ['base','outline','regions']){before[f]=await read(path.join(art,`before-${f}.png`));after[f]=await read(path.join(dir,`${f}.png`));}
const W=before.base.info.width;
const scope=JSON.parse(fs.readFileSync(path.join(art,'edit-scope.json'))).edits.map(e=>e.target);
test('Model 7 tab edits are confined to the two marked small rectangles',()=>{
  for(const f of ['base','outline','regions'])for(let i=0;i<before[f].data.length;i+=4){
    if(before[f].data.subarray(i,i+4).equals(after[f].data.subarray(i,i+4)))continue;
    const x=(i/4)%W,y=Math.floor(i/4/W);
    assert.ok(scope.some(r=>x>=r.left&&x<r.left+r.width&&y>=r.top&&y<r.top+r.height),`${f} out-of-scope pixel ${x},${y}`);
  }
});
test('All four red motifs and outer cross pixels remain exactly unchanged on every layer',()=>{
  for(let i=0;i<before.regions.data.length;i+=4){
    if(!before.regions.data[i+3]||![1,2,3,4,5,6,8,9].includes(before.regions.data[i]))continue;
    for(const f of ['base','outline','regions'])assert.deepEqual(after[f].data.subarray(i,i+4),before[f].data.subarray(i,i+4),`${f} changed protected pixel ${i/4}`);
  }
});
test('Four central diamonds are pixel-identical and both rectangular interiors stay noncolorable',()=>{
  for(const[cx,cy]of [[617,829],[579,865],[653,864],[617,901]])for(let y=cy-12;y<=cy+12;y++)for(let x=cx-12;x<=cx+12;x++){
    if(Math.abs(x-cx)+Math.abs(y-cy)>12)continue;
    const i=(y*W+x)*4;
    for(const f of ['base','outline','regions'])assert.deepEqual(after[f].data.subarray(i,i+4),before[f].data.subarray(i,i+4));
  }
  for(const[x,y]of [[586,843],[586,886]])assert.equal(after.regions.data[(y*W+x)*4+3],0);
});
test('Every other model asset is unchanged from the start of this fix',()=>{
  const hashes=JSON.parse(fs.readFileSync(path.join(art,'baseline.json')));
  for(const [p,expected] of Object.entries(hashes)){
    if(p.startsWith('coloring/yota-07/'))continue;
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex'),expected,p);
  }
});
