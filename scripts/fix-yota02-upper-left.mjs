import fs from 'node:fs';
import sharp from 'sharp';
import assert from 'node:assert/strict';
const dir='coloring/yota-02', audit='artifacts/yota-02-top';
const files=['base.png','outline.png','regions.png','regions.json','region-overrides.json'];
for(const f of files){if(!fs.existsSync(`${audit}/original-${f}`))fs.copyFileSync(`${dir}/${f}`,`${audit}/original-${f}`);}
const load=async f=>sharp(`${audit}/original-${f}`).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const [mask,outline,base]=await Promise.all(['regions.png','outline.png','base.png'].map(load));
const w=mask.info.width,h=mask.info.height,old=Buffer.from(mask.data),barrier=new Uint8Array(w*h);
for(let p=0;p<barrier.length;p++)barrier[p]=outline.data[p*4+3]?1:0;
// The existing outline omits this short horizontal engraved termination.
// Use its location in base.png solely as a flood boundary; do not edit the outline.
for(let y=718;y<=722;y++)for(let x=546;x<=565;x++)barrier[y*w+x]=1;
const inside=new Uint8Array(w*h),q=[725*w+496];inside[q[0]]=1;
for(let i=0;i<q.length;i++)for(const n of [q[i]-1,q[i]+1,q[i]-w,q[i]+w])if(n>=0&&n<w*h&&!barrier[n]&&!inside[n]){inside[n]=1;q.push(n);}
assert.equal(q.length,2882,'Engraved enclosure must remain bounded');
let added=[];
for(let p=0;p<w*h;p++){const o=p*4;if(old[o]===9&&old[o+2]===147&&old[o+3])mask.data.fill(0,o,o+4);}
for(const p of q){const o=p*4;mask.data.set([9,0,147,255],o);if(!old[o+3])added.push(p);}
assert.ok(added.length>1500&&added.length<2500);
const doc=JSON.parse(fs.readFileSync(`${dir}/regions.json`)),r=doc.regions.find(r=>r.id==='region-9');
const pixels=[];for(let p=0;p<w*h;p++)if(mask.data[p*4]===9&&mask.data[p*4+2]===147&&mask.data[p*4+3])pixels.push(p);
const xs=pixels.map(p=>p%w),ys=pixels.map(p=>Math.floor(p/w));
r.pixelCount=pixels.length;r.centerX=Math.round(xs.reduce((a,b)=>a+b)/pixels.length);r.centerY=Math.round(ys.reduce((a,b)=>a+b)/pixels.length);
r.bounds={x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs)+1,height:Math.max(...ys)-Math.min(...ys)+1};
await sharp(mask.data,{raw:mask.info}).png().toFile(`${dir}/regions.png`);
// Patch only region-9 metadata, preserving all other metadata bytes.
// Report updated metadata below for a narrowly scoped apply_patch edit.
fs.writeFileSync(`${audit}/added-pixels.json`,JSON.stringify(added));
for(const [label,rgb] of Object.entries({red:[255,0,0],blue:[0,0,255],green:[0,128,0],white:[255,255,255]}))for(const [phase,m] of [['before',old],['after',mask.data]]){
 const b=Buffer.from(base.data);for(let p=0;p<w*h;p++){const o=p*4;if(m[o]===9&&m[o+2]===147&&m[o+3])for(let c=0;c<3;c++)b[o+c]=label==='white'?Math.round(255*.9+b[o+c]*.1):Math.round(b[o+c]*(.28+.72*rgb[c]/255));const a=outline.data[o+3]/255;for(let c=0;c<3;c++)b[o+c]=Math.round(b[o+c]*(1-a)+outline.data[o+c]*a);}
 await sharp(b,{raw:base.info}).extract({left:465,top:655,width:110,height:105}).resize(660,630,{kernel:'nearest'}).png().toFile(`${audit}/${label}-${phase}.png`);
}
console.log({added:added.length,region:r});
