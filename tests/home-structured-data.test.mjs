// Homepage business identity (structured data + Open Graph).
// One Store entity that matches the Google Business Profile «مكتبة البابا كيرلس بولس ملاك»
// (name, mobile, address, geo, hours, map, official social profiles) and one WebSite
// entity, without changing the title, description, canonical or robots of the page.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const head = html.slice(0, html.indexOf("</head>"));

function jsonLdBlocks(source) {
  return [...source.matchAll(/<script\s+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => JSON.parse(match[1]));
}

function graphNodes(blocks) {
  return blocks.flatMap((block) => (Array.isArray(block) ? block : block["@graph"] || [block]));
}

const types = (node) => [].concat(node["@type"] || []);
const isBusiness = (node) => types(node).some((type) => /Store|LocalBusiness|Organization|OnlineBusiness/.test(type));

test("the homepage has exactly one JSON-LD block and it parses", () => {
  const blocks = jsonLdBlocks(head);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]["@context"], "https://schema.org");
});

test("exactly one business entity and one WebSite, linked by @id", () => {
  const nodes = graphNodes(jsonLdBlocks(head));
  const businesses = nodes.filter(isBusiness);
  const sites = nodes.filter((node) => types(node).includes("WebSite"));
  assert.equal(businesses.length, 1, "no duplicate business definition");
  assert.equal(sites.length, 1);
  assert.equal(sites[0].publisher["@id"], businesses[0]["@id"]);
  const ids = nodes.map((node) => node["@id"]);
  assert.equal(new Set(ids).size, ids.length, "unique @id values");
});

test("Store matches the verified Google Business Profile data", () => {
  const store = graphNodes(jsonLdBlocks(head)).find(isBusiness);
  assert.deepEqual(types(store), ["Store", "OnlineStore"]);
  assert.equal(store["@id"], "https://popekyrillos.store/#store");
  assert.equal(store.name, "مكتبة البابا كيرلس بولس ملاك");
  assert.deepEqual(store.alternateName, ["Pope Kyrillos Library", "Pope Kyrillos Store", "مكتبة البابا كيرلس"]);
  assert.equal(store.url, "https://popekyrillos.store/");
  assert.equal(store.telephone, "+201016125589");
  assert.deepEqual(store.address, {
    "@type": "PostalAddress",
    streetAddress: "5 شارع البعثة",
    addressLocality: "روض الفرج",
    addressRegion: "القاهرة",
    addressCountry: "EG"
  });
  assert.deepEqual(store.geo, { "@type": "GeoCoordinates", latitude: 30.0683562, longitude: 31.2442065 });
  assert.equal(store.hasMap, "https://www.google.com/maps?cid=6002321056437834014");
  assert.deepEqual(store.openingHoursSpecification, [{
    "@type": "OpeningHoursSpecification",
    dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    opens: "10:00",
    closes: "22:00"
  }]);
  assert.deepEqual(store.sameAs, [
    "https://www.facebook.com/PapaKirillosBookshop/",
    "https://www.instagram.com/pope.kyrillos.bookshop/",
    "https://www.tiktok.com/@popekyrillosshop"
  ]);
});

test("the landline is not published until it is on the Business Profile", () => {
  assert.doesNotMatch(head, /25745987/);
});

test("logo meets Google's 112px minimum and every URL uses the canonical host", () => {
  const nodes = graphNodes(jsonLdBlocks(head));
  const store = nodes.find(isBusiness);
  assert.ok(store.logo.width >= 112 && store.logo.height >= 112);
  assert.ok(fs.existsSync(new URL("../assets/optimized/logo-papa-kyrillos-320.webp", import.meta.url)));
  const urls = JSON.stringify(nodes).match(/https:\/\/[^"]+/g).filter((url) => /^https:\/\/(www\.)?popekyrillos\.store\b/.test(url));
  assert.ok(urls.length > 0);
  assert.ok(urls.every((url) => url.startsWith("https://popekyrillos.store/")), `no www/http: ${urls.join(" ")}`);
});

test("the return policy that was already live is kept unchanged", () => {
  const policy = graphNodes(jsonLdBlocks(head)).find(isBusiness).hasMerchantReturnPolicy;
  assert.deepEqual(policy, {
    "@type": "MerchantReturnPolicy",
    applicableCountry: "EG",
    returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
    merchantReturnDays: 14,
    returnMethod: "https://schema.org/ReturnByMail",
    returnPolicyCountry: "EG",
    itemDefectReturnFees: "https://schema.org/FreeReturn",
    merchantReturnLink: "https://popekyrillos.store/policies#returns"
  });
});

test("WebSite keeps the current site name and lists the other names", () => {
  const site = graphNodes(jsonLdBlocks(head)).find((node) => types(node).includes("WebSite"));
  assert.equal(site.name, "مكتبة البابا كيرلس");
  assert.deepEqual(site.alternateName, ["مكتبة البابا كيرلس بولس ملاك", "Pope Kyrillos Library", "Pope Kyrillos Store"]);
  assert.equal(site.url, "https://popekyrillos.store/");
  assert.equal(site.inLanguage, "ar");
});

test("title, description, canonical and robots are unchanged; og:site_name and og:locale appear once", () => {
  assert.match(head, /<title>مكتبة البابا كيرلس \| مستلزمات الكنائس<\/title>/);
  assert.match(head, /content="مكتبة البابا كيرلس: مكتبة مسيحية متخصصة في مستلزمات الكنائس، الكتب الطقسية، الشموع، البخور، الأيقونات، والأقمشة الكنسية."/);
  assert.equal((head.match(/<link rel="canonical" href="https:\/\/popekyrillos.store\/" \/>/g) || []).length, 1);
  assert.equal((head.match(/<meta name="robots" content="index, follow" \/>/g) || []).length, 1);
  assert.equal((head.match(/property="og:site_name" content="مكتبة البابا كيرلس"/g) || []).length, 1);
  assert.equal((head.match(/property="og:locale" content="ar_EG"/g) || []).length, 1);
});

// The Worker serves the homepage from this template: the identity must survive the
// server rendering, and pages that build their own head (/products) must not inherit it.
globalThis.caches = { default: { async match() { return null; }, async put() {} } };
const worker = (await import(`../cloudflare-worker.js?home-ld=${Date.now()}`)).default;

function env() {
  return {
    SITE_URL: "https://popekyrillos.store",
    ASSETS: {
      async fetch(request) {
        const { pathname } = new URL(request.url);
        if (pathname === "/" || pathname === "/index.html") return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
        if (pathname === "/thumbnail-manifest-v2.json") return Response.json({});
        return new Response("not found", { status: 404 });
      }
    }
  };
}

function offline(t) {
  t.mock.method(globalThis, "fetch", async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.endsWith("/products.json")) return new Response("[]", { headers: { "Content-Type": "application/json" } });
    return new Response("not found", { status: 404 });
  });
}

test("the rendered homepage keeps one Store and one WebSite and its canonical", async (t) => {
  offline(t);
  const response = await worker.fetch(new Request("https://popekyrillos.store/"), env(), { waitUntil() {} });
  const page = await response.text();
  const renderedHead = page.slice(0, page.indexOf("</head>"));
  const nodes = graphNodes(jsonLdBlocks(renderedHead));
  assert.equal(nodes.filter(isBusiness).length, 1);
  assert.equal(nodes.filter((node) => types(node).includes("WebSite")).length, 1);
  assert.equal((renderedHead.match(/rel="canonical"/g) || []).length, 1);
  assert.match(renderedHead, /<link rel="canonical" href="https:\/\/popekyrillos.store\/" \/>/);
});

test("/products builds its own head without a second business entity", async (t) => {
  offline(t);
  const response = await worker.fetch(new Request("https://popekyrillos.store/products"), env(), { waitUntil() {} });
  const page = await response.text();
  const renderedHead = page.slice(0, page.indexOf("</head>"));
  const nodes = graphNodes(jsonLdBlocks(renderedHead));
  assert.ok(nodes.filter(isBusiness).length <= 1);
  assert.equal((renderedHead.match(/property="og:site_name"/g) || []).length, 1);
  assert.equal((renderedHead.match(/property="og:locale"/g) || []).length, 1);
});
