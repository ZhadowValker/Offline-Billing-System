/**
 * GitHub JSON Sync Layer
 * Uses Git Data API for both reads and writes — no size limits, no CDN cache issues.
 * Reads: ref → commit → tree → blob (by SHA, always fresh, works on private repos)
 * Writes: ref → commit → blobs → tree → commit → ref update (one commit for all files)
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

// ── GIT DATA API READ ─────────────────────────────────────────────────────────
//
// Flow: GET ref → GET commit → GET tree (recursive) → GET blob by SHA
// This bypasses the Contents API 1 MB limit entirely.
// Fetches blobs by exact SHA so there are zero CDN cache issues.
// Works on private repos (PAT auth throughout).

/**
 * Fetch the flat file tree for the latest commit on BRANCH.
 * Returns a map of { filePath → blobSha }.
 */
async function getTreeMap(
  config: GitHubConfig
): Promise<{ commitSha: string; treeMap: Record<string, string> }> {
  const { pat, repo } = config;

  // 1. Latest commit SHA
  const refData = await api(pat, `/repos/${repo}/git/ref/heads/${BRANCH}`);
  const commitSha: string = refData.object.sha;

  // 2. Tree SHA from that commit
  const commitData = await api(pat, `/repos/${repo}/git/commits/${commitSha}`);
  const treeSha: string = commitData.tree.sha;

  // 3. Recursive tree — one request gets all blob SHAs
  const treeData = await api(
    pat,
    `/repos/${repo}/git/trees/${treeSha}?recursive=1`
  );

  const treeMap: Record<string, string> = {};
  for (const item of treeData.tree ?? []) {
    if (item.type === "blob") {
      treeMap[item.path] = item.sha;
    }
  }

  return { commitSha, treeMap };
}

/**
 * Read a single file via Git Data API blobs endpoint.
 * No size limit, no CDN cache (fetched by exact blob SHA).
 */
async function readFileViaBlob(
  config: GitHubConfig,
  filePath: string,
  blobSha: string
): Promise<any> {
  const { pat, repo } = config;
  const blobData = await api(pat, `/repos/${repo}/git/blobs/${blobSha}`);
  // GitHub always returns blobs as base64
  const raw = fromBase64(blobData.content as string);
  return JSON.parse(raw);
}

// ── WRITE: one commit for all files ──────────────────────────────────────────

async function writeFilesInOneCommit(
  config: GitHubConfig,
  files: { path: string; content: any }[],
  message: string,
  baseCommitSha?: string,
  baseTreeSha?: string
): Promise<string> {
  const { pat, repo } = config;

  // Resolve base SHAs if not provided (avoids a redundant ref fetch during pull+push)
  let latestCommitSha = baseCommitSha;
  let currentTreeSha = baseTreeSha;

  if (!latestCommitSha || !currentTreeSha) {
    const refData = await api(pat, `/repos/${repo}/git/ref/heads/${BRANCH}`);
    latestCommitSha = refData.object.sha as string;
    const commitData = await api(pat, `/repos/${repo}/git/commits/${latestCommitSha}`);
    currentTreeSha = commitData.tree.sha as string;
  }

  // Create blobs — minified JSON to keep file sizes lean
  const blobs = await Promise.all(
    files.map(async (f) => {
      const blob = await api(pat, `/repos/${repo}/git/blobs`, {
        method: "POST",
        body: JSON.stringify({
          content: toBase64(JSON.stringify(f.content)), // minified, not pretty-printed
          encoding: "base64",
        }),
      });
      return { path: f.path, sha: blob.sha as string };
    })
  );

  // New tree
  const treeData = await api(pat, `/repos/${repo}/git/trees`, {
    method: "POST",
    body: JSON.stringify({
      base_tree: currentTreeSha,
      tree: blobs.map((b) => ({
        path: b.path,
        mode: "100644",
        type: "blob",
        sha: b.sha,
      })),
    }),
  });

  // New commit
  const newCommit = await api(pat, `/repos/${repo}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message,
      tree: treeData.sha,
      parents: [latestCommitSha],
    }),
  });

  // Advance branch ref
  try {
    await api(pat, `/repos/${repo}/git/refs/heads/${BRANCH}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: newCommit.sha, force: false }),
    });
  } catch (e: any) {
    if (e.message?.includes("not a fast forward")) {
      // Raced by another write — retry with fresh base
      return writeFilesInOneCommit(config, files, message);
    }
    throw e;
  }

  return newCommit.sha as string;
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

export async function pushAllToGitHub(): Promise<{
  success: boolean;
  error?: string;
  summary?: string;
}> {
  try {
    const config = await getConfig();
    if (!config) return { success: false, error: "GitHub not configured" };

    const { db } = await import("./db");
    const [invoices, customers, products] = await Promise.all([
      db.invoices.toArray(),
      db.customers.toArray(),
      db.products.toArray(),
    ]);

    const summary = `${invoices.length} invoices, ${customers.length} customers, ${products.length} products`;

    const newSha = await writeFilesInOneCommit(
      config,
      [
        { path: "data/invoices.json", content: invoices },
        { path: "data/customers.json", content: customers },
        { path: "data/products.json", content: products },
      ],
      `sync: ${summary}`
    );

    // Store SHA so pull-on-open can skip if nothing changed
    const settings = await db.settings.toArray();
    if (settings.length && settings[0].id !== undefined) {
      await db.settings.update(settings[0].id, { lastSyncSha: newSha });
    }

    return { success: true, summary };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ── INVOICE-ONLY SYNC (called on each invoice save) ───────────────────────────

export async function syncInvoicesToGitHub(): Promise<{
  success: boolean;
  error?: string;
}> {
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

// ── PULL ALL (Git Data API — no size limit) ───────────────────────────────────

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

    // One request to get the full tree (commit SHA + all blob SHAs)
    const { treeMap } = await getTreeMap(config);

    // Fetch each file in parallel via their exact blob SHA — no size limit
    const [remoteInvoices, remoteCustomers, remoteProducts] = await Promise.all([
      treeMap["data/invoices.json"]
        ? readFileViaBlob(config, "data/invoices.json", treeMap["data/invoices.json"])
        : Promise.resolve(null),
      treeMap["data/customers.json"]
        ? readFileViaBlob(config, "data/customers.json", treeMap["data/customers.json"])
        : Promise.resolve(null),
      treeMap["data/products.json"]
        ? readFileViaBlob(config, "data/products.json", treeMap["data/products.json"])
        : Promise.resolve(null),
    ]);

    if (remoteInvoices && remoteInvoices.length > 0) {
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
