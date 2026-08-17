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

function validateCategories(categories) {
  if (!Array.isArray(categories) || !categories.length) {
    throw Object.assign(new Error("categories must be a non-empty array."), { statusCode: 400 });
  }

  const categoryIdCounts = new Map();
  const subcategoryIdCounts = new Map();
  for (const category of categories) {
    const categoryId = String(category?.id || "").trim();
    if (categoryId) categoryIdCounts.set(categoryId, (categoryIdCounts.get(categoryId) || 0) + 1);
    for (const subcategory of Array.isArray(category?.subcategories) ? category.subcategories : []) {
      const subcategoryId = String(subcategory?.id || "").trim();
      if (subcategoryId) subcategoryIdCounts.set(subcategoryId, (subcategoryIdCounts.get(subcategoryId) || 0) + 1);
    }
  }
  const duplicateIds = [
    ...[...categoryIdCounts].filter(([, count]) => count > 1).map(([id]) => `main:${id}`),
    ...[...subcategoryIdCounts].filter(([, count]) => count > 1).map(([id]) => `sub:${id}`)
  ];
  if (duplicateIds.length) {
    throw Object.assign(new Error(`Duplicate taxonomy IDs (${duplicateIds.length}): ${duplicateIds.join(", ")}.`), { statusCode: 400 });
  }

  for (const [categoryIndex, category] of categories.entries()) {
    if (!category || typeof category !== "object" || Array.isArray(category)) {
      throw Object.assign(new Error(`Invalid category at index ${categoryIndex}.`), { statusCode: 400 });
    }

    if (!category.id || !category.name || !Array.isArray(category.subcategories)) {
      throw Object.assign(new Error(`Category at index ${categoryIndex} must include id, name, and subcategories.`), { statusCode: 400 });
    }

    for (const [subcategoryIndex, subcategory] of category.subcategories.entries()) {
      if (!subcategory || typeof subcategory !== "object" || Array.isArray(subcategory)) {
        throw Object.assign(new Error(`Invalid subcategory at index ${categoryIndex}.${subcategoryIndex}.`), { statusCode: 400 });
      }

      if (!subcategory.id || !subcategory.name) {
        throw Object.assign(new Error(`Subcategory at index ${categoryIndex}.${subcategoryIndex} must include id and name.`), { statusCode: 400 });
      }
    }
  }
}

function validateTaxonomySource(source) {
  if (!source || typeof source !== "string") {
    throw Object.assign(new Error("taxonomySource must be a string."), { statusCode: 400 });
  }

  if (!source.includes("window.POPE_KYRILLOS_TAXONOMY") || !source.includes("const categories =")) {
    throw Object.assign(new Error("taxonomySource does not look like category-taxonomy.js."), { statusCode: 400 });
  }
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") return jsonResponse(204, {});
  if (request.method !== "POST") return jsonResponse(405, { error: "Method not allowed." });

  try {
    const body = await request.json();
    validateCategories(body.categories);
    validateTaxonomySource(body.taxonomySource);

    const config = githubConfig(env);
    const encodedContent = utf8ToBase64(`${body.taxonomySource.trim()}\n`);
    const message = String(body.message || `Update category taxonomy from admin ${new Date().toISOString()}`).slice(0, 180);

    const result = await commitFiles(config, message, [
      { path: "category-taxonomy.js", content: encodedContent },
      { path: "dist/category-taxonomy.js", content: encodedContent },
      { path: "dist/admin/category-taxonomy.js", content: encodedContent }
    ]);

    return jsonResponse(200, {
      ok: true,
      commitSha: result.sha || "",
      commitUrl: result.html_url || "",
      path: "category-taxonomy.js",
      branch: config.branch,
      message: "category-taxonomy.js was committed to GitHub."
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode >= 500) {
      console.error("Update taxonomy failed", {
        message: error.message,
        providerStatus: error.providerStatus || null,
        providerData: error.providerData || null
      });
    }

    return jsonResponse(statusCode, {
      error: error.message || "Failed to update category-taxonomy.js.",
      providerStatus: error.providerStatus || null,
      providerData: error.providerData || null
    });
  }
}
