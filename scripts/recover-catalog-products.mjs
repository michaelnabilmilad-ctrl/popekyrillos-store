import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const legacySubcategoryIds = new Map([
  ["meeting-games", "christian-games"],
  ["cards", "cards-bookmarks"],
  ["bookmarks", "cards-bookmarks"],
  ["notebooks", "notebooks-planners"],
  ["planners", "notebooks-planners"],
  ["service-tools", "service-plates"],
  ["altar-vessels", "altar-sets"],
  ["stands", "icon-gospel-stands"],
  ["candle-supplies", "wicks-floats"],
  ["children-clothing", "children-deacon-tonias"],
  ["curtains", "sanctuary-curtains"],
  ["church-fabrics", "altar-cloths"],
  ["complete-sets", "deacon-clothing"],
  ["printed-icons", "saint-icons"],
  ["saints-pictures", "saint-icons"],
  ["small-icons", "giveaway-icons"],
  ["metal-crosses", "brass-crosses"],
  ["liturgical-books", "liturgy-books"],
  ["spiritual-theology", "theology-books"],
  ["coptic-books", "prayer-books"]
]);

export function canonicalizeRecoveredProduct(product) {
  const subcategory = legacySubcategoryIds.get(String(product?.subcategory || "")) || product?.subcategory;
  return subcategory === product?.subcategory ? product : { ...product, subcategory };
}

export function recoverMissingProducts(current, historical) {
  const currentIds = new Set(current.map((product) => String(product.id)));
  const recovered = historical.filter((product) => !currentIds.has(String(product.id))).map(canonicalizeRecoveredProduct);
  const merged = [...current, ...recovered];

  const ids = new Set();
  for (const product of merged) {
    const id = String(product.id || "");
    if (!id || ids.has(id)) throw new Error(`Invalid or duplicate product id: ${id}`);
    ids.add(id);
  }

  return { merged, recovered };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const [targetPath, recoveryCommit] = process.argv.slice(2);
  if (!targetPath || !recoveryCommit) {
    throw new Error("Usage: node scripts/recover-catalog-products.mjs <products.json> <recovery-commit>");
  }

  const current = JSON.parse(fs.readFileSync(path.resolve(targetPath), "utf8"));
  const historical = JSON.parse(execFileSync("git", ["show", `${recoveryCommit}:products.json`], {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024
  }));
  const { merged, recovered } = recoverMissingProducts(current, historical);

  fs.writeFileSync(path.resolve(targetPath), `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ before: current.length, after: merged.length, recovered: recovered.map(({ id, name, sku }) => ({ id, name, sku: sku || "" })) }, null, 2));
}
