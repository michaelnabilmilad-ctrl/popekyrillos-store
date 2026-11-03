// Helper for the separate Meta CAPI TEST Worker (wrangler.meta-test.toml). It never deploys
// and never touches production. Commands:
//   node scripts/meta-test-worker.mjs check            safety checks on the test config
//   node scripts/meta-test-worker.mjs set-db-id <uuid> put the NEW test database id in the config
//   node scripts/meta-test-worker.mjs seed-order       write SQL for ONE fake order (test DB only)
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const CONFIG = "wrangler.meta-test.toml";
const PROD_DB_ID = "57b6dbf7-7266-47c4-a24d-9a1f18e97fce";
const PLACEHOLDER = "PENDING-APPROVAL-create-a-new-empty-database";
const read = () => readFileSync(CONFIG, "utf8");
const value = (text, key) => (text.match(new RegExp(`^${key}\\s*=\\s*"?([^"\\n]*)"?`, "m")) || [])[1];

function check({ requireDb = true } = {}) {
  const text = read();
  const body = text.split("\n").filter((line) => !line.trim().startsWith("#")).join("\n");
  const prodName = value(readFileSync("wrangler.toml", "utf8"), "name");
  const dbId = value(body, "database_id");
  const rules = [
    ["Worker name is popekyrillos-store-meta-test", value(body, "name") === "popekyrillos-store-meta-test" && value(body, "name") !== prodName],
    ["no routes / custom domains", !/^\s*(routes?|\[\[routes\]\]|custom_domain)\b/m.test(body)],
    ["workers.dev only, preview URLs off", value(body, "workers_dev") === "true" && value(body, "preview_urls") === "false"],
    ["PREVIEW_MODE=1 and META_CAPI_PREVIEW=1", value(body, "PREVIEW_MODE") === "1" && value(body, "META_CAPI_PREVIEW") === "1"],
    ["META_CAPI_SEND_IP=false", value(body, "META_CAPI_SEND_IP") === "false"],
    ["Dataset 1182812737752728", value(body, "META_DATASET_ID") === "1182812737752728"],
    ["only D1 + static assets bindings", !/\[\[?(kv_namespaces|r2_buckets|queues|durable_objects|services|hyperdrive|vectorize|ai|browser|analytics_engine_datasets)/m.test(body)],
    ["test database name popekyrillos-meta-test", value(body, "database_name") === "popekyrillos-meta-test"],
    ["database is NOT the production database", dbId !== PROD_DB_ID],
    ["no secrets written in the file", !/(META_CAPI_TOKEN|META_TEST_EVENT_CODE|META_TEST_ACCESS_KEY|AIRTABLE|PAYMOB|BOSTA|GITHUB_TOKEN|ANTHROPIC)\s*=/m.test(body)]
  ];
  if (requireDb) rules.push(["test database id filled in", /^[0-9a-f-]{36}$/.test(dbId || "") && dbId !== PLACEHOLDER]);
  let ok = true;
  for (const [label, pass] of rules) {
    console.log(`${pass ? "OK  " : "FAIL"}  ${label}`);
    ok &&= pass;
  }
  console.log(ok ? "\nAll checks passed." : "\nSTOP: fix the failures before deploying.");
  process.exitCode = ok ? 0 : 1;
}

function setDbId(id) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id || "")) throw new Error("Give the uuid printed by `wrangler d1 create popekyrillos-meta-test`.");
  if (id === PROD_DB_ID) throw new Error("That is the PRODUCTION database id. Refusing.");
  writeFileSync(CONFIG, read().replace(/^database_id\s*=.*$/m, `database_id = "${id}"`));
  console.log(`Test database id set to ${id}.`);
  check();
}

function seedOrder() {
  const token = randomBytes(32).toString("hex");
  const snapshot = JSON.stringify({ total: 150, items: [{ quantity: 2 }] });
  const sql = [
    "CREATE TABLE IF NOT EXISTS customer_order_access (scope TEXT NOT NULL, order_id TEXT NOT NULL, token TEXT NOT NULL UNIQUE, snapshot TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(scope, order_id));",
    `INSERT INTO customer_order_access (scope, order_id, token, snapshot) VALUES ('meta-test', 'FAKE-${Date.now()}', '${token}', '${snapshot}');`
  ].join("\n");
  mkdirSync(".wrangler/tmp", { recursive: true });
  writeFileSync(".wrangler/tmp/meta-test-fake-order.sql", `${sql}\n`);
  console.log("Fake order SQL (150 EGP, 2 items, no customer data): .wrangler/tmp/meta-test-fake-order.sql");
  console.log("Load it into the TEST database only:");
  console.log("  npx wrangler d1 execute popekyrillos-meta-test --remote --config wrangler.meta-test.toml --file .wrangler/tmp/meta-test-fake-order.sql");
  console.log(`Then open: https://<test-worker>.workers.dev/order-success#${token}`);
}

const [command, arg] = process.argv.slice(2);
if (command === "check") check({ requireDb: arg !== "--before-db" });
else if (command === "set-db-id") setDbId(arg);
else if (command === "seed-order") seedOrder();
else console.log("Usage: node scripts/meta-test-worker.mjs check [--before-db] | set-db-id <uuid> | seed-order");
