import fs from 'node:fs';
import sharp from "sharp";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const source = path.join(root, "assets/optimized/products/gallery/product-1-13-20260706001209-c66b79.webp");

const { data, info } = await sharp(source).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;
const total = width * height;
const at = (x, y) => y * width + x;
const line = new Uint8Array(total);
for (let y = 560; y < 1260; y += 1) for (let x = 360; x < 1040; x += 1) {
  const p = at(x, y), o = p * channels;
  const r = data[o], g = data[o + 1], b = data[o + 2];
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max < 95 && max - min < 55) line[p] = 1;
}
const barrier = line.slice();
for (let y = 562; y < 1258; y += 1) for (let x = 362; x < 1038; x += 1) {
  const p = at(x, y); if (!line[p]) continue;
  for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) barrier[p + dy * width + dx] = 1;
}
const seen = new Uint8Array(total), queue = new Int32Array(total), components = [];
for (let y = 570; y < 1250; y += 1) for (let x = 370; x < 1030; x += 1) {
  const seed = at(x, y); if (seen[seed] || barrier[seed]) continue;
  let head = 0, tail = 0, touchesEdge = false; queue[tail++] = seed; seen[seed] = 1;
  while (head < tail) {
    const p = queue[head++], px = p % width, py = Math.floor(p / width);
    if (px <= 371 || px >= 1028 || py <= 571 || py >= 1248) touchesEdge = true;
    for (const n of [p - 1, p + 1, p - width, p + width]) {
      const nx = n % width, ny = Math.floor(n / width);
      if (n < 0 || n >= total || nx < 370 || nx >= 1030 || ny < 570 || ny >= 1250 || Math.abs(nx - px) > 1 || seen[n] || barrier[n]) continue;
      seen[n] = 1; queue[tail++] = n;
    }
  }
  if (!touchesEdge && tail >= 120 && tail <= 120000) components.push(Array.from(queue.subarray(0, tail)));
}
const describe = (pixels) => {
  let sx = 0, sy = 0, minX = width, minY = height, maxX = 0, maxY = 0;
  for (const p of pixels) { const x = p % width, y = Math.floor(p / width); sx += x; sy += y; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  return { pixels, centerX: sx / pixels.length, centerY: sy / pixels.length, minX, minY, maxX, maxY };
};
const ordered = components.map(describe).sort((a, b) => a.centerY - b.centerY || a.centerX - b.centerX);

const dir = path.join(root, "coloring/yota-13");
const report = path.join(root, "artifacts/yota-13");
fs.mkdirSync(dir, {recursive:true}); fs.mkdirSync(report,{recursive:true});
if(ordered.length!==38) throw Error("Expected 38 engraved regions");
const owner = new Int16Array(total).fill(-1);
ordered.forEach((c,i)=>c.pixels.forEach(p=>owner[p]=i));
// Recover the two-pixel safety margin up to the detected engraving.
for(let pass=0;pass<2;pass++){
 const additions=[];
 for(let y=637;y<1237;y++)for(let x=393;x<995;x++){
  const p=at(x,y); if(owner[p]>=0 || line[p])continue;
  const claims=new Set([owner[p-1],owner[p+1],owner[p-width],owner[p+width]].filter(i=>i>=0));
  if(claims.size===1)additions.push([p,[...claims][0]]);
 }
 additions.forEach(([p,i])=>owner[p]=i);
}
// Fill small enclosed defects, never other regions or the rings' intentional openings.
for(let i=0;i<ordered.length;i++){
 const c=ordered[i], l=c.minX-3,t=c.minY-3,r=c.maxX+3,b=c.maxY+3;
 const visited=new Set();
 for(let y=t;y<=b;y++)for(let x=l;x<=r;x++){
  const seed=at(x,y);if(owner[seed]===i||visited.has(seed))continue;
  const q=[seed];visited.add(seed);let edge=false, foreign=false;
  for(let head=0;head<q.length;head++){
   const p=q[head],px=p%width,py=Math.floor(p/width);
   if(px===l||px===r||py===t||py===b)edge=true;
   if(owner[p]>=0)foreign=true;
   for(const n of [p-1,p+1,p-width,p+width]){
    const nx=n%width,ny=Math.floor(n/width);
    if(nx<l||nx>r||ny<t||ny>b||owner[n]===i||visited.has(n))continue;
    visited.add(n);q.push(n);
   }
  }
  if(!edge&&!foreign&&q.length<250)q.forEach(p=>owner[p]=i);
 }
}
ordered.forEach((c,i)=>{c.pixels=[];for(let p=0;p<total;p++)if(owner[p]===i)c.pixels.push(p);Object.assign(c,describe(c.pixels));});
const groupNumbers=[[1,18,38,22],[2,21,37,17],[3,13,36,26],[4,24,35,15],[5,27,34,12],[6,11,33,28],[7,29,31,10],[8,9,32,30],[14,16,25,23]];
const groups=Object.fromEntries(groupNumbers.map((ids,i)=>["matching-"+(i+1),ids.map(n=>"region-"+n)]));
const groupById=new Map(Object.entries(groups).flatMap(([g,ids])=>ids.map(id=>[id,g])));
const mask=Buffer.alloc(total*4),outline=Buffer.alloc(total*4);
const plainPath=path.join(root,"assets/optimized/products/gallery/product-1-1313-20260706001215-20c811.webp");
const base=await sharp(plainPath).ensureAlpha().raw().toBuffer();
const maskColor=i=>[i+1,0,((i+1)*73)%255||1];
ordered.forEach((c,i)=>c.pixels.forEach(p=>{
 const o=p*4,col=maskColor(i);mask[o]=col[0];mask[o+1]=col[1];mask[o+2]=col[2];mask[o+3]=255;
 // Neutral wood preparation only inside colorable interiors prevents the
 // photographic watermark being multiplied back into paint by either renderer.
 base[o]=232;base[o+1]=210;base[o+2]=165;
}));
// Outline comes only from the physical boundary beside a declared mask.
// No photographed watermark/texture is copied to the overlay.
for(let y=637;y<1237;y++)for(let x=393;x<995;x++){
 const p=at(x,y);if(owner[p]>=0||!line[p])continue;
 let near=false;
 for(let dy=-3;dy<=3&&!near;dy++)for(let dx=-3;dx<=3;dx++)if(owner[p+dy*width+dx]>=0){near=true;break;}
 if(near){const o=p*4;outline[o]=65;outline[o+1]=45;outline[o+2]=25;outline[o+3]=255;}
}
const regions=ordered.map((c,i)=>{
 const id="region-"+(i+1),sample=c.pixels.reduce((best,p)=>Math.hypot(p%width-c.centerX,Math.floor(p/width)-c.centerY)<Math.hypot(best%width-c.centerX,Math.floor(best/width)-c.centerY)?p:best,c.pixels[0]);
 return {id,regionId:id,maskColor:maskColor(i),pixelCount:c.pixels.length,centerX:Math.round(c.centerX),centerY:Math.round(c.centerY),sampleX:sample%width,sampleY:Math.floor(sample/width),bounds:{x:c.minX,y:c.minY,width:c.maxX-c.minX+1,height:c.maxY-c.minY+1},logicalRegionId:id,shapeGroup:groupById.get(id)||null,geometryType:i===18?"outer-continuous-band":i===19?"inner-continuous-band":groupById.get(id),regionKind:"decorative",enabled:true};
});
const modelId="yota-13",modelVersion="yota-13-v1";
const logicalShapes=Object.fromEntries(regions.map(r=>[r.id,[r.id]]));
const doc={modelId,modelVersion,modelName:"ميدالية يوتا 13",paintMode:"replace-source-color",totalRegions:38,regions,shapeGroups:Object.entries(groups).map(([id,regions])=>({id,regions}))};
const overrides={modelId,modelVersion,logicalShapes,similarShapeGroups:groups,groups,regions:Object.fromEntries(regions.map(r=>[r.id,{logicalRegionId:r.id,similarShapeGroup:r.shapeGroup,geometryType:r.geometryType,regionKind:r.regionKind}]))};
for(const [name,buffer] of [["base",base],["outline",outline],["regions",mask]])await sharp(buffer,{raw:{width,height,channels:4}}).png().toFile(path.join(dir,name+".png"));
fs.writeFileSync(path.join(dir,"regions.json"),JSON.stringify(doc,null,2)+"\n");
fs.writeFileSync(path.join(dir,"region-overrides.json"),JSON.stringify(overrides,null,2)+"\n");
const overlay=Buffer.alloc(total*4);
ordered.forEach((c,i)=>c.pixels.forEach(p=>{let o=p*4;overlay[o]=(i*83+40)%255;overlay[o+1]=(i*137+70)%255;overlay[o+2]=(i*59+110)%255;overlay[o+3]=255;}));
const preview=await sharp(base,{raw:{width,height,channels:4}}).composite([{input:overlay,raw:{width,height,channels:4}},{input:outline,raw:{width,height,channels:4}}]).png().toBuffer();
await sharp(preview).extract({left:385,top:630,width:620,height:615}).png().toFile(path.join(report,"all-regions.png"));
console.log(JSON.stringify({regions:38,groups,output:dir}));
