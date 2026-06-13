/**
 * Pull-on-open sync logic.
 * Compares latest GitHub commit SHA with the last known SHA in settings.
 * Only pulls if the remote has changed — avoids unnecessary API calls.
 */

import { db, getSettings } from "./db";
import { getLatestSha, pullAllFromGitHub } from "./github";

export type SyncStatus = "idle" | "checking" | "pulling" | "done" | "offline" | "error" | "unconfigured";

export interface SyncResult {
  status: SyncStatus;
  message: string;
  pulled?: boolean;
}

export async function syncOnOpen(
  onStatusChange: (s: SyncStatus) => void
): Promise<SyncResult> {
  onStatusChange("checking");

  const settings = await getSettings();

  if (!settings.githubPat || !settings.githubRepo) {
    onStatusChange("unconfigured");
    return { status: "unconfigured", message: "GitHub not configured" };
  }

  try {
    // Get latest commit SHA from GitHub
    const remoteSha = await getLatestSha(settings.githubPat, settings.githubRepo);

    if (!remoteSha) {
      onStatusChange("error");
      return { status: "error", message: "Could not read remote SHA" };
    }

    // If SHA matches what we last pulled, we're already up to date
    if (settings.lastSyncSha && settings.lastSyncSha === remoteSha) {
      onStatusChange("done");
      return { status: "done", message: "Already up to date", pulled: false };
    }

    // SHA differs — pull latest data
    onStatusChange("pulling");
    const result = await pullAllFromGitHub();

    if (!result.success) {
      onStatusChange("error");
      return { status: "error", message: result.error || "Pull failed" };
    }

    // Store the new SHA so next open skips if unchanged
    if (settings.id !== undefined) {
      await db.settings.update(settings.id, { lastSyncSha: remoteSha });
    }

    onStatusChange("done");
    return {
      status: "done",
      message: `Synced: ${result.invoices} invoices, ${result.customers} customers, ${result.products} products`,
      pulled: true,
    };
  } catch (e: any) {
    // Network error → offline mode, use local data
    if (e.message?.includes("fetch") || e.message?.includes("network") || e.message?.includes("Failed to fetch")) {
      onStatusChange("offline");
      return { status: "offline", message: "Offline — using local data" };
    }
    onStatusChange("error");
    return { status: "error", message: e.message || "Sync error" };
  }
}
