const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const redirects = fs.readFileSync("_redirects", "utf8");
const worker = fs.readFileSync("cloudflare-worker.js", "utf8");

// Workers assets serve /page.html as a 307 to /page, so a `_redirects` rewrite of /page
// to /page.html loops forever and the assets fetch fails with HTTP 500.
test("_redirects never rewrites a page to its .html file", () => {
  const rules = redirects.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
  for (const rule of rules) {
    const [, to = "", status = "301"] = rule.split(/\s+/);
    assert.ok(!(status === "200" && /\.html(?:[?#]|$)/.test(to)), `HTML rewrite loops with html_handling: ${rule}`);
  }
});

test("payment result pages are still served by the worker rewrites", () => {
  for (const page of ["payment-success", "payment-failed", "payment-pending"]) {
    assert.match(worker, new RegExp(`"/${page}": "/${page}\\.html"`));
  }
});
