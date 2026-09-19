import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const dir = path.join(root, "coloring", "yota-07");
const artifacts = path.join(root, "artifacts", "yota-07-color-quality");
const metadata = JSON.parse(fs.readFileSync(path.join(dir, "regions.json"), "utf8"));
const currentMask = await sharp(path.join(dir, "regions.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const oldMask = await sharp(path.join(artifacts, "regions-before.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const currentOutline = await sharp(path.join(dir, "outline.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const oldOutline = await sharp(path.join(artifacts, "outline-before.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const base = await sharp(path.join(dir, "base.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

test("Model 7 keeps all nine regions independent and connected", () => {
  assert.equal(metadata.totalRegions,9);
  const W=currentMask.info.width,H=currentMask.info.height;
  for(const r of metadata.regions){const pixels=[];for(let p=0;p<W*H;p++){let o=p*4;if(currentMask.data[o]===r.maskColor[0]&&currentMask.data[o+1]===r.maskColor[1]&&currentMask.data[o+2]===r.maskColor[2]&&currentMask.data[o+3])pixels.push(p)}assert.equal(pixels.length,r.pixelCount);const set=new Set(pixels),seen=new Set([pixels[0]]),q=[pixels[0]];for(let i=0;i<q.length;i++){let p=q[i];for(const n of[p-1,p+1,p-W,p+W])if(set.has(n)&&!seen.has(n)){seen.add(n);q.push(n)}}assert.equal(seen.size,pixels.length,`${r.id} is connected`)}
});

test("outer crosses preserve exactly their four intentional wooden squares", () => {
  const W=currentMask.info.width;
  for(const r of metadata.regions.slice(0,4))for(const dx of[-22,22])for(const dy of[-22,22])assert.equal(currentMask.data[((r.centerY+dy)*W+r.centerX+dx)*4+3],0,`${r.id} intentional square stays wood`);
});

test("no light texture overlay remains above any painted Model 7 pixel",()=>{
  for(let p=0;p<currentMask.data.length/4;p++){let o=p*4;if(!currentMask.data[o+3]||!currentOutline.data[o+3])continue;let l=.2126*currentOutline.data[o]+.7152*currentOutline.data[o+1]+.0722*currentOutline.data[o+2];assert.ok(l<120,"only dark engraved outline pixels may overlay paint")}
});

test("Model 7 uses strong model-scoped paint opacity", async () => {
  const source = fs.readFileSync(path.join(root,"coloringDesigns.js"),"utf8");
  const block = source.match(/id: "yota-07"[\s\S]*?status: "ready"/)[0];
  assert.match(block,/woodPaintEffect: Object\.freeze\(\{ strength: 0\.88, textureAmount: 0\.16, smoothEdges: true, edgeAlpha: 0\.92 \}\)/);
  assert.match(block,/storageVersion: "quality-v1"/);
  assert.match(block,/modelVersion: "yota-07-v5"/);
  const runtime=fs.readFileSync(path.join(root,"coloring-game.js"),"utf8");
  assert.match(runtime,/function paintedWoodRgb/);
  assert.match(runtime,/function paintedWoodEdgeAlpha/);
  assert.match(runtime,/if \(state\.design\.woodPaintEffect\)/);
});

test("Model 7 invalidates stale saved colors without changing other model storage keys",()=>{
  const runtime=fs.readFileSync(path.join(root,"coloring-game.js"),"utf8");
  assert.match(runtime,/state\.design\.storageVersion \? `:\$\{state\.design\.storageVersion\}` : ""/);
  const designs=fs.readFileSync(path.join(root,"coloringDesigns.js"),"utf8");
  assert.equal((designs.match(/storageVersion:/g)||[]).length,1,"only Model 7 opts into a new storage namespace");
});

test("dark red, green, blue, orange and white paint every repaired pixel", () => {
  const colors=[[128,0,32],[0,128,0],[0,0,255],[255,102,0],[255,255,255]];
  for(const color of colors) {let eligible=0,changed=0;for(let p=0;p<currentMask.data.length/4;p++) {
    const o=p*4;if(currentMask.data[o+3]) {
      if(currentOutline.data[o+3]){const l=.2126*currentOutline.data[o]+.7152*currentOutline.data[o+1]+.0722*currentOutline.data[o+2];assert.ok(l<120,"only the engraved dark line may overlay paint")}
      const luminance=.2126*base.data[o]+.7152*base.data[o+1]+.0722*base.data[o+2],brightness=1+((luminance-178)/255)*.16;
      const painted=color.map(channel=>.88*Math.min(255,channel*brightness)+.12*luminance);
      if(base.data[o]+base.data[o+1]+base.data[o+2]>30){eligible++;if(painted.some((channel,c)=>Math.abs(channel-base.data[o+c])>1))changed++}
    }
  }assert.ok(changed/eligible>.95,`${color} visibly replaces the colorable wood surface`)}
});
