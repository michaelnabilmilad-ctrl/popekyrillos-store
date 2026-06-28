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
  const branch = String(env.GITHUB_BRANCH || "main").trim();

  if (!token) {
    throw Object.assign(new Error("GITHUB_TOKEN is not configured."), { statusCode: 500 });
  }

  return { token, owner, repo, branch };
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
    const config = githubConfig(env);

    const result = await githubFetch(config, `/contents/${encodeURIComponent(path).replaceAll("%2F", "/")}`, {
      method: "PUT",
      body: JSON.stringify({
        message: `Upload product image ${filename}`,
        content: imageBase64,
        branch: config.branch
      })
    });

    return jsonResponse(200, {
      ok: true,
      path,
      commitSha: result.commit?.sha || "",
      commitUrl: result.commit?.html_url || "",
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
