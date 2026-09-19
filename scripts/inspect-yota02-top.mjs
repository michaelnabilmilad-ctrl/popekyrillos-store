import fs from 'node:fs';
import sharp from 'sharp';
const dir='artifacts/yota-02-top'; fs.mkdirSync(dir,{recursive:true});
const crop={left:550,top:548,width:145,height:180};
for(const f of ['base','outline','regions']) await sharp(`coloring/yota-02/${f}.png`).extract(crop).resize(580,720,{kernel:'nearest'}).png().toFile(`${dir}/${f}-before.png`);
const mask=await sharp('coloring/yota-02/regions.png').ensureAlpha().raw().toBuffer({resolveWithObject:true});
const out=await sharp('coloring/yota-02/outline.png').ensureAlpha().raw().toBuffer({resolveWithObject:true});
const r=JSON.parse(fs.readFileSync('coloring/yota-02/regions.json')).regions.find(r=>r.id==='region-5');
let pixels=0,overlay=0;for(let p=0;p<mask.info.width*mask.info.height;p++){let o=p*4;if(mask.data[o+3]&&r.maskColor.every((v,c)=>mask.data[o+c]===v)){pixels++;if(out.data[o+3])overlay++;}}
console.log({region:r.id,pixels,overlay});
const w=mask.info.width,h=mask.info.height,seen=new Uint8Array(w*h),q=[600*w+619];seen[q[0]]=1;
for(let i=0;i<q.length;i++){const p=q[i];for(const n of [p-1,p+1,p-w,p+w]){if(n<0||n>=w*h||seen[n]||out.data[n*4+3])continue;seen[n]=1;q.push(n);}}
const missing=q.filter(p=>!mask.data[p*4+3]);
let parts=[];const pending=new Set(missing);
while(pending.size){const s=pending.values().next().value,part=[s];pending.delete(s);for(let i=0;i<part.length;i++)for(const n of [part[i]-1,part[i]+1,part[i]-w,part[i]+w])if(pending.delete(n))part.push(n);parts.push({count:part.length,x0:Math.min(...part.map(p=>p%w)),x1:Math.max(...part.map(p=>p%w)),y0:Math.min(...part.map(p=>Math.floor(p/w))),y1:Math.max(...part.map(p=>Math.floor(p/w)))});}
console.log({outlineInterior:q.length,missing:missing.length,parts});
for(let y=568;y<=602;y++){let row='';for(let x=604;x<=634;x++){const o=(y*w+x)*4;row+=out.data[o+3]?'#':mask.data[o+3]?'M':'.';}console.log(y,row);}
