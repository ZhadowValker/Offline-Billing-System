/**
 * Invoice Diff Engine
 * Computes a GitHub-style field-level diff between two invoice snapshots.
 */

import { type Invoice, type InvoiceItem } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DiffStatus = "added" | "removed" | "changed" | "unchanged";

export interface DiffLine {
  key: string;
  label: string;
  oldValue: string;
  newValue: string;
  status: DiffStatus;
}

export interface DiffSection {
  title: string;
  icon: string;
  lines: DiffLine[];
  hasChanges: boolean;
}

export interface InvoiceDiff {
  sections: DiffSection[];
  summary: {
    added: number;
    removed: number;
    changed: number;
    total: number;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function str(val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "boolean") return val ? "Yes" : "No";
  if (typeof val === "number") return String(val);
  if (val instanceof Date) return formatDate(val);
  if (typeof val === "string") {
    if (!val.trim()) return "—";
    // Try parsing as ISO date
    if (/^\d{4}-\d{2}-\d{2}/.test(val)) {
      const d = new Date(val);
      if (!isNaN(d.getTime())) return formatDate(d);
    }
    return val;
  }
  return String(val);
}

function money(val: number | undefined | null): string {
  if (val === null || val === undefined) return "—";
  return `Rs. ${formatCurrency(val)}`;
}

function makeLine(
  key: string,
  label: string,
  oldVal: string,
  newVal: string
): DiffLine {
  const status: DiffStatus =
    oldVal === "—" && newVal !== "—" ? "added" :
    oldVal !== "—" && newVal === "—" ? "removed" :
    oldVal !== newVal ? "changed" : "unchanged";
  return { key, label, oldValue: oldVal, newValue: newVal, status };
}

function field(
  key: string,
  label: string,
  a: Invoice,
  b: Invoice,
  getter: (inv: Invoice) => string
): DiffLine {
  return makeLine(key, label, getter(a), getter(b));
}

// ── Section builders ──────────────────────────────────────────────────────────

function buildHeaderSection(a: Invoice, b: Invoice): DiffSection {
  const lines: DiffLine[] = [
    field("invoiceNumber",    "Invoice Number",     a, b, i => str(i.invoiceNumber)),
    field("invoiceDate",      "Invoice Date",       a, b, i => str(i.invoiceDate)),
    field("dueDate",          "Due Date",           a, b, i => str(i.dueDate)),
    field("billType",         "Bill Type",          a, b, i => str(i.billType)),
    field("status",           "Status",             a, b, i => str(i.status)),
    field("placeOfSupply",    "Place of Supply",    a, b, i => str(i.placeOfSupply)),
    field("isIGST",           "Tax Type",           a, b, i => i.isIGST ? "IGST" : "CGST + SGST"),
  ];
  return buildSection("Invoice Details", "📄", lines);
}

function buildBuyerSection(a: Invoice, b: Invoice): DiffSection {
  const lines: DiffLine[] = [
    makeLine("buyer.name",      "Buyer Name",       str(a.buyer?.name),       str(b.buyer?.name)),
    makeLine("buyer.address",   "Address",          str(a.buyer?.address),    str(b.buyer?.address)),
    makeLine("buyer.gstNumber", "GST Number",       str(a.buyer?.gstNumber),  str(b.buyer?.gstNumber)),
    makeLine("buyer.state",     "State",            str(a.buyer?.state),      str(b.buyer?.state)),
    makeLine("buyer.stateCode", "State Code",       str(a.buyer?.stateCode),  str(b.buyer?.stateCode)),
    makeLine("buyer.contact",   "Contact",          str(a.buyer?.contact),    str(b.buyer?.contact)),
    makeLine("buyer.email",     "Email",            str(a.buyer?.email),      str(b.buyer?.email)),
  ];
  return buildSection("Buyer Details", "👤", lines);
}

function buildItemsSection(a: Invoice, b: Invoice): DiffSection {
  const lines: DiffLine[] = [];

  const aItems = a.items || [];
  const bItems = b.items || [];
  const maxLen  = Math.max(aItems.length, bItems.length);

  for (let i = 0; i < maxLen; i++) {
    const ai = aItems[i];
    const bi = bItems[i];
    const prefix = `Item ${i + 1}`;

    if (!ai && bi) {
      // Item was added
      lines.push(makeLine(`item.${i}.added`, `${prefix} — Added`, "—", `${bi.productName} × ${bi.quantity} ${bi.unit}`));
    } else if (ai && !bi) {
      // Item was removed
      lines.push(makeLine(`item.${i}.removed`, `${prefix} — Removed`, `${ai.productName} × ${ai.quantity} ${ai.unit}`, "—"));
    } else if (ai && bi) {
      // Both exist — compare field by field
      const itemLines: Array<[string, string, unknown, unknown]> = [
        [`item.${i}.productName`, `${prefix} · Product`,     ai.productName,  bi.productName],
        [`item.${i}.description`, `${prefix} · Description`, ai.description,  bi.description],
        [`item.${i}.hsnCode`,     `${prefix} · HSN Code`,    ai.hsnCode,      bi.hsnCode],
        [`item.${i}.quantity`,    `${prefix} · Quantity`,    ai.quantity,     bi.quantity],
        [`item.${i}.rate`,        `${prefix} · Rate`,        money(ai.rate),  money(bi.rate)],
        [`item.${i}.unit`,        `${prefix} · Unit`,        ai.unit,         bi.unit],
        [`item.${i}.gstPercent`,  `${prefix} · GST %`,       ai.gstPercent,   bi.gstPercent],
        [`item.${i}.amount`,      `${prefix} · Amount`,      money(ai.amount), money(bi.amount)],
      ];
      for (const [key, label, aVal, bVal] of itemLines) {
        const ov = typeof aVal === "number" ? String(aVal) : str(aVal);
        const nv = typeof bVal === "number" ? String(bVal) : str(bVal);
        lines.push(makeLine(key, label, ov, nv));
      }
    }
  }

  return buildSection("Line Items", "📦", lines);
}

function buildTotalsSection(a: Invoice, b: Invoice): DiffSection {
  const lines: DiffLine[] = [
    field("subtotal",      "Subtotal",           a, b, i => money(i.subtotal)),
    field("cgstTotal",     "CGST",               a, b, i => money(i.cgstTotal)),
    field("sgstTotal",     "SGST",               a, b, i => money(i.sgstTotal)),
    field("igstTotal",     "IGST",               a, b, i => money(i.igstTotal)),
    field("taxTotal",      "Total Tax",          a, b, i => money(i.taxTotal)),
    field("otherCharges",  "Other Charges",      a, b, i => i.otherCharges ? money(i.otherCharges) : "—"),
    field("otherChargesLabel", "Other Label",    a, b, i => str(i.otherChargesLabel)),
    field("totalAmount",   "Total Amount",       a, b, i => money(i.totalAmount)),
    field("totalInWords",  "Amount in Words",    a, b, i => str(i.totalInWords)),
  ];
  return buildSection("Totals", "💰", lines);
}

function buildTransportSection(a: Invoice, b: Invoice): DiffSection {
  const lines: DiffLine[] = [
    field("transportMode",   "Transport Mode",   a, b, i => str(i.transportMode)),
    field("vehicleNumber",   "Vehicle Number",   a, b, i => str(i.vehicleNumber)),
    field("deliveryNote",    "Delivery Note",    a, b, i => str(i.deliveryNote)),
    field("suppliersRef",    "Supplier's Ref",   a, b, i => str(i.suppliersRef)),
    field("buyersOrderNo",   "Buyer's Order No", a, b, i => str(i.buyersOrderNo)),
    field("despatchDocNo",   "Despatch Doc No",  a, b, i => str(i.despatchDocNo)),
    field("despatchThrough", "Despatch Through", a, b, i => str(i.despatchThrough)),
    field("destination",     "Destination",      a, b, i => str(i.destination)),
    field("billOfLadingNo",  "Bill of Lading",   a, b, i => str(i.billOfLadingNo)),
    field("motorVehicleNo",  "Motor Vehicle No", a, b, i => str(i.motorVehicleNo)),
  ];
  return buildSection("Transport & References", "🚚", lines);
}

function buildSection(title: string, icon: string, lines: DiffLine[]): DiffSection {
  const hasChanges = lines.some(l => l.status !== "unchanged");
  return { title, icon, lines, hasChanges };
}

// ── Main export ───────────────────────────────────────────────────────────────

export function computeDiff(older: Invoice, newer: Invoice): InvoiceDiff {
  const sections: DiffSection[] = [
    buildHeaderSection(older, newer),
    buildBuyerSection(older, newer),
    buildItemsSection(older, newer),
    buildTotalsSection(older, newer),
    buildTransportSection(older, newer),
  ];

  let added = 0, removed = 0, changed = 0;
  for (const s of sections) {
    for (const l of s.lines) {
      if (l.status === "added")   added++;
      if (l.status === "removed") removed++;
      if (l.status === "changed") changed++;
    }
  }

  return { sections, summary: { added, removed, changed, total: added + removed + changed } };
}

/**
 * Given an invoice, returns the snapshot at a specific version index.
 * Pass null to get the live current version.
 */
export function getVersionSnapshot(invoice: Invoice, versionIndex: number | null): Invoice {
  if (versionIndex === null) return invoice;
  return invoice.versions[versionIndex]?.snapshot as Invoice ?? invoice;
}

/** Human label for a version index */
export function versionLabel(invoice: Invoice, versionIndex: number | null): string {
  if (versionIndex === null) {
    const n = (invoice.versions?.length ?? 0) + 1;
    return `v${n} (Current)`;
  }
  const v = invoice.versions[versionIndex];
  return `v${v.versionNumber} (${formatDate(new Date(v.editedAt))})`;
}
