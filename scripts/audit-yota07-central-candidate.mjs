import path from "node:path";
import fs from "node:fs";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const dir = path.join(root, "coloring", "yota-07");
const candidatePath = path.join(root, "artifacts", "yota-07-central-motifs", "regions-candidate.png");
const meta = JSON.parse(fs.readFileSync(path.join(dir, "regions.json"), "utf8"));
const current = await sharp(path.join(dir, "regions.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const candidate = await sharp(candidatePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const allowed = new Set(["region-5", "region-6", "region-8", "region-9"]);
const colorToId = new Map(meta.regions.map((r) => [r.maskColor.join(","), r.id]));
const changedByPair = new Map();

for (let p = 0; p < current.info.width * current.info.height; p++) {
  const o = p * 4;
  const a = current.data.subarray(o, o + 4);
  const b = candidate.data.subarray(o, o + 4);
  if (a.equals(b)) continue;
  const oldId = a[3] ? colorToId.get(`${a[0]},${a[1]},${a[2]}`) : "empty";
  const newId = b[3] ? colorToId.get(`${b[0]},${b[1]},${b[2]}`) : "empty";
  if ((oldId !== "empty" && !allowed.has(oldId)) || (newId !== "empty" && !allowed.has(newId))) {
    throw new Error(`Out-of-scope pixel ${p}: ${oldId} -> ${newId}`);
  }
  const key = `${oldId}->${newId}`;
  changedByPair.set(key, (changedByPair.get(key) || 0) + 1);
}

for (const id of allowed) {
  const region = meta.regions.find((r) => r.id === id);
  const pixels = new Set();
  for (let p = 0; p < candidate.info.width * candidate.info.height; p++) {
    const o = p * 4;
    if (candidate.data[o] === region.maskColor[0] && candidate.data[o + 1] === region.maskColor[1] && candidate.data[o + 2] === region.maskColor[2] && candidate.data[o + 3]) pixels.add(p);
  }
  const start = pixels.values().next().value;
  const seen = new Set([start]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    for (const n of [p - 1, p + 1, p - candidate.info.width, p + candidate.info.width]) {
      if (pixels.has(n) && !seen.has(n)) { seen.add(n); queue.push(n); }
    }
  }
  if (seen.size !== pixels.size) throw new Error(`${id} has ${pixels.size - seen.size} disconnected pixels`);
  console.log(`${id}: ${pixels.size} pixels, one connected component`);
}

console.log("Changed pixel classes:", Object.fromEntries(changedByPair));
console.log("PASS: only region-5/6/8/9 changed; outer crosses and center are byte-identical.");
