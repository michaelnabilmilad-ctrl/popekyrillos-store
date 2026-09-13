import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const [targetPath, recoveryCommit] = process.argv.slice(2);
if (!targetPath || !recoveryCommit) {
  throw new Error("Usage: node scripts/recover-catalog-products.mjs <products.json> <recovery-commit>");
}

const current = JSON.parse(fs.readFileSync(path.resolve(targetPath), "utf8"));
const historical = JSON.parse(execFileSync("git", ["show", `${recoveryCommit}:products.json`], {
  encoding: "utf8",
  maxBuffer: 50 * 1024 * 1024
}));
const currentIds = new Set(current.map((product) => String(product.id)));
const recovered = historical.filter((product) => !currentIds.has(String(product.id)));
const merged = [...current, ...recovered];

const ids = new Set();
for (const product of merged) {
  const id = String(product.id || "");
  if (!id || ids.has(id)) throw new Error(`Invalid or duplicate product id: ${id}`);
  ids.add(id);
}

fs.writeFileSync(path.resolve(targetPath), `${JSON.stringify(merged, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ before: current.length, after: merged.length, recovered: recovered.map(({ id, name, sku }) => ({ id, name, sku: sku || "" })) }, null, 2));
