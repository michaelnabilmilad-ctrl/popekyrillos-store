import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import sharp from "sharp";
import { applyRegionPaint, resolvePaintTargets } from "../coloring-game.js";
import { COLORING_DESIGNS, withYotaColoringConfig } from "../coloringDesigns.js";
const dir = new URL("../coloring/yota-13/", import.meta.url);
const doc = JSON.parse(fs.readFileSync(new URL("regions.json",dir)));
const groups = JSON.parse(fs.readFileSync(new URL("region-overrides.json",dir))).similarShapeGroups;
const [mask,base,outline,source] = await Promise.all([
  new URL("regions.png",dir),new URL("base.png",dir),new URL("outline.png",dir),
  new URL("../assets/optimized/products/gallery/product-1-1313-20260706001215-20c811.webp",import.meta.url)
].map(p=>sharp(fs.readFileSync(p)).ensureAlpha().raw().toBuffer({resolveWithObject:true})));
const w=mask.info.width,h=mask.info.height;
test("Model 13 source, independent paths, and product identity agree",()=>{
 const d=COLORING_DESIGNS.find(d=>d.id==="yota-13");
 for(const file of ["basePath","outlinePath","regionsPath","regionsDataPath","regionOverridesPath"])assert.ok(d[file].startsWith("/coloring/yota-13/"));
 for(const catalog of ["../products.json","../firebase-functions/products.json"]){
  const p=JSON.parse(fs.readFileSync(new URL(catalog,import.meta.url))).find(p=>p.id===d.productId);
  assert.equal(p.name,"صليب يوتا مادلية موديل 13");
  assert.equal("/"+p.image,d.productImagePath);
  assert.equal(withYotaColoringConfig(p).coloringModelId,d.id);
 }
 assert.equal(doc.modelId,d.id); assert.equal(doc.regions.length,38);
 assert.equal(Object.keys(groups).length,9);
});
test("wood, metal, hanging hole, and all pixels outside masks preserve the product source",()=>{
 for(let p=0;p<w*h;p++){const o=p*4;if(!mask.data[o+3])assert.deepEqual(base.data.subarray(o,o+4),source.data.subarray(o,o+4));}
});
for(const r of doc.regions)test(r.id+" is connected, opaque, hole-validated and watermark-free for five paints",()=>{
 const {x,y,width,height}=r.bounds, bw=width+2,bh=height+2,bin=new Uint8Array(bw*bh);let count=0;
 for(let ly=0;ly<bh;ly++)for(let lx=0;lx<bw;lx++){
  const o=((y+ly-1)*w+x+lx-1)*4;
  if(mask.data[o+3]&&r.maskColor.every((v,c)=>mask.data[o+c]===v)){
   bin[ly*bw+lx]=1;count++;
   assert.equal(mask.data[o+3],255);
   assert.equal(outline.data[o+3],0,"overlay cannot contain interior watermark pixels");
   assert.deepEqual([...base.data.subarray(o,o+3)],[232,210,165],"paint substrate cannot contain watermark");
  }
 }
 assert.equal(count,r.pixelCount);
 const seen=new Uint8Array(bin.length),parts=[];
 for(let p=0;p<bin.length;p++){
  if(seen[p])continue;const value=bin[p],q=[p];seen[p]=1;let edge=false;
  for(let k=0;k<q.length;k++){const v=q[k],xx=v%bw,yy=Math.floor(v/bw);if(!xx||!yy||xx===bw-1||yy===bh-1)edge=true;
   for(const [nx,ny] of [[xx-1,yy],[xx+1,yy],[xx,yy-1],[xx,yy+1]]){const n=ny*bw+nx;if(nx<0||ny<0||nx>=bw||ny>=bh||seen[n]||bin[n]!==value)continue;seen[n]=1;q.push(n);}
  }parts.push({value,size:q.length,edge});
 }
 assert.equal(parts.filter(p=>p.value===1).length,1,"no disconnected islands");
 assert.equal(parts.filter(p=>p.value===0&&!p.edge).length,["region-19","region-20"].includes(r.id)?1:0,"only the two engraved bands have intentional openings");
 const sample=(r.sampleY*w+r.sampleX)*4;assert.deepEqual([...mask.data.subarray(sample,sample+3)],r.maskColor);
 for(const color of ["#ff0000","#008000","#ffff00","#0000ff","#ffffff"]){
  const members=Object.values(groups).find(ids=>ids.includes(r.id))||[r.id],lookup=new Map([[r.id,members]]);
  let painted=applyRegionPaint({},resolvePaintTargets(r.id,false,lookup),color);
  assert.deepEqual(Object.keys(painted),[r.id]);assert.equal(painted[r.id],color);
  painted=applyRegionPaint({},resolvePaintTargets(r.id,true,lookup),color);
  assert.deepEqual(Object.keys(painted).sort(),[...members].sort());
 }
});
