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
  Receipt, FileText, ClipboardList,
} from "lucide-react";
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
    "gst":       { label: "GST Bill",     icon: <Receipt      className="h-3 w-3 mr-1 inline" />, cls: "bg-purple-100 text-purple-700" },
    "non-gst":   { label: "Non-GST Bill", icon: <FileText     className="h-3 w-3 mr-1 inline" />, cls: "bg-slate-100 text-slate-700"   },
    "quotation": { label: "Quotation",    icon: <ClipboardList className="h-3 w-3 mr-1 inline" />, cls: "bg-orange-100 text-orange-700" },
  };
  const { label, icon, cls } = cfg[type || "gst"];
  return <Badge className={cn(cls, "hover:" + cls)}>{icon}{label}</Badge>;
}

// ── Payment method icon ───────────────────────────────────────────────────────
function MethodIcon({ method }: { method: string }) {
  const icons: Record<string, React.ReactNode> = {
    "Cash":          <Banknote   className="h-3.5 w-3.5 text-emerald-600" />,
    "UPI":           <Wallet     className="h-3.5 w-3.5 text-blue-600" />,
    "Cheque":        <CreditCard className="h-3.5 w-3.5 text-orange-600" />,
    "Bank Transfer": <Building2  className="h-3.5 w-3.5 text-purple-600" />,
    "Other":         <IndianRupee className="h-3.5 w-3.5 text-slate-600" />,
  };
  return <>{icons[method] || icons["Other"]}</>;
}

export default function InvoiceView() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  // Payment dialog
  const [payDialog, setPayDialog] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<PaymentEntry["method"]>("UPI");
  const [payDate, setPayDate] = useState(formatDateInput(new Date()));
  const [payNote, setPayNote] = useState("");
  const [paying, setPaying] = useState(false);

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

  const pending = invoice.totalAmount - (invoice.paidAmount || 0);
  const hasGST  = (invoice.billType || "gst") === "gst";
  const isQuote = invoice.billType === "quotation";

  const docTitle = isQuote ? "QUOTATION" : hasGST ? "TAX INVOICE" : "INVOICE";

  return (
    <div className="space-y-5">
      {/* Header bar */}
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
          <Button variant="outline" size="sm" onClick={() => setLocation(`/invoices/${invoice.id}/edit`)} className="gap-1" data-testid="button-edit-invoice">
            <Edit className="h-4 w-4" /> Edit
          </Button>
          <Button variant="outline" size="sm" onClick={() => generateInvoicePDF(invoice)} className="gap-1 text-blue-600 border-blue-200 hover:bg-blue-50" data-testid="button-download-pdf">
            <Download className="h-4 w-4" /> PDF
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1" data-testid="button-print">
            <Printer className="h-4 w-4" /> Print
          </Button>
        </div>
      </div>

      {/* Payment panel */}
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
          {/* Amounts row */}
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

          {/* Payment history */}
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
                        {formatDate(p.date)}{p.note ? ` · ${p.note}` : ""}
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

      {/* Invoice preview card */}
      <Card className="border-slate-200" id="invoice-preview">
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
                  <span className="font-bold">{invoice.invoiceNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Dated:</span>
                  <span className="font-bold">{formatDate(invoice.invoiceDate)}</span>
                </div>
                {invoice.despatchThrough && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Despatch Through:</span>
                    <span className="font-semibold">{invoice.despatchThrough}</span>
                  </div>
                )}
                {invoice.destination && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Destination:</span>
                    <span className="font-semibold">{invoice.destination}</span>
                  </div>
                )}
                {invoice.buyersOrderNo && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Buyer's Order No.:</span>
                    <span>{invoice.buyersOrderNo}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Buyer */}
          <div className="border-b border-slate-200 p-4 bg-slate-50">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Buyer</p>
            <p className="font-bold text-slate-900">{invoice.buyer.name}</p>
            <p className="text-xs text-slate-600">{invoice.buyer.address}</p>
            {invoice.buyer.state && <p className="text-xs text-slate-600">{invoice.buyer.state}</p>}
            {hasGST && invoice.buyer.gstNumber && (
              <p className="text-xs text-slate-600 mt-1">GST NO.: <span className="font-semibold">{invoice.buyer.gstNumber}</span></p>
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
                {invoice.items.map((item, idx) => (
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

          {/* Totals */}
          <div className="p-4 grid grid-cols-2 gap-6">
            <div>
              {invoice.versions.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Edit History</p>
                  <div className="space-y-1">
                    {invoice.versions.map((v) => (
                      <div key={v.versionNumber} className="flex items-center gap-2 text-xs text-slate-500">
                        <Clock className="h-3 w-3" />
                        <span>v{v.versionNumber} — {formatDate(v.editedAt)}</span>
                      </div>
                    ))}
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Clock className="h-3 w-3" />
                      <span>v{invoice.versions.length + 1} — Current</span>
                    </div>
                  </div>
                </div>
              )}
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
                <span className="font-medium">₹{formatCurrency(invoice.subtotal)}</span>
              </div>
              {hasGST && (!invoice.isIGST ? (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">CGST (9%)</span>
                    <span>₹{formatCurrency(invoice.cgstTotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">SGST (9%)</span>
                    <span>₹{formatCurrency(invoice.sgstTotal)}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">IGST (18%)</span>
                  <span>₹{formatCurrency(invoice.igstTotal)}</span>
                </div>
              ))}
              {hasGST && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Tax Total (GST 18%)</span>
                  <span>₹{formatCurrency(invoice.taxTotal)}</span>
                </div>
              )}
              {invoice.otherCharges > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Other ({invoice.otherChargesLabel})</span>
                  <span>₹{formatCurrency(invoice.otherCharges)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between text-base font-bold text-slate-900 bg-emerald-50 px-3 py-2 rounded-lg">
                <span>Total Payable</span>
                <span>₹{formatCurrency(invoice.totalAmount)}</span>
              </div>
              <p className="text-xs text-slate-500 italic">{invoice.totalInWords}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add Payment Dialog */}
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
