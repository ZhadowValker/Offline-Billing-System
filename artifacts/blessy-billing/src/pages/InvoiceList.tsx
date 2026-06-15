import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { db, type Invoice } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Search, FileText, Eye, Edit, Trash2, Download, Receipt, ClipboardList, ChevronDown } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { generateInvoicePDF } from "@/lib/pdf";
import { cn } from "@/lib/utils";

// ── New Document dropdown ─────────────────────────────────────────────────────
function NewDocumentButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const options = [
    { href: "/invoices/new?type=gst",       icon: <Receipt      className="h-4 w-4 text-blue-600"   />, label: "GST Bill",     desc: "Tax invoice with CGST/SGST",   color: "#1A5FA8" },
    { href: "/invoices/new?type=non-gst",   icon: <FileText     className="h-4 w-4 text-slate-600"  />, label: "Non-GST Bill", desc: "Simple invoice without tax",    color: "#374151" },
    { href: "/invoices/new?type=quotation", icon: <ClipboardList className="h-4 w-4 text-amber-600" />, label: "Quotation",    desc: "Price quote for the customer",  color: "#D97706" },
  ];

  return (
    <div className="relative" ref={ref}>
      {/* Split button */}
      <div className="flex">
        <Link href="/invoices/new?type=gst">
          <button
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-l-lg transition-colors"
            style={{ background: "#1A5FA8" }}
            data-testid="button-new-gst"
          >
            <Plus className="h-4 w-4" />
            New Invoice
          </button>
        </Link>
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center px-2 py-2 text-white rounded-r-lg border-l border-blue-400 transition-colors hover:opacity-90"
          style={{ background: "#1A5FA8" }}
          data-testid="button-new-dropdown"
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </button>
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-1 w-64 bg-white rounded-xl shadow-lg border border-slate-200 z-50 overflow-hidden">
          {options.map((opt) => (
            <Link key={opt.href} href={opt.href}>
              <button
                className="flex items-start gap-3 w-full px-4 py-3 hover:bg-slate-50 transition-colors text-left"
                onClick={() => setOpen(false)}
                data-testid={`button-new-${opt.href.split("=")[1]}`}
              >
                <div className="mt-0.5 p-1.5 rounded-lg bg-slate-100">{opt.icon}</div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{opt.label}</p>
                  <p className="text-xs text-slate-500">{opt.desc}</p>
                </div>
              </button>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function InvoiceList() {
  const [, setLocation] = useLocation();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [billTypeFilter, setBillTypeFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    const invs = await db.invoices.orderBy("invoiceDate").reverse().toArray();
    setInvoices(invs);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = invoices.filter((inv) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      inv.invoiceNumber.toLowerCase().includes(q) ||
      inv.buyer.name.toLowerCase().includes(q) ||
      String(inv.totalAmount).includes(q);
    const matchStatus  = statusFilter  === "all" || inv.status === statusFilter;
    const matchType    = billTypeFilter === "all" || (inv.billType || "gst") === billTypeFilter;
    const matchPayment = paymentFilter  === "all" || (inv.paymentStatus || "unpaid") === paymentFilter;
    return matchSearch && matchStatus && matchType && matchPayment;
  });

  async function handleDelete() {
    if (deleteId !== null) {
      await db.invoices.delete(deleteId);
      setDeleteId(null);
      load();
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Invoices</h1>
          <p className="text-slate-500 text-sm mt-0.5">{invoices.length} total invoices</p>
        </div>
        <NewDocumentButton />
      </div>

      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by invoice no, customer..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="input-search"
              />
            </div>
            <Select value={billTypeFilter} onValueChange={setBillTypeFilter}>
              <SelectTrigger className="w-36" data-testid="select-bill-type-filter">
                <SelectValue placeholder="Bill Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="gst">GST Bill</SelectItem>
                <SelectItem value="non-gst">Non-GST</SelectItem>
                <SelectItem value="quotation">Quotation</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36" data-testid="select-status-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="finalized">Finalized</SelectItem>
              </SelectContent>
            </Select>
            <Select value={paymentFilter} onValueChange={setPaymentFilter}>
              <SelectTrigger className="w-36" data-testid="select-payment-filter">
                <SelectValue placeholder="Payment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Payments</SelectItem>
                <SelectItem value="unpaid">Unpaid</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No invoices found</p>
              <Link href="/invoices/new?type=gst">
                <Button size="sm" className="mt-3 text-white" style={{ background: "#1A5FA8" }}>
                  Create First Invoice
                </Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-8"></th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Invoice No.</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Buyer</th>
                    <th className="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Amount</th>
                    <th className="text-center py-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                    <th className="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((inv) => (
                    <tr
                      key={inv.id}
                      className="border-b border-slate-50 hover:bg-slate-50 transition-colors"
                      data-testid={`row-invoice-${inv.id}`}
                    >
                      <td className="py-3 px-3">
                        {inv.billType === "quotation"
                          ? <ClipboardList className="h-4 w-4 text-amber-500" />
                          : inv.billType === "non-gst"
                          ? <FileText className="h-4 w-4 text-slate-400" />
                          : <Receipt className="h-4 w-4 text-blue-500" />}
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-semibold text-slate-900">{inv.invoiceNumber}</span>
                      </td>
                      <td className="py-3 px-3 text-slate-600">{formatDate(inv.invoiceDate)}</td>
                      <td className="py-3 px-3">
                        <div>
                          <p className="font-medium text-slate-900">{inv.buyer.name}</p>
                          <p className="text-xs text-slate-400">{inv.buyer.gstNumber}</p>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-slate-900">₹{formatCurrency(inv.totalAmount)}</td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex flex-col gap-1 items-center">
                          {inv.billType === "quotation" ? (
                            <Badge className={
                              inv.quotationStatus === "accepted" ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" :
                              inv.quotationStatus === "rejected" ? "bg-red-100 text-red-600 hover:bg-red-100" :
                              "bg-amber-100 text-amber-700 hover:bg-amber-100"
                            }>
                              {inv.quotationStatus || "open"}
                            </Badge>
                          ) : (
                            <>
                              <Badge className={inv.status === "finalized" ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" : "bg-amber-100 text-amber-700 hover:bg-amber-100"}>
                                {inv.status}
                              </Badge>
                              <Badge className={
                                (inv.paymentStatus || "unpaid") === "paid"    ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-xs" :
                                (inv.paymentStatus || "unpaid") === "partial" ? "bg-blue-100 text-blue-700 hover:bg-blue-100 text-xs" :
                                "bg-red-100 text-red-600 hover:bg-red-100 text-xs"
                              }>
                                {(inv.paymentStatus || "unpaid") === "paid" ? "Paid" :
                                 (inv.paymentStatus || "unpaid") === "partial" ? "Partial" : "Unpaid"}
                              </Badge>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-slate-400 hover:text-slate-700"
                            onClick={() => setLocation(`/invoices/${inv.id}`)}
                            data-testid={`button-view-${inv.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-slate-400 hover:text-slate-700"
                            onClick={() => setLocation(`/invoices/${inv.id}/edit`)}
                            data-testid={`button-edit-${inv.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-slate-400 hover:text-blue-600"
                            onClick={() => generateInvoicePDF(inv)}
                            data-testid={`button-download-${inv.id}`}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-slate-400 hover:text-red-600"
                            onClick={() => setDeleteId(inv.id!)}
                            data-testid={`button-delete-${inv.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the invoice. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
