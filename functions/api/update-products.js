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

function utf8ToBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";

  for (let index = 0; index < bytes.length; index += 0x8000) {
    const chunk = bytes.slice(index, index + 0x8000);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function base64ToUtf8(value) {
  const binary = atob(String(value || "").replace(/\s+/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
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

function validateProducts(products) {
  if (!Array.isArray(products)) {
    throw Object.assign(new Error("products must be an array."), { statusCode: 400 });
  }

  const ids = new Set();
  for (const [index, product] of products.entries()) {
    if (!product || typeof product !== "object" || Array.isArray(product)) {
      throw Object.assign(new Error(`Invalid product at index ${index}.`), { statusCode: 400 });
    }

    if (!product.id || !product.name) {
      throw Object.assign(new Error(`Product at index ${index} must include id and name.`), { statusCode: 400 });
    }

    const id = String(product.id);
    if (ids.has(id)) {
      throw Object.assign(new Error(`Duplicate product id: ${id}.`), { statusCode: 400 });
    }
    ids.add(id);
  }
}

async function loadCanonicalProducts(config) {
  const file = await githubFetch(
    config,
    `/contents/products.json?ref=${encodeURIComponent(config.branch)}`
  );
  const products = JSON.parse(base64ToUtf8(file.content));
  validateProducts(products);
  return products;
}

function mergeCatalog(currentProducts, incomingProducts, deletedProductIds = []) {
  const deletedIds = new Set(deletedProductIds.map(String));
  const incomingById = new Map(incomingProducts.map((product) => [String(product.id), product]));
  const currentIds = new Set(currentProducts.map((product) => String(product.id)));
  const undeclaredMissing = currentProducts
    .filter((product) => !incomingById.has(String(product.id)) && !deletedIds.has(String(product.id)))
    .map((product) => String(product.id));

  if (undeclaredMissing.length) {
    throw Object.assign(
      new Error(`Catalog safety check rejected the save: ${undeclaredMissing.length} existing product(s) were omitted without an explicit delete.`),
      { statusCode: 409, omittedProductIds: undeclaredMissing }
    );
  }

  const merged = currentProducts
    .filter((product) => !deletedIds.has(String(product.id)))
    .map((product) => incomingById.get(String(product.id)) || product);

  for (const product of incomingProducts) {
    if (!currentIds.has(String(product.id))) merged.push(product);
  }

  return merged;
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") return jsonResponse(204, {});
  if (request.method !== "POST") return jsonResponse(405, { error: "Method not allowed." });

  try {
    const body = await request.json();
    const incomingProducts = body.products;
    validateProducts(incomingProducts);

    const config = githubConfig(env);
    const currentProducts = await loadCanonicalProducts(config);
    const explicitReplacement = body.operation === "full-replacement" && body.confirm === "REPLACE_FULL_CATALOG";
    const products = explicitReplacement
      ? incomingProducts
      : mergeCatalog(currentProducts, incomingProducts, Array.isArray(body.deletedProductIds) ? body.deletedProductIds : []);
    const content = `${JSON.stringify(products, null, 2)}\n`;
    const encodedContent = utf8ToBase64(content);
    const message = String(body.message || `Update products from admin ${new Date().toISOString()}`).slice(0, 180);

    const result = await commitFiles(config, message, [
      { path: "products.json", content: encodedContent },
      { path: "dist/products.json", content: encodedContent }
    ]);

    return jsonResponse(200, {
      ok: true,
      commitSha: result.sha || "",
      commitUrl: result.html_url || "",
      path: "products.json",
      branch: config.branch,
      products,
      previousCount: currentProducts.length,
      savedCount: products.length,
      message: "products.json was committed to GitHub."
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode >= 500) {
      console.error("Update products failed", {
        message: error.message,
        providerStatus: error.providerStatus || null,
        providerData: error.providerData || null
      });
    }

    return jsonResponse(statusCode, {
      error: error.message || "Failed to update products.json.",
      omittedProductIds: error.omittedProductIds || [],
      providerStatus: error.providerStatus || null,
      providerData: error.providerData || null
    });
  }
}
