/**
 * GitHub JSON Sync Layer
 * Stores invoices, customers, products as JSON files in a private GitHub repo
 */

const GITHUB_API = "https://api.github.com";

export interface GitHubConfig {
  pat: string;
  repo: string; // e.g. "ZhadowValker/blessy-billing-data"
}

async function getConfig(): Promise<GitHubConfig | null> {
  const { db } = await import("./db");
  const settings = await db.settings.toArray();
  if (!settings.length) return null;
  const s = settings[0];
  if (!s.githubPat || !s.githubRepo) return null;
  return { pat: s.githubPat, repo: s.githubRepo };
}

function headers(pat: string) {
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

/** Read a JSON file from GitHub. Returns { content, sha } */
async function readFile(
  config: GitHubConfig,
  path: string
): Promise<{ content: any; sha: string } | null> {
  const res = await fetch(
    `${GITHUB_API}/repos/${config.repo}/contents/${path}`,
    { headers: headers(config.pat) }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub read failed: ${res.status}`);
  const data = await res.json();
  const content = JSON.parse(fromBase64(data.content));
  return { content, sha: data.sha };
}

/**
 * Write a JSON file to GitHub.
 * Retries up to 3 times on SHA conflict (409 or "but expected" error)
 * by re-fetching the latest SHA before each attempt.
 */
async function writeFile(
  config: GitHubConfig,
  path: string,
  content: any,
  message?: string
): Promise<any> {
  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    // Always fetch the freshest SHA right before writing
    const latest = await readFile(config, path);
    const sha = latest?.sha; // undefined = file doesn't exist yet

    const body: Record<string, string> = {
      message: message || `sync: update ${path}`,
      content: toBase64(JSON.stringify(content, null, 2)),
    };
    if (sha) body.sha = sha;

    const res = await fetch(
      `${GITHUB_API}/repos/${config.repo}/contents/${path}`,
      {
        method: "PUT",
        headers: headers(config.pat),
        body: JSON.stringify(body),
      }
    );

    if (res.ok) return res.json();

    const errData = await res.json();
    const isConflict =
      res.status === 409 ||
      res.status === 422 ||
      (errData.message && errData.message.includes("but expected"));

    if (isConflict && attempt < MAX_RETRIES) {
      // Back off briefly before retry
      await new Promise((r) => setTimeout(r, 600 * attempt));
      continue;
    }

    throw new Error(`GitHub write failed: ${errData.message}`);
  }
}

// ── INVOICES ──────────────────────────────────────────────────────────────────

export async function syncInvoicesToGitHub(): Promise<{ success: boolean; error?: string }> {
  try {
    const config = await getConfig();
    if (!config) return { success: false, error: "GitHub not configured" };
    const { db } = await import("./db");
    const invoices = await db.invoices.toArray();
    await writeFile(config, "data/invoices.json", invoices, `sync: ${invoices.length} invoices`);
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
    await writeFile(config, "data/customers.json", customers, `sync: ${customers.length} customers`);
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
    await writeFile(config, "data/products.json", products, `sync: ${products.length} products`);
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

export async function pushAllToGitHub() {
  // Push sequentially to avoid parallel SHA conflicts on the same repo
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
    const res = await fetch(`${GITHUB_API}/repos/${repo}`, {
      headers: headers(pat),
    });
    if (res.status === 404) return { success: false, error: "Repo not found. Check repo name." };
    if (res.status === 401) return { success: false, error: "Invalid token. Check your PAT." };
    if (!res.ok) return { success: false, error: `GitHub error: ${res.status}` };
    return { success: true };
  } catch (e: any) {
    return { success: false, error: "Network error. Check internet connection." };
  }
}
