import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import sharp from 'sharp';
import { applyRegionPaint } from '../coloring-game.js';

const root=new URL('../',import.meta.url),dir=new URL('coloring/yota-03/',root);
const [mask,before,outline]=await Promise.all([
  sharp(fs.readFileSync(new URL('regions.png',dir))).ensureAlpha().raw().toBuffer({resolveWithObject:true}),
  sharp(fs.readFileSync(new URL('artifacts/yota-03-top-cross/regions-before-shoulders.png',root))).ensureAlpha().raw().toBuffer({resolveWithObject:true}),
  sharp(fs.readFileSync(new URL('outline.png',dir))).ensureAlpha().raw().toBuffer({resolveWithObject:true})
]);
const doc=JSON.parse(fs.readFileSync(new URL('regions.json',dir))),r=doc.regions.find(x=>x.id==='region-1'),w=mask.info.width;
const target=p=>mask.data[p*4]===1&&mask.data[p*4+1]===0&&mask.data[p*4+2]===73&&mask.data[p*4+3]===255;

test('only the two missing upper shoulder corners were added to region-1',()=>{
 let changed=[];
 for(let p=0;p<w*mask.info.height;p++)for(let c=0;c<4;c++)if(mask.data[p*4+c]!==before.data[p*4+c])changed.push({p,c});
 assert.equal(changed.length,936);
 const pixels=new Set(changed.map(x=>x.p));assert.equal(pixels.size,312);
 for(const p of pixels){const x=p%w,y=Math.floor(p/w);assert.ok(x>=654&&x<=714&&y>=750&&y<=767);assert.ok(target(p));}
 assert.equal([...pixels].filter(p=>p%w<684).length,[...pixels].filter(p=>p%w>684).length);
 assert.equal(r.pixelCount,10413);
});

test('upper stem and both shoulders have zero excluded pixels inside the engraved rectangle',()=>{
 for(let y=750;y<=767;y++)for(let x=654;x<=714;x++){const p=y*w+x;if(!outline.data[p*4+3])assert.ok(target(p),`missing shoulder pixel ${x},${y}`);}
});

test('region-1 still preserves exactly four intentional wooden square holes',()=>{
 const {x,y,width,height}=r.bounds,bw=width+2,bh=height+2,solid=new Uint8Array(bw*bh),seen=new Uint8Array(bw*bh);let count=0;
 for(let yy=0;yy<bh;yy++)for(let xx=0;xx<bw;xx++){const p=(y+yy-1)*w+x+xx-1,o=p*4;solid[yy*bw+xx]=(target(p)||outline.data[o+3])?1:0;if(target(p))count++;}
 assert.equal(count,10413);let holes=0;
 for(let p=0;p<solid.length;p++){if(seen[p]||solid[p])continue;let q=[p],edge=false;seen[p]=1;for(let i=0;i<q.length;i++){let v=q[i],xx=v%bw,yy=Math.floor(v/bw);if(!xx||!yy||xx===bw-1||yy===bh-1)edge=true;for(const [nx,ny] of [[xx-1,yy],[xx+1,yy],[xx,yy-1],[xx,yy+1]]){let n=ny*bw+nx;if(nx>=0&&ny>=0&&nx<bw&&ny<bh&&!seen[n]&&!solid[n]){seen[n]=1;q.push(n)}}}if(!edge)holes++;}
 assert.equal(holes,4);
});

for(const color of ['#800000','#008000','#000080','#ffffff'])test(`both repaired shoulders receive ${color}`,()=>{
 const painted=applyRegionPaint({},['region-1'],color);assert.equal(painted['region-1'],color);
 for(const [x,y] of [[655,750],[660,755],[708,755],[713,750]])assert.ok(target(y*w+x));
});
