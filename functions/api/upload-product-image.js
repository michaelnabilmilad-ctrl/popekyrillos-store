function jsonResponse(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function githubConfig(env = {}) {
  const token = String(env.GITHUB_TOKEN || "").trim();
  const owner = String(env.GITHUB_OWNER || "michaelnabilmilad-ctrl").trim();
  const repo = String(env.GITHUB_REPO || "popekyrillos-store").trim();
  const branch = String(env.GITHUB_PRODUCTS_BRANCH || env.GITHUB_DATA_BRANCH || "products-data").trim();
  const sourceBranch = String(env.GITHUB_SOURCE_BRANCH || env.GITHUB_BRANCH || "main").trim();

  if (!token) {
    throw Object.assign(new Error("GITHUB_TOKEN is not configured."), { statusCode: 500 });
  }

  return { token, owner, repo, branch, sourceBranch };
}

async function githubFetch(config, path, options = {}) {
  const response = await fetch(`https://api.github.com/repos/${config.owner}/${config.repo}${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
      "User-Agent": "popekyrillos-store-admin",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(async () => ({ message: await response.text().catch(() => "") }));

  if (!response.ok) {
    throw Object.assign(new Error(data.message || `GitHub API failed with ${response.status}`), {
      statusCode: response.status,
      providerStatus: response.status,
      providerData: data
    });
  }

  return data;
}

async function ensureTargetBranch(config) {
  try {
    return await githubFetch(config, `/git/ref/heads/${encodeURIComponent(config.branch)}`);
  } catch (error) {
    if (error.statusCode !== 404) throw error;
  }

  const sourceRef = await githubFetch(config, `/git/ref/heads/${encodeURIComponent(config.sourceBranch)}`);
  await githubFetch(config, "/git/refs", {
    method: "POST",
    body: JSON.stringify({
      ref: `refs/heads/${config.branch}`,
      sha: sourceRef.object.sha
    })
  });
  return { object: { sha: sourceRef.object.sha } };
}

async function commitFiles(config, message, files) {
  const ref = await ensureTargetBranch(config);
  const baseCommit = await githubFetch(config, `/git/commits/${ref.object.sha}`);
  const treeItems = [];

  for (const file of files) {
    const blob = await githubFetch(config, "/git/blobs", {
      method: "POST",
      body: JSON.stringify({
        content: file.content,
        encoding: "base64"
      })
    });

    treeItems.push({
      path: file.path,
      mode: "100644",
      type: "blob",
      sha: blob.sha
    });
  }

  const tree = await githubFetch(config, "/git/trees", {
    method: "POST",
    body: JSON.stringify({
      base_tree: baseCommit.tree.sha,
      tree: treeItems
    })
  });

  const commit = await githubFetch(config, "/git/commits", {
    method: "POST",
    body: JSON.stringify({
      message,
      tree: tree.sha,
      parents: [ref.object.sha]
    })
  });

  await githubFetch(config, `/git/refs/heads/${encodeURIComponent(config.branch)}`, {
    method: "PATCH",
    body: JSON.stringify({
      sha: commit.sha,
      force: false
    })
  });

  return commit;
}

function safeName(value = "") {
  return String(value)
    .normalize("NFKD")
    .toLowerCase()
    .trim()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 36);
}

function randomHex(bytes = 3) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return [...data].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function decodeBase64Length(base64) {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function validateWebpBase64(base64) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw Object.assign(new Error("Invalid image data."), { statusCode: 400 });
  }

  const size = decodeBase64Length(base64);
  if (size <= 0 || size > 2 * 1024 * 1024) {
    throw Object.assign(new Error("Image must be smaller than 2 MB after WebP conversion."), { statusCode: 400 });
  }

  const header = atob(base64.slice(0, 32));
  if (!header.startsWith("RIFF") || header.slice(8, 12) !== "WEBP") {
    throw Object.assign(new Error("Only WebP uploads are accepted."), { statusCode: 400 });
  }
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") return jsonResponse(204, {});
  if (request.method !== "POST") return jsonResponse(405, { error: "Method not allowed." });

  try {
    const body = await request.json();
    const imageBase64 = String(body.imageBase64 || "").replace(/^data:image\/webp;base64,/, "");
    validateWebpBase64(imageBase64);

    const productId = safeName(body.productId || "product") || "product";
    const sourceName = safeName(body.filename || "image") || "image";
    const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
    const filename = `${productId}-${sourceName}-${timestamp}-${randomHex()}.webp`;
    const path = `assets/optimized/products/gallery/${filename}`;
    const detailPath = path.replace(/^assets\/optimized\/products\//, "assets/detail/products/");
    const distPath = `dist/${path}`;
    const distDetailPath = `dist/${detailPath}`;
    const config = githubConfig(env);

    const result = await commitFiles(config, `Upload product image ${filename}`, [
      { path, content: imageBase64 },
      { path: detailPath, content: imageBase64 },
      { path: distPath, content: imageBase64 },
      { path: distDetailPath, content: imageBase64 }
    ]);

    return jsonResponse(200, {
      ok: true,
      path,
      commitSha: result.sha || "",
      commitUrl: result.html_url || "",
      branch: config.branch,
      size: decodeBase64Length(imageBase64)
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode >= 500) {
      console.error("Upload product image failed", {
        message: error.message,
        providerStatus: error.providerStatus || null,
        providerData: error.providerData || null
      });
    }

    return jsonResponse(statusCode, {
      error: error.message || "Failed to upload image.",
      providerStatus: error.providerStatus || null,
      providerData: error.providerData || null
    });
  }
}
