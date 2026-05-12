/**
 * GitHub JSON Sync Layer
 * Uses Git Data API (refs/trees/blobs) instead of Contents API
 * to avoid SHA caching issues entirely.
 */

const API = "https://api.github.com";
const BRANCH = "main";

export interface GitHubConfig {
  pat: string;
  repo: string;
}

async function getConfig(): Promise<GitHubConfig | null> {
  const { db } = await import("./db");
  const settings = await db.settings.toArray();
  if (!settings.length) return null;
  const s = settings[0];
  if (!s.githubPat || !s.githubRepo) return null;
  return { pat: s.githubPat, repo: s.githubRepo };
}

function h(pat: string) {
  return {
    Authorization: `token ${pat}`,
    "Content-Type": "application/json",
    Accept: "application/vnd.github.v3+json",
  };
}

function toBase64(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}

function fromBase64(str: string): string {
  return decodeURIComponent(escape(atob(str.replace(/\n/g, ""))));
}

async function api(pat: string, path: string, options?: RequestInit) {
  const res = await fetch(`${API}${path}`, { ...options, headers: h(pat) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Write a JSON file using the Git Data API (low-level trees + commits).
 * This completely avoids the Contents API SHA caching problem.
 *
 * Flow:
 * 1. Get the current commit SHA of main branch
 * 2. Get the tree SHA from that commit
 * 3. Create a new blob with our content
 * 4. Create a new tree with the blob replacing the target file
 * 5. Create a new commit pointing to the new tree
 * 6. Update the main branch ref to the new commit
 */
async function writeFileViaGitApi(
  config: GitHubConfig,
  path: string,
  content: any,
  message?: string
): Promise<void> {
  const { pat, repo } = config;
  const json = JSON.stringify(content, null, 2);

  // 1. Get latest commit SHA on main
  const refData = await api(pat, `/repos/${repo}/git/ref/heads/${BRANCH}`);
  const latestCommitSha: string = refData.object.sha;

  // 2. Get the tree SHA from that commit
  const commitData = await api(pat, `/repos/${repo}/git/commits/${latestCommitSha}`);
  const baseTreeSha: string = commitData.tree.sha;

  // 3. Create a new blob with the file content
  const blobData = await api(pat, `/repos/${repo}/git/blobs`, {
    method: "POST",
    body: JSON.stringify({ content: toBase64(json), encoding: "base64" }),
  });
  const blobSha: string = blobData.sha;

  // 4. Create a new tree with our file updated
  const treeData = await api(pat, `/repos/${repo}/git/trees`, {
    method: "POST",
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: [{ path, mode: "100644", type: "blob", sha: blobSha }],
    }),
  });
  const newTreeSha: string = treeData.sha;

  // 5. Create a new commit
  const newCommit = await api(pat, `/repos/${repo}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message: message || `sync: update ${path}`,
      tree: newTreeSha,
      parents: [latestCommitSha],
    }),
  });
  const newCommitSha: string = newCommit.sha;

  // 6. Update the branch ref (force: false — if another commit raced us, this fails cleanly)
  try {
    await api(pat, `/repos/${repo}/git/refs/heads/${BRANCH}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: newCommitSha, force: false }),
    });
  } catch (e: any) {
    // If ref update fails, it means another write happened concurrently — retry once
    if (e.message?.includes("Update is not a fast forward")) {
      // Retry the entire write with the new base
      return writeFileViaGitApi(config, path, content, message);
    }
    throw e;
  }
}

/** Read a JSON file using the Contents API (reads are fine, only writes have caching issues) */
async function readFile(
  config: GitHubConfig,
  path: string
): Promise<{ content: any } | null> {
  const res = await fetch(
    `${API}/repos/${config.repo}/contents/${path}?ref=${BRANCH}`,
    { headers: h(config.pat) }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub read failed: ${res.status}`);
  const data = await res.json();
  const content = JSON.parse(fromBase64(data.content));
  return { content };
}

// ── INVOICES ──────────────────────────────────────────────────────────────────

export async function syncInvoicesToGitHub(): Promise<{ success: boolean; error?: string }> {
  try {
    const config = await getConfig();
    if (!config) return { success: false, error: "GitHub not configured" };
    const { db } = await import("./db");
    const invoices = await db.invoices.toArray();
    await writeFileViaGitApi(config, "data/invoices.json", invoices, `sync: ${invoices.length} invoices`);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function syncInvoicesFromGitHub(): Promise<{ success: boolean; count?: number; error?: string }> {
  try {
    const config = await getConfig();
    if (!config) return { success: false, error: "GitHub not configured" };
    const file = await readFile(config, "data/invoices.json");
    if (!file) return { success: true, count: 0 };
    const { db } = await import("./db");
    await db.invoices.clear();
    for (const inv of file.content) {
      await db.invoices.add({
        ...inv,
        invoiceDate: new Date(inv.invoiceDate),
        createdAt: new Date(inv.createdAt),
        updatedAt: new Date(inv.updatedAt),
      });
    }
    return { success: true, count: file.content.length };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ── CUSTOMERS ─────────────────────────────────────────────────────────────────

export async function syncCustomersToGitHub(): Promise<{ success: boolean; error?: string }> {
  try {
    const config = await getConfig();
    if (!config) return { success: false, error: "GitHub not configured" };
    const { db } = await import("./db");
    const customers = await db.customers.toArray();
    await writeFileViaGitApi(config, "data/customers.json", customers, `sync: ${customers.length} customers`);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function syncCustomersFromGitHub(): Promise<{ success: boolean; count?: number; error?: string }> {
  try {
    const config = await getConfig();
    if (!config) return { success: false, error: "GitHub not configured" };
    const file = await readFile(config, "data/customers.json");
    if (!file) return { success: true, count: 0 };
    const { db } = await import("./db");
    await db.customers.clear();
    for (const c of file.content) {
      await db.customers.add({ ...c, createdAt: new Date(c.createdAt) });
    }
    return { success: true, count: file.content.length };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ── PRODUCTS ──────────────────────────────────────────────────────────────────

export async function syncProductsToGitHub(): Promise<{ success: boolean; error?: string }> {
  try {
    const config = await getConfig();
    if (!config) return { success: false, error: "GitHub not configured" };
    const { db } = await import("./db");
    const products = await db.products.toArray();
    await writeFileViaGitApi(config, "data/products.json", products, `sync: ${products.length} products`);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function syncProductsFromGitHub(): Promise<{ success: boolean; count?: number; error?: string }> {
  try {
    const config = await getConfig();
    if (!config) return { success: false, error: "GitHub not configured" };
    const file = await readFile(config, "data/products.json");
    if (!file) return { success: true, count: 0 };
    const { db } = await import("./db");
    await db.products.clear();
    for (const p of file.content) {
      await db.products.add({ ...p, createdAt: new Date(p.createdAt) });
    }
    return { success: true, count: file.content.length };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ── FULL SYNC ─────────────────────────────────────────────────────────────────

export async function pullAllFromGitHub() {
  const [invoices, customers, products] = await Promise.all([
    syncInvoicesFromGitHub(),
    syncCustomersFromGitHub(),
    syncProductsFromGitHub(),
  ]);
  return { invoices, customers, products };
}

/** Push sequentially — each write creates a new commit on top of the previous */
export async function pushAllToGitHub() {
  const invoices = await syncInvoicesToGitHub();
  const customers = await syncCustomersToGitHub();
  const products = await syncProductsToGitHub();
  return { invoices, customers, products };
}

export async function verifyGitHubConfig(
  pat: string,
  repo: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${API}/repos/${repo}`, { headers: h(pat) });
    if (res.status === 404) return { success: false, error: "Repo not found. Check repo name." };
    if (res.status === 401) return { success: false, error: "Invalid token. Check your PAT." };
    if (!res.ok) return { success: false, error: `GitHub error: ${res.status}` };
    return { success: true };
  } catch (e: any) {
    return { success: false, error: "Network error. Check internet connection." };
  }
}
