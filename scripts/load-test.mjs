import { performance } from "node:perf_hooks";

const target = (process.argv[2] || "https://popekyrillos.store").replace(/\/+$/, "");
const totalRequests = Number(process.argv[3] || 120);
const concurrency = Number(process.argv[4] || 12);
const timeoutMs = Number(process.argv[5] || 15000);
const bustCache = process.argv.includes("--bust-cache");

const defaultPaths = [
  "/",
  "/products.json",
  "/cart",
  "/checkout",
  "/payment",
  "/assets/hero-products-collage.png",
  "/assets/optimized/products/gallery/baskha-araby.webp"
];
const pagePaths = ["/", "/products.json", "/cart", "/checkout", "/payment"];
const paths = process.argv.includes("--pages-only") ? pagePaths : defaultPaths;

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

async function requestOnce(index) {
  const path = paths[index % paths.length];
  const separator = path.includes("?") ? "&" : "?";
  const url = `${target}${path}${bustCache ? `${separator}load_test=${Date.now()}_${index}` : ""}`;
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "popekyrillos-load-check/1.0"
      },
      signal: controller.signal
    });
    await response.arrayBuffer();
    return {
      path,
      ok: response.ok,
      status: response.status,
      duration: performance.now() - started
    };
  } catch (error) {
    return {
      path,
      ok: false,
      status: 0,
      duration: performance.now() - started,
      error: error.message
    };
  } finally {
    clearTimeout(timer);
  }
}

async function run() {
  const started = performance.now();
  const results = [];
  let next = 0;

  async function worker() {
    while (next < totalRequests) {
      const current = next;
      next += 1;
      results.push(await requestOnce(current));
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));

  const totalMs = performance.now() - started;
  const durations = results.map((result) => result.duration);
  const failures = results.filter((result) => !result.ok);
  const byPath = new Map();

  for (const result of results) {
    const group = byPath.get(result.path) || [];
    group.push(result);
    byPath.set(result.path, group);
  }

  console.log(`Target: ${target}`);
  console.log(`Requests: ${results.length}, concurrency: ${concurrency}, elapsed: ${(totalMs / 1000).toFixed(2)}s`);
  console.log(`Timeout: ${timeoutMs}ms, cache busting: ${bustCache ? "on" : "off"}`);
  console.log(`Throughput: ${(results.length / (totalMs / 1000)).toFixed(1)} req/s`);
  console.log(`Failures: ${failures.length}`);
  console.log(`Latency ms: avg=${(durations.reduce((sum, value) => sum + value, 0) / durations.length).toFixed(1)} p50=${percentile(durations, 50).toFixed(1)} p95=${percentile(durations, 95).toFixed(1)} max=${Math.max(...durations).toFixed(1)}`);
  console.log("");
  console.log("By path:");

  for (const [path, items] of byPath.entries()) {
    const itemDurations = items.map((item) => item.duration);
    const statusCounts = items.reduce((counts, item) => {
      counts[item.status] = (counts[item.status] || 0) + 1;
      return counts;
    }, {});
    console.log(`${path} count=${items.length} failures=${items.filter((item) => !item.ok).length} avg=${(itemDurations.reduce((sum, value) => sum + value, 0) / itemDurations.length).toFixed(1)}ms p95=${percentile(itemDurations, 95).toFixed(1)}ms statuses=${JSON.stringify(statusCounts)}`);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
