import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import sharp from 'sharp';
import { normalizePaintColor } from '../coloring-game.js';

const root=new URL('../',import.meta.url),dir=new URL('coloring/yota-03/',root);
const [mask,outline,before]=await Promise.all([
  sharp(fs.readFileSync(new URL('regions.png',dir))).ensureAlpha().raw().toBuffer({resolveWithObject:true}),
  sharp(fs.readFileSync(new URL('outline.png',dir))).ensureAlpha().raw().toBuffer({resolveWithObject:true}),
  sharp(fs.readFileSync(new URL('artifacts/yota-03-top-cross/outline-original.png',root))).ensureAlpha().raw().toBuffer({resolveWithObject:true})
]);
const doc=JSON.parse(fs.readFileSync(new URL('regions.json',dir))),r=doc.regions.find(x=>x.id==='region-1'),w=mask.info.width;
const isRegion=p=>mask.data[p*4]===1&&mask.data[p*4+1]===0&&mask.data[p*4+2]===73&&mask.data[p*4+3]===255;

test('only the light overlay contamination at region-1 upper-right was removed',()=>{
 let changed=[];
 for(let p=0;p<w*mask.info.height;p++)for(let c=0;c<4;c++)if(outline.data[p*4+c]!==before.data[p*4+c])changed.push({p,c});
 assert.equal(changed.length,89);
 for(const {p,c} of changed){const x=p%w,y=Math.floor(p/w);assert.equal(c,3);assert.ok(x>=690&&x<=730&&y>=755&&y<=800);assert.ok(isRegion(p));assert.ok(before.data[p*4+3]>0);assert.equal(outline.data[p*4+3],0);}
});

test('region-1 remains connected and preserves exactly four intended square holes',()=>{
 const {x,y,width,height}=r.bounds,bw=width+2,bh=height+2,solid=new Uint8Array(bw*bh),seen=new Uint8Array(bw*bh);let count=0;
 for(let yy=0;yy<bh;yy++)for(let xx=0;xx<bw;xx++){const p=(y+yy-1)*w+x+xx-1,o=p*4;solid[yy*bw+xx]=(isRegion(p)||outline.data[o+3])?1:0;if(isRegion(p))count++;}
 assert.equal(count,r.pixelCount);
 let holes=0;for(let p=0;p<solid.length;p++){if(seen[p]||solid[p])continue;let q=[p],edge=false;seen[p]=1;for(let i=0;i<q.length;i++){let v=q[i],xx=v%bw,yy=Math.floor(v/bw);if(!xx||!yy||xx===bw-1||yy===bh-1)edge=true;for(const [nx,ny] of [[xx-1,yy],[xx+1,yy],[xx,yy-1],[xx,yy+1]]){let n=ny*bw+nx;if(nx>=0&&ny>=0&&nx<bw&&ny<bh&&!seen[n]&&!solid[n]){seen[n]=1;q.push(n);}}}if(!edge)holes++;}
 assert.equal(holes,4);
});

for(const color of ['#ff0000','#008000','#0000ff','#ffffff'])test(`region-1 upper-right renders cleanly with ${color}`,()=>{
 assert.equal(normalizePaintColor(color),color);
 for(let y=755;y<=800;y++)for(let x=690;x<=730;x++){const p=y*w+x;if(!isRegion(p))continue;const o=p*4,l=.2126*outline.data[o]+.7152*outline.data[o+1]+.0722*outline.data[o+2];assert.ok(!(outline.data[o+3]&&l>120),'no light overlay may cover painted pixels');}
});
