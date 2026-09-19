import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const dir = path.join(root, 'coloring/yota-07');
const art = path.join(root, 'artifacts/yota-07-inner-tabs');
fs.mkdirSync(art, { recursive: true });
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
if (!fs.existsSync(path.join(art, 'baseline.json'))) {
  const hashes = {};
  for (let n = 1; n <= 13; n++) {
    const model = `yota-${String(n).padStart(2, '0')}`;
    for (const name of ['base.png', 'outline.png', 'regions.png', 'regions.json', 'region-overrides.json']) {
      const relative = `coloring/${model}/${name}`;
      if (fs.existsSync(path.join(root, relative))) hashes[relative] = hash(path.join(root, relative));
    }
  }
  fs.writeFileSync(path.join(art, 'baseline.json'), JSON.stringify(hashes, null, 2));
  for (const name of ['base.png', 'outline.png', 'regions.png']) fs.copyFileSync(path.join(dir, name), path.join(art, `before-${name}`));
}
const read = file => sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const base = await read(path.join(art, 'before-base.png'));
const outline = await read(path.join(art, 'before-outline.png'));
const mask = await read(path.join(art, 'before-regions.png'));
const crop = { left: 500, top: 760, width: 236, height: 215 };
async function render(b, o, name) {
  const data = Buffer.from(b);
  for (let p = 0; p < base.info.width * base.info.height; p++) {
    const i = p * 4;
    if (mask.data[i + 3] && [5, 6, 8, 9].includes(mask.data[i])) {
      const lum = .2126 * b[i] + .7152 * b[i + 1] + .0722 * b[i + 2];
      const light = 1 + ((lum - 178) / 255) * .16;
      for (let c = 0; c < 3; c++) data[i + c] = Math.round(.88 * Math.min(255, [180, 0, 30][c] * light) + .12 * lum);
    }
    const a = o[i + 3] / 255;
    for (let c = 0; c < 3; c++) data[i + c] = Math.round(o[i + c] * a + data[i + c] * (1 - a));
  }
  await sharp(data, { raw: base.info }).extract(crop).resize(708, 645, { kernel: 'nearest' }).png().toFile(path.join(art, name));
}
await render(base.data, outline.data, 'before.png');
if (process.argv[2]) {
  const generatedPath = path.resolve(process.argv[2]);
  fs.copyFileSync(generatedPath, path.join(art, 'generated-reference.png'));
  const outBase = Buffer.from(base.data), outOutline = Buffer.from(outline.data), outMask = Buffer.from(mask.data);
  const edits = [
    { target: { left: 574, top: 834, width: 21, height: 21 }, points: '580,845 588,837 592,841 584,849' },
    { target: { left: 574, top: 878, width: 22, height: 17 }, points: '580,884 584,880 592,888 588,892' }
  ];
  let changed = 0;
  for (const edit of edits) {
    const t = edit.target;
    // Rectify the two generated tabs to equal 45-degree rectangles at native scale.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${t.width}" height="${t.height}" viewBox="${t.left} ${t.top} ${t.width} ${t.height}"><polygon points="${edit.points}" fill="none" stroke="black" stroke-width="1.25" stroke-linejoin="round"/></svg>`;
    const fragment = await sharp(Buffer.from(svg),{density:288}).resize(t.width,t.height).ensureAlpha().raw().toBuffer();
    const interior = await sharp(Buffer.from(svg.replace('fill="none"','fill="black"')),{density:288}).resize(t.width,t.height).ensureAlpha().raw().toBuffer();
    for (let y = 0; y < t.height; y++) for (let x = 0; x < t.width; x++) {
      const px = t.left + x, py = t.top + y, i = (py * base.info.width + px) * 4, j = (y * t.width + x) * 4;
      // Exact preservation of all four painted motifs, including their antialiased borders.
      if (mask.data[i + 3] && [1, 2, 3, 4, 5, 6, 8, 9].includes(mask.data[i])) continue;
      if ([[617,829],[579,865],[653,864],[617,901]].some(([cx,cy]) => Math.abs(px-cx)+Math.abs(py-cy)<=12)) continue;
      const ink = fragment[j+3]/255;
      const woodIndex = ((856+y%10)*base.info.width+608+x%12)*4;
      const feather = Math.min(1, Math.min(x+1,y+1,t.width-x,t.height-y)/2);
      for(let c=0;c<3;c++) {
        const value = base.data[woodIndex+c]*(1-ink)+[93,47,13][c]*ink;
        outBase[i+c]=Math.round(base.data[i+c]*(1-feather)+value*feather);
        outOutline[i+c]=[93,47,13][c];
      }
      outOutline[i+3]=Math.round(outline.data[i+3]*(1-feather)+255*ink*feather);
      if (interior[j+3]>=128 && mask.data[i+3] && mask.data[i]===7) outMask.fill(0,i,i+4);
      changed++;
    }
  }
  const remaining=new Set();
  for(let i=0;i<outMask.length;i+=4)if(outMask[i]===7&&outMask[i+3])remaining.add(i/4);
  const parts=[];
  while(remaining.size){const q=[remaining.values().next().value];remaining.delete(q[0]);for(let j=0;j<q.length;j++)for(const n of [q[j]-1,q[j]+1,q[j]-base.info.width,q[j]+base.info.width])if(remaining.delete(n))q.push(n);parts.push(q);}
  parts.sort((a,b)=>b.length-a.length);
  for(const part of parts.slice(1))for(const p of part){const x=p%base.info.width,y=Math.floor(p/base.info.width);if(!edits.some(({target:t})=>x>=t.left&&x<t.left+t.width&&y>=t.top&&y<t.top+t.height))throw new Error(`Fragment outside tab scope: ${x},${y}`);outMask.fill(0,p*4,p*4+4);}
  console.log('center remaining pixels',parts[0].length);
  await sharp(outBase,{raw:base.info}).png().toFile(path.join(art,'base-candidate.png'));
  await sharp(outOutline,{raw:outline.info}).png().toFile(path.join(art,'outline-candidate.png'));
  await sharp(outMask,{raw:mask.info}).png().toFile(path.join(art,'regions-candidate.png'));
  await render(outBase,outOutline,'after.png');
  fs.writeFileSync(path.join(art,'edit-scope.json'),JSON.stringify({edits,changed},null,2));
  console.log({changed});
}
console.log(art);
