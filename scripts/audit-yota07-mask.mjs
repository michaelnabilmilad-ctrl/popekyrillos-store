import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const dir = path.join(root, "coloring", "yota-07");
const metadata = JSON.parse(fs.readFileSync(path.join(dir, "regions.json"), "utf8"));
const { data, info } = await sharp(path.join(dir, "regions.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const outline = (await sharp(path.join(dir, "outline.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true })).data;

for (const region of metadata.regions) {
  const { x, y, width, height } = region.bounds;
  const target = (px, py) => {
    const o = (py * info.width + px) * 4;
    return data[o] === region.maskColor[0] && data[o + 1] === region.maskColor[1] && data[o + 2] === region.maskColor[2] && data[o + 3] !== 0;
  };
  const seen = new Uint8Array(width * height);
  const holes = [];
  for (let ly = 0; ly < height; ly++) for (let lx = 0; lx < width; lx++) {
    const local = ly * width + lx;
    if (seen[local] || target(x + lx, y + ly)) continue;
    const queue = [local]; seen[local] = 1; const pixels = []; let edge = false;
    for (let qi = 0; qi < queue.length; qi++) {
      const p = queue[qi], cx = p % width, cy = Math.floor(p / width); pixels.push(p);
      if (!cx || !cy || cx === width - 1 || cy === height - 1) edge = true;
      for (const [nx, ny] of [[cx-1,cy],[cx+1,cy],[cx,cy-1],[cx,cy+1]]) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const np = ny * width + nx;
        if (!seen[np] && !target(x + nx, y + ny)) { seen[np] = 1; queue.push(np); }
      }
    }
    if (!edge) {
      const xs = pixels.map(p => p % width + x), ys = pixels.map(p => Math.floor(p / width) + y);
      let outlinePixels = 0, darkOutlinePixels = 0;
      for (const p of pixels) {
        const px = p % width + x, py = Math.floor(p / width) + y, o = (py * info.width + px) * 4;
        if (outline[o + 3]) {
          outlinePixels++;
          if (.2126 * outline[o] + .7152 * outline[o + 1] + .0722 * outline[o + 2] < 120) darkOutlinePixels++;
        }
      }
      holes.push({ pixels: pixels.length, x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs)-Math.min(...xs)+1, height: Math.max(...ys)-Math.min(...ys)+1, outlinePixels, darkOutlinePixels });
    }
  }
  let overlay = 0, lightOverlay = 0, partialOverlay = 0;
  let isolatedOverlay = 0;
  for (let py = y; py < y + height; py++) for (let px = x; px < x + width; px++) if (target(px, py)) {
    const o = (py * info.width + px) * 4, alpha = outline[o + 3];
    if (alpha) {
      overlay++;
      if (alpha < 255) partialOverlay++;
      if (.2126 * outline[o] + .7152 * outline[o + 1] + .0722 * outline[o + 2] > 120) lightOverlay++;
    }
  }
  for (let py = y; py < y + height; py++) for (let px = x; px < x + width; px++) if (target(px, py)) {
    const p=py*info.width+px,o=p*4;if(!outline[o+3])continue;let boundary=false;
    for(let ny=py-1;ny<=py+1;ny++)for(let nx=px-1;nx<=px+1;nx++)if(!target(nx,ny))boundary=true;
    if(!boundary)isolatedOverlay++;
  }
  console.log(region.id, JSON.stringify({ holes, overlay, lightOverlay, partialOverlay, isolatedOverlay }));
}
