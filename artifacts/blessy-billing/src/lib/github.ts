/**
 * GitHub JSON Sync Layer
 * Uses Git Data API — one commit per sync covering all changed files.
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
 * Write multiple files in a single commit using Git Data API.
 * No SHA conflicts — works purely with commit/tree SHAs.
 */
async function writeFilesInOneCommit(
  config: GitHubConfig,
  files: { path: string; content: any }[],
  message: string
): Promise<void> {
  const { pat, repo } = config;

  // 1. Get latest commit SHA on main
  const refData = await api(pat, `/repos/${repo}/git/ref/heads/${BRANCH}`);
  const latestCommitSha: string = refData.object.sha;

  // 2. Get the base tree SHA
  const commitData = await api(pat, `/repos/${repo}/git/commits/${latestCommitSha}`);
  const baseTreeSha: string = commitData.tree.sha;

  // 3. Create blobs for all files in parallel
  const blobs = await Promise.all(
    files.map(async (f) => {
      const blob = await api(pat, `/repos/${repo}/git/blobs`, {
        method: "POST",
        body: JSON.stringify({
          content: toBase64(JSON.stringify(f.content, null, 2)),
          encoding: "base64",
        }),
      });
      return { path: f.path, sha: blob.sha as string };
    })
  );

  // 4. Create one new tree with all files updated
  const treeData = await api(pat, `/repos/${repo}/git/trees`, {
    method: "POST",
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: blobs.map((b) => ({
        path: b.path,
        mode: "100644",
        type: "blob",
        sha: b.sha,
      })),
    }),
  });

  // 5. Create a single new commit
  const newCommit = await api(pat, `/repos/${repo}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message,
      tree: treeData.sha,
      parents: [latestCommitSha],
    }),
  });

  // 6. Advance the branch ref
  try {
    await api(pat, `/repos/${repo}/git/refs/heads/${BRANCH}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: newCommit.sha, force: false }),
    });
  } catch (e: any) {
    // Another write raced us — retry once with fresh base
    if (e.message?.includes("not a fast forward")) {
      return writeFilesInOneCommit(config, files, message);
    }
    throw e;
  }
}

/** Read a JSON file from GitHub */
async function readFile(
  config: GitHubConfig,
  path: string
): Promise<any | null> {
  const res = await fetch(
    `${API}/repos/${config.repo}/contents/${path}?ref=${BRANCH}`,
    { headers: h(config.pat) }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub read failed: ${res.status}`);
  const data = await res.json();
  return JSON.parse(fromBase64(data.content));
}

// ── GET LATEST COMMIT SHA ─────────────────────────────────────────────────────

export async function getLatestSha(pat: string, repo: string): Promise<string | null> {
  try {
    const refData = await api(pat, `/repos/${repo}/git/ref/heads/${BRANCH}`);
    return refData.object.sha as string;
  } catch {
    return null;
  }
}

// ── PUSH ALL (one commit) ─────────────────────────────────────────────────────

export async function pushAllToGitHub(): Promise<{ success: boolean; error?: string; summary?: string }> {
  try {
    const config = await getConfig();
    if (!config) return { success: false, error: "GitHub not configured" };

    const { db } = await import("./db");
    const [invoices, customers, products] = await Promise.all([
      db.invoices.toArray(),
      db.customers.toArray(),
      db.products.toArray(),
    ]);

    const files = [
      { path: "data/invoices.json", content: invoices },
      { path: "data/customers.json", content: customers },
      { path: "data/products.json", content: products },
    ];

    const summary = `${invoices.length} invoices, ${customers.length} customers, ${products.length} products`;
    await writeFilesInOneCommit(config, files, `sync: ${summary}`);

    // Store the new SHA so pull-on-open skips if unchanged
    const newSha = await getLatestSha(config.pat, config.repo);
    if (newSha) {
      const settings = await db.settings.toArray();
      if (settings.length && settings[0].id !== undefined) {
        await db.settings.update(settings[0].id, { lastSyncSha: newSha });
      }
    }

    return { success: true, summary };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ── INVOICE-ONLY SYNC (called on each invoice save) ───────────────────────────

export async function syncInvoicesToGitHub(): Promise<{ success: boolean; error?: string }> {
  try {
    const config = await getConfig();
    if (!config) return { success: false, error: "GitHub not configured" };

    const { db } = await import("./db");
    const invoices = await db.invoices.toArray();

    await writeFilesInOneCommit(
      config,
      [{ path: "data/invoices.json", content: invoices }],
      `sync: ${invoices.length} invoice${invoices.length !== 1 ? "s" : ""}`
    );

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ── PULL ALL ──────────────────────────────────────────────────────────────────

export async function pullAllFromGitHub(): Promise<{
  success: boolean;
  error?: string;
  invoices?: number;
  customers?: number;
  products?: number;
}> {
  try {
    const config = await getConfig();
    if (!config) return { success: false, error: "GitHub not configured" };

    const { db } = await import("./db");

    const [remoteInvoices, remoteCustomers, remoteProducts] = await Promise.all([
      readFile(config, "data/invoices.json"),
      readFile(config, "data/customers.json"),
      readFile(config, "data/products.json"),
    ]);

    if (remoteInvoices) {
      await db.invoices.clear();
      for (const inv of remoteInvoices) {
        await db.invoices.add({
          ...inv,
          billType: inv.billType || "gst",
          paymentStatus: inv.paymentStatus || "unpaid",
          paidAmount: inv.paidAmount || 0,
          payments: inv.payments || [],
          invoiceDate: new Date(inv.invoiceDate),
          createdAt: new Date(inv.createdAt),
          updatedAt: new Date(inv.updatedAt),
        });
      }
    }

    if (remoteCustomers && remoteCustomers.length > 0) {
      await db.customers.clear();
      for (const c of remoteCustomers) {
        await db.customers.add({ ...c, createdAt: new Date(c.createdAt) });
      }
    } else if (remoteInvoices && remoteInvoices.length > 0) {
      // Auto-seed customers from invoice buyer data
      await db.customers.clear();
      const seen = new Set<string>();
      for (const inv of remoteInvoices) {
        const key = inv.buyer.name.trim().toUpperCase();
        if (!seen.has(key)) {
          seen.add(key);
          await db.customers.add({
            name: inv.buyer.name,
            address: inv.buyer.address || "",
            gstNumber: inv.buyer.gstNumber || "",
            state: inv.buyer.state || "",
            stateCode: inv.buyer.stateCode || "",
            contact: inv.buyer.contact || "",
            email: inv.buyer.email || "",
            createdAt: new Date(inv.createdAt),
          });
        }
      }
    }

    if (remoteProducts && remoteProducts.length > 0) {
      await db.products.clear();
      for (const p of remoteProducts) {
        await db.products.add({ ...p, createdAt: new Date(p.createdAt) });
      }
    } else if (remoteInvoices && remoteInvoices.length > 0) {
      // Auto-seed products from invoice items
      await db.products.clear();
      const seen = new Set<string>();
      for (const inv of remoteInvoices) {
        for (const item of inv.items || []) {
          const key = item.productName.trim().toUpperCase();
          if (!seen.has(key)) {
            seen.add(key);
            await db.products.add({
              name: item.productName,
              category: "Woven Sack",
              size: item.description || "",
              hsnCode: item.hsnCode || "",
              defaultRate: item.rate || 0,
              gstPercent: item.gstPercent || 18,
              unit: item.unit || "NOS",
              createdAt: new Date(inv.createdAt),
            });
          }
        }
      }
    }

    return {
      success: true,
      invoices: remoteInvoices?.length ?? 0,
      customers: remoteCustomers?.length ?? 0,
      products: remoteProducts?.length ?? 0,
    };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ── VERIFY ────────────────────────────────────────────────────────────────────

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

// Keep these exports for backward compatibility
export async function syncCustomersToGitHub() { return pushAllToGitHub(); }
export async function syncProductsToGitHub() { return pushAllToGitHub(); }
export async function syncInvoicesFromGitHub() { return pullAllFromGitHub(); }
export async function syncCustomersFromGitHub() { return pullAllFromGitHub(); }
export async function syncProductsFromGitHub() { return pullAllFromGitHub(); }
