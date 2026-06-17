/**
 * InvoiceDiff — GitHub-style field-level diff viewer
 * Supports unified and split view, section collapsing, summary badge.
 */

import { useState } from "react";
import { type Invoice } from "@/lib/db";
import {
  computeDiff,
  versionLabel,
  type DiffLine,
  type DiffSection,
  type DiffStatus,
} from "@/lib/diff";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronRight,
  GitCompare,
  Plus,
  Minus,
  Equal,
  ArrowLeftRight,
  AlignLeft,
  Check,
  X,
} from "lucide-react";

// ── Colour tokens per diff status ─────────────────────────────────────────────

const STATUS_TOKENS: Record<
  DiffStatus,
  { row: string; badge: string; sign: string; signBg: string }
> = {
  added:     { row: "bg-emerald-50 hover:bg-emerald-100",  badge: "bg-emerald-100 text-emerald-700", sign: "+", signBg: "bg-emerald-200 text-emerald-800" },
  removed:   { row: "bg-red-50    hover:bg-red-100",       badge: "bg-red-100    text-red-700",      sign: "−", signBg: "bg-red-200    text-red-800"      },
  changed:   { row: "bg-amber-50  hover:bg-amber-100",     badge: "bg-amber-100  text-amber-700",    sign: "~", signBg: "bg-amber-200  text-amber-800"    },
  unchanged: { row: "bg-white     hover:bg-slate-50",      badge: "bg-slate-100  text-slate-500",    sign: " ", signBg: "bg-slate-100  text-slate-400"    },
};

// ── Summary bar ───────────────────────────────────────────────────────────────

function SummaryBar({
  summary,
}: {
  summary: { added: number; removed: number; changed: number; total: number };
}) {
  if (summary.total === 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">
        <Check className="h-4 w-4" />
        <span className="font-medium">No differences found</span>
        <span className="text-emerald-500 text-xs">— these versions are identical</span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm">
      <div className="flex items-center gap-1.5 font-medium text-slate-700">
        <GitCompare className="h-4 w-4" />
        <span>{summary.total} field{summary.total !== 1 ? "s" : ""} changed</span>
      </div>
      <div className="flex gap-1.5 ml-auto flex-wrap">
        {summary.added > 0 && (
          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
            <Plus className="h-3 w-3" />{summary.added} added
          </span>
        )}
        {summary.removed > 0 && (
          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
            <Minus className="h-3 w-3" />{summary.removed} removed
          </span>
        )}
        {summary.changed > 0 && (
          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
            ~{summary.changed} modified
          </span>
        )}
      </div>
    </div>
  );
}

// ── Single diff row — unified view ────────────────────────────────────────────

function UnifiedRow({ line }: { line: DiffLine }) {
  const t = STATUS_TOKENS[line.status];
  const isUnchanged = line.status === "unchanged";

  return (
    <tr className={cn("border-b border-slate-100 text-xs", t.row)}>
      {/* sign */}
      <td className={cn("w-6 text-center font-mono font-bold py-2 px-1 select-none", t.signBg)}>
        {t.sign}
      </td>
      {/* label */}
      <td className="py-2 px-3 text-slate-500 font-medium whitespace-nowrap w-48 align-top">
        {line.label}
      </td>
      {/* old value */}
      <td className={cn(
        "py-2 px-3 font-mono align-top",
        !isUnchanged && line.status !== "added" ? "line-through text-red-600 bg-red-50" : "text-slate-400"
      )}>
        {line.oldValue}
      </td>
      {/* arrow */}
      {!isUnchanged && (
        <td className="py-2 px-1 text-slate-300 text-center align-top">→</td>
      )}
      {isUnchanged && <td />}
      {/* new value */}
      <td className={cn(
        "py-2 px-3 font-mono align-top",
        !isUnchanged && line.status !== "removed" ? "font-semibold text-emerald-700 bg-emerald-50" : "text-slate-400"
      )}>
        {line.newValue}
      </td>
    </tr>
  );
}

// ── Single diff row — split view ──────────────────────────────────────────────

function SplitRow({ line }: { line: DiffLine }) {
  const t = STATUS_TOKENS[line.status];
  const isUnchanged = line.status === "unchanged";

  return (
    <tr className={cn("border-b border-slate-100 text-xs", isUnchanged ? "bg-white hover:bg-slate-50" : "")}>
      {/* label */}
      <td className="py-2 px-3 text-slate-500 font-medium whitespace-nowrap w-40 align-top border-r border-slate-100">
        {line.label}
      </td>
      {/* old value */}
      <td className={cn(
        "py-2 px-3 font-mono align-top border-r border-slate-100 w-[40%]",
        line.status === "removed" ? "bg-red-50 text-red-700 line-through" :
        line.status === "changed" ? "bg-red-50 text-red-600 line-through" :
        "text-slate-500"
      )}>
        {!isUnchanged && line.status !== "added" && (
          <span className="inline-block w-4 text-center font-bold mr-1 text-red-500">−</span>
        )}
        {line.oldValue}
      </td>
      {/* new value */}
      <td className={cn(
        "py-2 px-3 font-mono align-top w-[40%]",
        line.status === "added"   ? "bg-emerald-50 text-emerald-700" :
        line.status === "changed" ? "bg-emerald-50 text-emerald-700 font-semibold" :
        "text-slate-500"
      )}>
        {!isUnchanged && line.status !== "removed" && (
          <span className="inline-block w-4 text-center font-bold mr-1 text-emerald-600">+</span>
        )}
        {line.newValue}
      </td>
    </tr>
  );
}

// ── Section block ─────────────────────────────────────────────────────────────

function SectionBlock({
  section,
  viewMode,
  showUnchanged,
}: {
  section: DiffSection;
  viewMode: "unified" | "split";
  showUnchanged: boolean;
}) {
  const [collapsed, setCollapsed] = useState(!section.hasChanges);

  const visibleLines = showUnchanged
    ? section.lines
    : section.lines.filter(l => l.status !== "unchanged");

  const changedCount = section.lines.filter(l => l.status !== "unchanged").length;

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      {/* Section header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className={cn(
          "w-full flex items-center gap-2 px-4 py-3 text-sm font-semibold text-left transition-colors",
          section.hasChanges
            ? "bg-amber-50 hover:bg-amber-100 text-amber-800"
            : "bg-slate-50 hover:bg-slate-100 text-slate-600"
        )}
      >
        {collapsed
          ? <ChevronRight className="h-4 w-4 shrink-0" />
          : <ChevronDown  className="h-4 w-4 shrink-0" />
        }
        <span className="text-base mr-1">{section.icon}</span>
        <span>{section.title}</span>
        {changedCount > 0 && (
          <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-amber-200 text-amber-800 font-bold">
            {changedCount}
          </span>
        )}
        {!section.hasChanges && (
          <span className="ml-auto text-xs text-slate-400 font-normal">no changes</span>
        )}
      </button>

      {/* Section rows */}
      {!collapsed && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <colgroup>
              {viewMode === "unified" && <col className="w-6" />}
              <col className="w-40" />
              <col />
              {viewMode === "unified" && <col className="w-4" />}
              <col />
            </colgroup>
            <thead>
              <tr className="bg-slate-100 text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                {viewMode === "unified" && <th className="py-1.5 px-1 text-center">±</th>}
                <th className="py-1.5 px-3 text-left">Field</th>
                {viewMode === "unified" ? (
                  <>
                    <th className="py-1.5 px-3 text-left">Old Value</th>
                    <th />
                    <th className="py-1.5 px-3 text-left">New Value</th>
                  </>
                ) : (
                  <>
                    <th className="py-1.5 px-3 text-left border-r border-slate-200">Before</th>
                    <th className="py-1.5 px-3 text-left">After</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {visibleLines.length === 0 ? (
                <tr>
                  <td
                    colSpan={viewMode === "unified" ? 5 : 3}
                    className="py-4 text-center text-xs text-slate-400 italic"
                  >
                    {showUnchanged ? "No fields in this section" : "All fields unchanged — toggle to show"}
                  </td>
                </tr>
              ) : (
                visibleLines.map((line) =>
                  viewMode === "unified"
                    ? <UnifiedRow key={line.key} line={line} />
                    : <SplitRow   key={line.key} line={line} />
                )
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface InvoiceDiffProps {
  invoice: Invoice;
  leftIndex: number | null;   // null = current
  rightIndex: number | null;  // null = current
  onClose: () => void;
}

export default function InvoiceDiff({
  invoice,
  leftIndex,
  rightIndex,
  onClose,
}: InvoiceDiffProps) {
  const [viewMode, setViewMode]       = useState<"unified" | "split">("unified");
  const [showUnchanged, setShowUnchanged] = useState(false);

  // Derive the two snapshots to compare
  const getSnapshot = (idx: number | null): Invoice => {
    if (idx === null) return invoice;
    return invoice.versions[idx]?.snapshot as Invoice ?? invoice;
  };

  const leftSnap  = getSnapshot(leftIndex);
  const rightSnap = getSnapshot(rightIndex);
  const diff      = computeDiff(leftSnap, rightSnap);

  const leftLabel  = versionLabel(invoice, leftIndex);
  const rightLabel = versionLabel(invoice, rightIndex);

  return (
    <div className="space-y-4">

      {/* ── Diff header ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-slate-700">
          <GitCompare className="h-5 w-5 text-blue-600" />
          <h2 className="text-lg font-bold">Compare Versions</h2>
        </div>
        <div className="flex items-center gap-2 text-sm bg-slate-100 px-3 py-1.5 rounded-lg font-mono">
          <span className="text-red-600 font-semibold">{leftLabel}</span>
          <span className="text-slate-400">→</span>
          <span className="text-emerald-600 font-semibold">{rightLabel}</span>
        </div>
        <div className="ml-auto flex gap-2">
          {/* Show / hide unchanged */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowUnchanged(!showUnchanged)}
            className={cn("gap-1.5 text-xs", showUnchanged && "bg-slate-100")}
          >
            <Equal className="h-3.5 w-3.5" />
            {showUnchanged ? "Hide Unchanged" : "Show Unchanged"}
          </Button>

          {/* View mode toggle */}
          <div className="flex border border-slate-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode("unified")}
              className={cn(
                "px-3 py-1.5 text-xs flex items-center gap-1 transition-colors",
                viewMode === "unified" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
              )}
            >
              <AlignLeft className="h-3.5 w-3.5" /> Unified
            </button>
            <button
              onClick={() => setViewMode("split")}
              className={cn(
                "px-3 py-1.5 text-xs flex items-center gap-1 transition-colors border-l border-slate-200",
                viewMode === "split" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
              )}
            >
              <ArrowLeftRight className="h-3.5 w-3.5" /> Split
            </button>
          </div>

          <Button variant="ghost" size="sm" onClick={onClose} className="gap-1.5 text-xs">
            <X className="h-3.5 w-3.5" /> Close Diff
          </Button>
        </div>
      </div>

      {/* ── Summary bar ── */}
      <SummaryBar summary={diff.summary} />

      {/* ── Sections ── */}
      <div className="space-y-3">
        {diff.sections.map((section) => (
          <SectionBlock
            key={section.title}
            section={section}
            viewMode={viewMode}
            showUnchanged={showUnchanged}
          />
        ))}
      </div>

      {/* ── Close button at bottom ── */}
      <div className="flex justify-center pt-2">
        <Button variant="outline" size="sm" onClick={onClose} className="gap-1.5">
          <X className="h-4 w-4" /> Close Diff View
        </Button>
      </div>
    </div>
  );
}
