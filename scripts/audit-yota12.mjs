import sharp from "sharp";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const source = path.join(root, "assets/optimized/products/gallery/product-1-12-20260706001132-8e3c59.webp");
const output = path.join(root, "coloring/yota-12-component-audit.png");
const { data, info } = await sharp(source).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;
const total = width * height;
const at = (x, y) => y * width + x;
const line = new Uint8Array(total);
for (let y = 560; y < 1260; y += 1) for (let x = 360; x < 1040; x += 1) {
  const p = at(x, y), o = p * channels;
  const r = data[o], g = data[o + 1], b = data[o + 2];
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max < 145 && max - min < 100) line[p] = 1;
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
const overlay = Buffer.alloc(total * 4);
ordered.forEach((component, index) => component.pixels.forEach((p) => { const o = p * 4; overlay[o] = (index * 83 + 40) % 255; overlay[o + 1] = (index * 137 + 70) % 255; overlay[o + 2] = (index * 59 + 110) % 255; overlay[o + 3] = 185; }));
const labels = ordered.map((c, i) => `<text x="${c.centerX.toFixed(0)}" y="${c.centerY.toFixed(0)}" text-anchor="middle" font-family="Arial" font-size="16" font-weight="700" fill="white" stroke="black" stroke-width="4" paint-order="stroke">${i + 1}</text>`).join("");
await sharp(source).composite([{ input: overlay, raw: { width, height, channels: 4 } }, { input: Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${labels}</svg>`) }]).png().toFile(output);
console.log(JSON.stringify(ordered.map((c, i) => ({ n: i + 1, pixels: c.pixels.length, x: Math.round(c.centerX), y: Math.round(c.centerY), bounds: [c.minX, c.minY, c.maxX, c.maxY] })), null, 2));
