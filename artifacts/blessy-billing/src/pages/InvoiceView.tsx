import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { db, type Invoice, type PaymentEntry } from "@/lib/db";
import { formatCurrency, formatDate, formatDateInput } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft, Edit, Download, Printer, Clock, CheckCircle2,
  IndianRupee, Plus, Banknote, CreditCard, Wallet, Building2,
  Receipt, FileText, ClipboardList, ArrowRightCircle, History,
  RotateCcw, AlertTriangle, GitCompare, X,
} from "lucide-react";
import InvoiceDiff from "@/components/InvoiceDiff";
import { versionLabel } from "@/lib/diff";
import { generateInvoicePDF } from "@/lib/pdf";
import { getSettings, type Settings } from "@/lib/db";
import { syncInvoicesToGitHub } from "@/lib/github";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ── Payment status badge ──────────────────────────────────────────────────────
function PaymentBadge({ status }: { status: Invoice["paymentStatus"] }) {
  const cfg = {
    paid:    { label: "Fully Paid",      cls: "bg-emerald-100 text-emerald-700" },
    partial: { label: "Partially Paid",  cls: "bg-blue-100 text-blue-700"      },
    unpaid:  { label: "Unpaid",          cls: "bg-red-100 text-red-600"        },
  };
  const { label, cls } = cfg[status || "unpaid"];
  return <Badge className={cn(cls, "hover:" + cls)}>{label}</Badge>;
}

// ── Bill type badge ───────────────────────────────────────────────────────────
function BillTypeBadge({ type }: { type: Invoice["billType"] }) {
  const cfg = {
    "gst":       { label: "GST Bill",     icon: <Receipt       className="h-3 w-3 mr-1 inline" />, cls: "bg-purple-100 text-purple-700" },
    "non-gst":   { label: "Non-GST Bill", icon: <FileText      className="h-3 w-3 mr-1 inline" />, cls: "bg-slate-100 text-slate-700"   },
    "quotation": { label: "Quotation",    icon: <ClipboardList className="h-3 w-3 mr-1 inline" />, cls: "bg-orange-100 text-orange-700" },
  };
  const { label, icon, cls } = cfg[type || "gst"];
  return <Badge className={cn(cls, "hover:" + cls)}>{icon}{label}</Badge>;
}

// ── Payment method icon ───────────────────────────────────────────────────────
function MethodIcon({ method }: { method: string }) {
  const icons: Record<string, React.ReactNode> = {
    "Cash":          <Banknote    className="h-3.5 w-3.5 text-emerald-600" />,
    "UPI":           <Wallet      className="h-3.5 w-3.5 text-blue-600" />,
    "Cheque":        <CreditCard  className="h-3.5 w-3.5 text-orange-600" />,
    "Bank Transfer": <Building2   className="h-3.5 w-3.5 text-purple-600" />,
    "Other":         <IndianRupee className="h-3.5 w-3.5 text-slate-600" />,
  };
  return <>{icons[method] || icons["Other"]}</>;
}

// ── Version pill bar (with compare mode) ─────────────────────────────────────
function VersionPillBar({
  invoice,
  activeIndex,
  onSelect,
  compareMode,
  compareLeft,
  compareRight,
  onToggleCompareMode,
  onSetCompareLeft,
  onSetCompareRight,
  onStartDiff,
}: {
  invoice: Invoice;
  activeIndex: number | null;
  onSelect: (index: number | null) => void;
  compareMode: boolean;
  compareLeft: number | null;
  compareRight: number | null;
  onToggleCompareMode: () => void;
  onSetCompareLeft: (i: number | null) => void;
  onSetCompareRight: (i: number | null) => void;
  onStartDiff: () => void;
}) {
  if (!invoice.versions || invoice.versions.length === 0) return null;

  const totalVersions = invoice.versions.length + 1;

  // Build all version options: past versions + current
  const allOptions: { index: number | null; label: string }[] = [
    ...invoice.versions.map((v, idx) => ({
      index: idx as number | null,
      label: `v${v.versionNumber} · ${formatDate(new Date(v.editedAt))}`,
    })),
    { index: null, label: `v${totalVersions} · Current` },
  ];

  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-2 pt-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm flex items-center gap-2 text-slate-600">
            <History className="h-4 w-4" />
            Edit History
            <span className="text-xs font-normal text-slate-400">
              — {invoice.versions.length} edit{invoice.versions.length !== 1 ? "s" : ""}
            </span>
          </CardTitle>
          <button
            onClick={onToggleCompareMode}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
              compareMode
                ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                : "bg-white text-slate-600 border-slate-300 hover:border-blue-400 hover:text-blue-600"
            )}
          >
            <GitCompare className="h-3.5 w-3.5" />
            {compareMode ? "Exit Compare" : "Compare Versions"}
          </button>
        </div>
      </CardHeader>

      <CardContent className="pb-4">
        {!compareMode ? (
          /* ── Normal view mode pills ── */
          <div className="flex flex-wrap gap-2">
            {invoice.versions.map((v, idx) => {
              const isActive = activeIndex === idx;
              return (
                <button
                  key={v.versionNumber}
                  onClick={() => onSelect(idx)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                    isActive
                      ? "bg-slate-700 text-white border-slate-700 shadow-sm"
                      : "bg-white text-slate-600 border-slate-300 hover:border-slate-500 hover:text-slate-800"
                  )}
                >
                  <Clock className="h-3 w-3" />
                  v{v.versionNumber}
                  <span className={cn("font-normal", isActive ? "text-slate-300" : "text-slate-400")}>
                    · {formatDate(new Date(v.editedAt))}
                  </span>
                </button>
              );
            })}
            <button
              onClick={() => onSelect(null)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                activeIndex === null
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                  : "bg-white text-slate-600 border-slate-300 hover:border-blue-400 hover:text-blue-600"
              )}
            >
              <CheckCircle2 className="h-3 w-3" />
              v{totalVersions} · Current
              {activeIndex === null && <span className="text-blue-200 font-normal">✓</span>}
            </button>
          </div>
        ) : (
          /* ── Compare selector ── */
          <div className="space-y-3">
            <p className="text-xs text-slate-500">Select two versions to compare — older on the left, newer on the right.</p>
            <div className="flex flex-wrap items-center gap-3">
              {/* Left selector */}
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-red-600 uppercase tracking-wide">Before (left)</span>
                <div className="flex flex-wrap gap-1.5">
                  {allOptions.map((opt) => (
                    <button
                      key={String(opt.index)}
                      onClick={() => onSetCompareLeft(opt.index)}
                      className={cn(
                        "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition-all",
                        compareLeft === opt.index
                          ? "bg-red-500 text-white border-red-500 shadow-sm"
                          : "bg-white text-slate-600 border-slate-200 hover:border-red-300 hover:text-red-600"
                      )}
                    >
                      {opt.index === null
                        ? <CheckCircle2 className="h-3 w-3" />
                        : <Clock className="h-3 w-3" />}
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <span className="text-slate-300 text-lg font-light self-end mb-1">→</span>

              {/* Right selector */}
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wide">After (right)</span>
                <div className="flex flex-wrap gap-1.5">
                  {allOptions.map((opt) => (
                    <button
                      key={String(opt.index)}
                      onClick={() => onSetCompareRight(opt.index)}
                      className={cn(
                        "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition-all",
                        compareRight === opt.index
                          ? "bg-emerald-500 text-white border-emerald-500 shadow-sm"
                          : "bg-white text-slate-600 border-slate-200 hover:border-emerald-300 hover:text-emerald-600"
                      )}
                    >
                      {opt.index === null
                        ? <CheckCircle2 className="h-3 w-3" />
                        : <Clock className="h-3 w-3" />}
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Compare action */}
            <div className="flex items-center gap-3 pt-1">
              <Button
                size="sm"
                onClick={onStartDiff}
                disabled={compareLeft === compareRight}
                className="gap-1.5 text-xs"
                style={{ background: "#1A5FA8" }}
              >
                <GitCompare className="h-3.5 w-3.5" />
                Show Diff
              </Button>
              {compareLeft !== null && compareRight !== null && compareLeft === compareRight && (
                <span className="text-xs text-amber-600">Select two different versions to compare.</span>
              )}
              {compareLeft === null && compareRight === null && (
                <span className="text-xs text-slate-400">Select a "Before" and "After" version above.</span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Past version banner ───────────────────────────────────────────────────────
function PastVersionBanner({
  versionNumber,
  editedAt,
  onBackToCurrent,
}: {
  versionNumber: number;
  editedAt: Date;
  onBackToCurrent: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
      <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
      <span className="font-medium">
        Viewing v{versionNumber} — {formatDate(new Date(editedAt))}
      </span>
      <span className="text-amber-600 text-xs">
        This is a historical snapshot. Changes made after this edit are not shown.
      </span>
      <Button
        size="sm"
        variant="outline"
        onClick={onBackToCurrent}
        className="ml-auto gap-1.5 text-xs border-amber-300 text-amber-700 hover:bg-amber-100 shrink-0"
      >
        <RotateCcw className="h-3 w-3" />
        Back to Current
      </Button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function InvoiceView() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [invoice, setInvoice]   = useState<Invoice | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading]   = useState(true);

  // Version state — null = live current, number = index into invoice.versions[]
  const [activeVersionIndex, setActiveVersionIndex] = useState<number | null>(null);

  // Compare / diff state
  const [compareMode,   setCompareMode]   = useState(false);
  const [compareLeft,   setCompareLeft]   = useState<number | null>(0);   // default: first past version
  const [compareRight,  setCompareRight]  = useState<number | null>(null); // default: current
  const [showDiff,      setShowDiff]      = useState(false);

  // Payment dialog
  const [payDialog, setPayDialog] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<PaymentEntry["method"]>("UPI");
  const [payDate, setPayDate]     = useState(formatDateInput(new Date()));
  const [payNote, setPayNote]     = useState("");
  const [paying, setPaying]       = useState(false);

  async function load() {
    const [inv, sett] = await Promise.all([
      db.invoices.get(Number(params.id)),
      getSettings(),
    ]);
    setInvoice(inv || null);
    setSettings(sett);
    setLoading(false);
  }

  useEffect(() => { load(); }, [params.id]);

  // Reset version selection when navigating to a different invoice
  useEffect(() => {
    setActiveVersionIndex(null);
    setCompareMode(false);
    setShowDiff(false);
  }, [params.id]);

  async function handleAddPayment() {
    if (!invoice?.id || !payAmount || Number(payAmount) <= 0) return;
    setPaying(true);
    try {
      const amount = Number(payAmount);
      const newPayment: PaymentEntry = {
        id: crypto.randomUUID(),
        date: new Date(payDate),
        amount,
        method: payMethod,
        note: payNote,
      };
      const newPaid = (invoice.paidAmount || 0) + amount;
      const newStatus: Invoice["paymentStatus"] =
        newPaid >= invoice.totalAmount ? "paid" :
        newPaid > 0 ? "partial" : "unpaid";

      const updated: Partial<Invoice> = {
        payments: [...(invoice.payments || []), newPayment],
        paidAmount: newPaid,
        paymentStatus: newStatus,
      };
      await db.invoices.update(invoice.id, updated);
      syncInvoicesToGitHub();
      toast({ title: `₹${formatCurrency(amount)} payment recorded` });
      setPayDialog(false);
      setPayAmount(""); setPayNote("");
      load();
    } finally { setPaying(false); }
  }

  async function handleConvertToInvoice() {
    if (!invoice?.id) return;
    await db.invoices.update(invoice.id, { quotationStatus: "accepted" });
    setLocation(`/invoices/new?type=gst&fromQuotation=${invoice.id}`);
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: "#1A5FA8" }} />
    </div>
  );

  if (!invoice || !settings) return (
    <div className="text-center py-20 text-slate-400">
      <p>Invoice not found</p>
      <Button className="mt-4" onClick={() => setLocation("/invoices")}>Back</Button>
    </div>
  );

  // ── Derive display data ───────────────────────────────────────────────────
  // When viewing a past version, all display fields come from the snapshot.
  // Action buttons (Edit, Pay, Convert) always operate on the live invoice.
  const isViewingPast   = activeVersionIndex !== null;
  const activeVersion   = isViewingPast ? invoice.versions[activeVersionIndex] : null;
  const displayInvoice  = isViewingPast
    ? (activeVersion!.snapshot as Invoice)
    : invoice;

  const hasGST   = (displayInvoice.billType || "gst") === "gst";
  const isQuote  = displayInvoice.billType === "quotation";
  const docTitle = isQuote ? "QUOTATION" : hasGST ? "TAX INVOICE" : "INVOICE";
  const pending  = invoice.totalAmount - (invoice.paidAmount || 0);

  return (
    <div className="space-y-5">

      {/* ── Header bar ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/invoices")} className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{invoice.invoiceNumber}</h1>
            <p className="text-slate-500 text-sm">{formatDate(invoice.invoiceDate)}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <BillTypeBadge type={invoice.billType} />
            <Badge className={invoice.status === "finalized"
              ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
              : "bg-amber-100 text-amber-700 hover:bg-amber-100"}>
              {invoice.status === "finalized"
                ? <><CheckCircle2 className="h-3 w-3 mr-1 inline" />Finalized</>
                : <><Clock        className="h-3 w-3 mr-1 inline" />Draft</>}
            </Badge>
            <PaymentBadge status={invoice.paymentStatus || "unpaid"} />
          </div>
        </div>

        <div className="flex gap-2">
          {/* Convert button — only on current, non-rejected quotations */}
          {!isViewingPast && isQuote && (invoice.quotationStatus || "open") !== "rejected" && (
            <Button
              size="sm"
              onClick={handleConvertToInvoice}
              className="gap-1 text-white"
              style={{ background: "#059669" }}
              data-testid="button-convert-to-invoice"
            >
              <ArrowRightCircle className="h-4 w-4" /> Convert to GST Bill
            </Button>
          )}

          {/* Edit — hidden when viewing past version */}
          {!isViewingPast && (
            <Button
              variant="outline" size="sm"
              onClick={() => setLocation(`/invoices/${invoice.id}/edit`)}
              className="gap-1"
              data-testid="button-edit-invoice"
            >
              <Edit className="h-4 w-4" /> Edit
            </Button>
          )}

          {/* PDF — always visible, generates from whichever version is displayed */}
          <Button
            variant="outline" size="sm"
            onClick={() => generateInvoicePDF(displayInvoice)}
            className="gap-1 text-blue-600 border-blue-200 hover:bg-blue-50"
            data-testid="button-download-pdf"
          >
            <Download className="h-4 w-4" /> PDF
          </Button>

          <Button
            variant="outline" size="sm"
            onClick={() => window.print()}
            className="gap-1"
            data-testid="button-print"
          >
            <Printer className="h-4 w-4" /> Print
          </Button>
        </div>
      </div>

      {/* ── Version pill bar ── */}
      <VersionPillBar
        invoice={invoice}
        activeIndex={activeVersionIndex}
        onSelect={(idx) => { setActiveVersionIndex(idx); setShowDiff(false); }}
        compareMode={compareMode}
        compareLeft={compareLeft}
        compareRight={compareRight}
        onToggleCompareMode={() => {
          setCompareMode(!compareMode);
          setShowDiff(false);
          // Smart defaults: left = oldest past version, right = current
          if (!compareMode && invoice.versions?.length > 0) {
            setCompareLeft(0);
            setCompareRight(null);
          }
        }}
        onSetCompareLeft={setCompareLeft}
        onSetCompareRight={setCompareRight}
        onStartDiff={() => setShowDiff(true)}
      />

      {/* ── Past version banner ── */}
      {isViewingPast && activeVersion && (
        <PastVersionBanner
          versionNumber={activeVersion.versionNumber}
          editedAt={new Date(activeVersion.editedAt)}
          onBackToCurrent={() => setActiveVersionIndex(null)}
        />
      )}

      {/* ── Diff viewer (replaces invoice preview when active) ── */}
      {showDiff && compareMode && (
        <InvoiceDiff
          invoice={invoice}
          leftIndex={compareLeft}
          rightIndex={compareRight}
          onClose={() => { setShowDiff(false); setCompareMode(false); }}
        />
      )}

      {/* ── Payment panel — hidden when viewing past version or diff ── */}
      {!isViewingPast && !showDiff && (
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <IndianRupee className="h-4 w-4 text-slate-500" />
                Payment Status
              </CardTitle>
              {(invoice.paymentStatus || "unpaid") !== "paid" && (
                <Button
                  size="sm"
                  onClick={() => setPayDialog(true)}
                  className="gap-1.5 text-xs"
                  style={{ background: "#1A5FA8" }}
                  data-testid="button-add-payment"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Payment
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center p-3 bg-slate-50 rounded-lg">
                <p className="text-xs text-slate-500 mb-1">Total Amount</p>
                <p className="text-lg font-bold text-slate-900">₹{formatCurrency(invoice.totalAmount)}</p>
              </div>
              <div className="text-center p-3 bg-emerald-50 rounded-lg">
                <p className="text-xs text-emerald-600 mb-1">Paid</p>
                <p className="text-lg font-bold text-emerald-700">₹{formatCurrency(invoice.paidAmount || 0)}</p>
              </div>
              <div className={cn("text-center p-3 rounded-lg", pending > 0 ? "bg-red-50" : "bg-slate-50")}>
                <p className={cn("text-xs mb-1", pending > 0 ? "text-red-500" : "text-slate-500")}>Pending</p>
                <p className={cn("text-lg font-bold", pending > 0 ? "text-red-600" : "text-slate-400")}>
                  ₹{formatCurrency(pending)}
                </p>
              </div>
            </div>

            {(invoice.payments || []).length > 0 ? (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Payment History</p>
                <div className="space-y-2">
                  {invoice.payments.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-lg">
                      <MethodIcon method={p.method} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900">₹{formatCurrency(p.amount)}</span>
                          <Badge variant="outline" className="text-xs py-0 h-5">{p.method}</Badge>
                        </div>
                        <p className="text-xs text-slate-500">
                          {formatDate(new Date(p.date))}{p.note ? ` · ${p.note}` : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400 text-center py-2">No payments recorded yet</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Invoice preview card — hidden in diff view ── */}
      {!showDiff && (
      <Card className={cn("border-slate-200", isViewingPast && "ring-2 ring-amber-200")} id="invoice-preview">
        <CardContent className="p-0">

          {/* Header */}
          <div className="border-b border-slate-200 p-6 pb-4">
            <div className="text-center mb-4">
              <h2 className="text-lg font-bold text-slate-900 uppercase tracking-wide border border-slate-300 inline-block px-6 py-1">
                {docTitle}
              </h2>
            </div>
            <div className="text-right text-xs text-slate-400 italic mb-2">Original / Duplicate / Triplicate copy</div>
            <div className="grid grid-cols-2 gap-6 mt-2">
              <div>
                <p className="font-bold text-slate-900 text-base">{settings.companyName}</p>
                {settings.address.split("\n").map((l, i) => (
                  <p key={i} className="text-xs text-slate-600">{l}</p>
                ))}
                {hasGST && (
                  <>
                    <p className="text-xs text-slate-600 mt-1">GSTIN/UIN : <span className="font-semibold">{settings.gstNumber}</span></p>
                    <p className="text-xs text-slate-600">STATE CODE : {settings.state}, CODE {settings.stateCode}</p>
                  </>
                )}
                <p className="text-xs text-slate-600">PLACE OF SUPPLY : {settings.placeOfSupply}</p>
              </div>
              <div className="text-xs border-l border-slate-200 pl-4 space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">{isQuote ? "Quotation No.:" : "Invoice No.:"}</span>
                  <span className="font-bold">{displayInvoice.invoiceNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Dated:</span>
                  <span className="font-bold">{formatDate(new Date(displayInvoice.invoiceDate))}</span>
                </div>
                {displayInvoice.despatchThrough && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Despatch Through:</span>
                    <span className="font-semibold">{displayInvoice.despatchThrough}</span>
                  </div>
                )}
                {displayInvoice.destination && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Destination:</span>
                    <span className="font-semibold">{displayInvoice.destination}</span>
                  </div>
                )}
                {displayInvoice.buyersOrderNo && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Buyer's Order No.:</span>
                    <span>{displayInvoice.buyersOrderNo}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Buyer */}
          <div className="border-b border-slate-200 p-4 bg-slate-50">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Buyer</p>
            <p className="font-bold text-slate-900">{displayInvoice.buyer.name}</p>
            <p className="text-xs text-slate-600">{displayInvoice.buyer.address}</p>
            {displayInvoice.buyer.state && <p className="text-xs text-slate-600">{displayInvoice.buyer.state}</p>}
            {hasGST && displayInvoice.buyer.gstNumber && (
              <p className="text-xs text-slate-600 mt-1">GST NO.: <span className="font-semibold">{displayInvoice.buyer.gstNumber}</span></p>
            )}
          </div>

          {/* Items table */}
          <div className="p-4 border-b border-slate-200">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-100">
                  <th className="py-2 px-2 text-left text-slate-600 font-semibold w-8">S.No.</th>
                  <th className="py-2 px-2 text-left text-slate-600 font-semibold">Description</th>
                  <th className="py-2 px-2 text-center text-slate-600 font-semibold">HSN/SAC</th>
                  {hasGST && <th className="py-2 px-2 text-center text-slate-600 font-semibold">GST %</th>}
                  <th className="py-2 px-2 text-center text-slate-600 font-semibold">Qty</th>
                  <th className="py-2 px-2 text-center text-slate-600 font-semibold">Rate</th>
                  <th className="py-2 px-2 text-center text-slate-600 font-semibold">Unit</th>
                  <th className="py-2 px-2 text-right text-slate-600 font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {displayInvoice.items.map((item, idx) => (
                  <tr key={idx} className="border-t border-slate-100" data-testid={`view-item-${idx}`}>
                    <td className="py-3 px-2 text-slate-500">{idx + 1}</td>
                    <td className="py-3 px-2">
                      <p className="font-semibold text-slate-900">{item.productName}</p>
                      {item.description && <p className="text-slate-500 whitespace-pre-line">{item.description}</p>}
                    </td>
                    <td className="py-3 px-2 text-center font-mono text-slate-600">{item.hsnCode}</td>
                    {hasGST && <td className="py-3 px-2 text-center text-slate-600">{item.gstPercent}%</td>}
                    <td className="py-3 px-2 text-center font-semibold text-slate-900">{item.quantity}</td>
                    <td className="py-3 px-2 text-center text-slate-600">{item.rate}</td>
                    <td className="py-3 px-2 text-center text-slate-600">{item.unit}</td>
                    <td className="py-3 px-2 text-right font-semibold text-slate-900">₹{formatCurrency(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals + bank details */}
          <div className="p-4 grid grid-cols-2 gap-6">
            <div>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Bank Details</p>
                <p className="text-xs text-slate-600">{settings.bankName}</p>
                <p className="text-xs text-slate-600">A/C: {settings.accountNumber}</p>
                <p className="text-xs text-slate-600">Branch & IFSC Code: {settings.ifscCode}</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Subtotal</span>
                <span className="font-medium">₹{formatCurrency(displayInvoice.subtotal)}</span>
              </div>
              {hasGST && (!displayInvoice.isIGST ? (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">CGST (9%)</span>
                    <span>₹{formatCurrency(displayInvoice.cgstTotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">SGST (9%)</span>
                    <span>₹{formatCurrency(displayInvoice.sgstTotal)}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">IGST (18%)</span>
                  <span>₹{formatCurrency(displayInvoice.igstTotal)}</span>
                </div>
              ))}
              {hasGST && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Tax Total (GST 18%)</span>
                  <span>₹{formatCurrency(displayInvoice.taxTotal)}</span>
                </div>
              )}
              {displayInvoice.otherCharges > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Other ({displayInvoice.otherChargesLabel})</span>
                  <span>₹{formatCurrency(displayInvoice.otherCharges)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between text-base font-bold text-slate-900 bg-emerald-50 px-3 py-2 rounded-lg">
                <span>Total Payable</span>
                <span>₹{formatCurrency(displayInvoice.totalAmount)}</span>
              </div>
              <p className="text-xs text-slate-500 italic">{displayInvoice.totalInWords}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      )} {/* end !showDiff */}

      {/* ── Add Payment Dialog ── */}
      <Dialog open={payDialog} onOpenChange={setPayDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="p-3 bg-slate-50 rounded-lg text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Total Amount</span>
                <span className="font-semibold">₹{formatCurrency(invoice.totalAmount)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Already Paid</span>
                <span className="font-semibold text-emerald-600">₹{formatCurrency(invoice.paidAmount || 0)}</span>
              </div>
              <div className="flex justify-between text-slate-600 font-bold mt-1 pt-1 border-t border-slate-200">
                <span>Remaining</span>
                <span className="text-red-600">₹{formatCurrency(pending)}</span>
              </div>
            </div>
            <div>
              <Label className="text-xs">Amount Received (₹) *</Label>
              <Input
                type="number"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder={`Max: ${formatCurrency(pending)}`}
                max={pending}
                className="mt-1"
                autoFocus
                data-testid="input-pay-amount"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Payment Method</Label>
                <Select value={payMethod} onValueChange={(v) => setPayMethod(v as PaymentEntry["method"])}>
                  <SelectTrigger className="mt-1" data-testid="select-pay-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="UPI">UPI</SelectItem>
                    <SelectItem value="Cheque">Cheque</SelectItem>
                    <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Date</Label>
                <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="mt-1" data-testid="input-pay-date" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Note (optional)</Label>
              <Input value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="e.g. advance payment, cheque no. 123" className="mt-1" data-testid="input-pay-note" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialog(false)}>Cancel</Button>
            <Button
              onClick={handleAddPayment}
              disabled={paying || !payAmount || Number(payAmount) <= 0}
              style={{ background: "#1A5FA8" }}
              data-testid="button-confirm-payment"
            >
              {paying ? "Saving..." : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
