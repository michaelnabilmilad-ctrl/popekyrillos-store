import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
const root=path.resolve(import.meta.dirname,".."),dir=path.join(root,"coloring","yota-07"),outDir=path.join(root,"artifacts","yota-07-color-quality");
const meta=JSON.parse(fs.readFileSync(path.join(dir,"regions.json"),"utf8"));
const maskImg=await sharp(path.join(dir,"regions.png")).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const outImg=await sharp(path.join(dir,"outline.png")).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const mask=Buffer.from(maskImg.data),outline=Buffer.from(outImg.data),w=maskImg.info.width,total=w*maskImg.info.height,claims=new Int16Array(total);let added=0;
const barrier=p=>{let o=p*4,l=.2126*outImg.data[o]+.7152*outImg.data[o+1]+.0722*outImg.data[o+2];return outImg.data[o+3]>0&&l<70};
for(const [ri,r] of meta.regions.entries()){
 const target=(px,py)=>{let o=(py*w+px)*4;return mask[o]===r.maskColor[0]&&mask[o+1]===r.maskColor[1]&&mask[o+2]===r.maskColor[2]&&mask[o+3]};
 const seen=new Uint8Array(total),distance=new Uint8Array(total),q=[];for(let p=0;p<total;p++){let o=p*4;if(mask[o]===r.maskColor[0]&&mask[o+1]===r.maskColor[1]&&mask[o+2]===r.maskColor[2]&&mask[o+3]){seen[p]=1;q.push(p)}}
 const b=r.bounds,minX=b.x-2,maxX=b.x+b.width+1,minY=b.y-2,maxY=b.y+b.height+1;
 for(let i=0;i<q.length;i++){let p=q[i],x=p%w,y=Math.floor(p/w);if(distance[p]>=15)continue;for(const[np,nx,ny]of[[p-1,x-1,y],[p+1,x+1,y],[p-w,x,y-1],[p+w,x,y+1]]){if(nx<minX||nx>maxX||ny<minY||ny>maxY||seen[np]||barrier(np)||(mask[np*4+3]&&!target(nx,ny)))continue;seen[np]=1;distance[np]=distance[p]+1;q.push(np)}}
 let n=0;for(const p of q){claims[p]++;let o=p*4;if(!mask[o+3]){mask[o]=r.maskColor[0];mask[o+1]=r.maskColor[1];mask[o+2]=r.maskColor[2];mask[o+3]=255;outline[o+3]=0;n++;}}
 added+=n;console.log(r.id,{before:r.pixelCount,after:q.length,added:n});
}
let overlaps=0;for(const c of claims)if(c>1)overlaps++;console.log({added,overlaps});
// Restore the photographed pixels for the four intentional square openings in
// every outer cross and the four intentional engraved diamonds at the center.
const protectedCenters=[];
for(const r of meta.regions.slice(0,4))for(const dx of[-22,22])for(const dy of[-22,22])protectedCenters.push([r.centerX+dx,r.centerY+dy,9]);
protectedCenters.push([618,829,9],[575,866,9],[662,866,9],[618,907,9]);
for(const[cx,cy,radius]of protectedCenters)for(let y=cy-radius;y<=cy+radius;y++)for(let x=cx-radius;x<=cx+radius;x++){let p=(y*w+x)*4;maskImg.data.copy(mask,p,p,p+4);outImg.data.copy(outline,p,p,p+4)}
await sharp(mask,{raw:maskImg.info}).png().toFile(path.join(outDir,"regions-boundary-candidate.png"));
await sharp(outline,{raw:outImg.info}).png().toFile(path.join(outDir,"outline-boundary-candidate.png"));
