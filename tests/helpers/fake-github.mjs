// In-memory fake of the GitHub REST endpoints the Worker uses for the products-data
// branch. Any request it does not recognise is recorded and fails the calling test,
// so admin publishing tests can never reach the real network.
import assert from "node:assert/strict";

export const SITE = "https://popekyrillos.store";
export const BRANCH = "products-data";

const toBase64 = (text) => Buffer.from(text, "utf8").toString("base64");
export const fromBase64 = (b64) => Buffer.from(b64, "base64").toString("utf8");

export function createAdminEnv({ owner = "fake-owner", repo = "fake-repo" } = {}) {
  return {
    ADMIN_USERNAME: "admin-test",
    ADMIN_PASSWORD: "local-test-password",
    GITHUB_TOKEN: "fake-token-for-local-tests",
    GITHUB_OWNER: owner,
    GITHUB_REPO: repo,
    ASSETS: {
      async fetch(request) {
        const { pathname } = new URL(request.url);
        if (pathname === "/thumbnail-manifest-v2.json") return Response.json({});
        return new Response("not found", { status: 404 });
      }
    }
  };
}

export function adminAuthHeader(env) {
  return `Basic ${btoa(`${env.ADMIN_USERNAME}:${env.ADMIN_PASSWORD}`)}`;
}

// Mirrors the requests admin.js sends from its publish buttons.
export function adminJsonPost(env, pathname, body, headers = {}) {
  return new Request(`${SITE}${pathname}`, {
    method: "POST",
    headers: { Authorization: adminAuthHeader(env), Origin: SITE, "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
}

// `fail(method, path)` may return an HTTP status to simulate a GitHub failure.
export function fakeGitHub(env, initialFiles, { fail } = {}) {
  const repo = { commits: new Map(), trees: new Map(), blobs: new Map(), head: "", writes: [], unexpected: [] };
  repo.trees.set("tree-0", new Map(Object.entries(initialFiles).map(([path, text]) => [path, toBase64(text)])));
  repo.commits.set("commit-0", { sha: "commit-0", tree: { sha: "tree-0" } });
  repo.head = "commit-0";
  let counter = 0;
  const next = (kind) => `${kind}-${++counter}`;
  const currentFile = (path) => repo.trees.get(repo.commits.get(repo.head).tree.sha).get(path);
  const base = `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}`;

  async function handler(input, init = {}) {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const method = request.method;
    if (url.hostname !== "api.github.com" || !url.pathname.startsWith(base)) {
      repo.unexpected.push(`${method} ${url.href}`);
      throw new Error(`Unexpected network request in test: ${method} ${url.href}`);
    }
    assert.equal(request.headers.get("Authorization"), `Bearer ${env.GITHUB_TOKEN}`);
    const path = url.pathname.slice(base.length);
    const body = method === "GET" ? null : await request.json();
    const failureStatus = fail?.(method, path);
    if (failureStatus) return Response.json({ message: `simulated GitHub failure ${failureStatus}` }, { status: failureStatus });
    if (method !== "GET") repo.writes.push({ method, path, body });

    if (method === "GET" && path.startsWith("/contents/")) {
      const filePath = decodeURIComponent(path.slice("/contents/".length));
      assert.equal(url.searchParams.get("ref"), BRANCH);
      const content = currentFile(filePath);
      if (!content) return Response.json({ message: "Not Found" }, { status: 404 });
      if ((request.headers.get("Accept") || "").includes("raw")) {
        return new Response(fromBase64(content), { headers: { ETag: `"${repo.head}"` } });
      }
      return Response.json({ content, encoding: "base64", sha: `${repo.head}:${filePath}` });
    }
    if (method === "GET" && path === `/git/ref/heads/${BRANCH}`) return Response.json({ object: { sha: repo.head } });
    if (method === "GET" && path.startsWith("/git/commits/")) {
      const commit = repo.commits.get(path.slice("/git/commits/".length));
      return commit ? Response.json(commit) : Response.json({ message: "Not Found" }, { status: 404 });
    }
    if (method === "POST" && path === "/git/blobs") {
      const sha = next("blob");
      repo.blobs.set(sha, body.content);
      return Response.json({ sha });
    }
    if (method === "POST" && path === "/git/trees") {
      const tree = new Map(repo.trees.get(body.base_tree));
      for (const item of body.tree) tree.set(item.path, repo.blobs.get(item.sha));
      const sha = next("tree");
      repo.trees.set(sha, tree);
      return Response.json({ sha });
    }
    if (method === "POST" && path === "/git/commits") {
      const sha = next("commit");
      repo.commits.set(sha, { sha, tree: { sha: body.tree }, parents: body.parents, message: body.message });
      return Response.json({ sha, html_url: `https://github.com/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/commit/${sha}` });
    }
    if (method === "PATCH" && path === `/git/refs/heads/${BRANCH}`) {
      assert.equal(body.force, false, "admin publishing must never force-push the data branch");
      repo.head = body.sha;
      return Response.json({ object: { sha: body.sha } });
    }
    repo.unexpected.push(`${method} ${url.href}`);
    throw new Error(`Unhandled fake GitHub route: ${method} ${path}`);
  }

  return {
    repo,
    handler,
    file: (path) => currentFile(path),
    text: (path) => fromBase64(currentFile(path)),
    products: () => JSON.parse(fromBase64(currentFile("products.json"))),
    commitCount: () => repo.commits.size - 1
  };
}

export function installFakeGitHub(t, env, initialFiles, options) {
  const github = fakeGitHub(env, initialFiles, options);
  t.mock.method(globalThis, "fetch", github.handler);
  t.after(() => assert.deepEqual(github.repo.unexpected, [], "no request may leave the fake GitHub"));
  return github;
}
