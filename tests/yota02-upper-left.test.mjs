import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import sharp from 'sharp';
import {applyRegionPaint} from '../coloring-game.js';
const dir=new URL('../coloring/yota-02/',import.meta.url);
const mask=await sharp(new URL('regions.png',dir).pathname.replace(/^\/([A-Z]:)/,'$1')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const outline=await sharp(fs.readFileSync(new URL('outline.png',dir))).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const doc=JSON.parse(fs.readFileSync(new URL('regions.json',dir))),r=doc.regions.find(r=>r.id==='region-9'),w=mask.info.width;
const isTarget=p=>mask.data[p*4+3]===255&&r.maskColor.every((v,c)=>mask.data[p*4+c]===v);
test('yota-02 upper-left surround includes the missing upper and right areas, but not the wooden star',()=>{
 for(const [x,y] of [[512,669],[546,704],[496,725]])assert.ok(isTarget(y*w+x));
 assert.equal(isTarget(704*w+514),false);
 const pixels=[];for(let p=0;p<w*mask.info.height;p++)if(isTarget(p)){pixels.push(p);assert.equal(outline.data[p*4+3],0);}
 assert.equal(pixels.length,2882);assert.equal(r.pixelCount,pixels.length);
 const seen=new Set([pixels[0]]),q=[pixels[0]];for(let i=0;i<q.length;i++)for(const n of [q[i]-1,q[i]+1,q[i]-w,q[i]+w])if(!seen.has(n)&&isTarget(n)){seen.add(n);q.push(n);}
 assert.equal(seen.size,pixels.length,'one connected mask, no disconnected fragments');
});
for(const color of ['#ff0000','#0000ff','#008000','#ffffff'])test(`yota-02 region-9 missing tip receives ${color}`,()=>{
 const colors=applyRegionPaint({},['region-9'],color);assert.equal(colors['region-9'],color);
 for(const [x,y] of [[512,669],[546,704]]){assert.ok(isTarget(y*w+x));assert.equal(outline.data[(y*w+x)*4+3],0,'no overlay blocking the new fill');}
});
