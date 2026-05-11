import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { db, type Invoice } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  Edit,
  Download,
  Printer,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { generateInvoicePDF } from "@/lib/pdf";
import { getSettings, type Settings } from "@/lib/db";

export default function InvoiceView() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [inv, sett] = await Promise.all([
        db.invoices.get(Number(params.id)),
        getSettings(),
      ]);
      setInvoice(inv || null);
      setSettings(sett);
      setLoading(false);
    }
    load();
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
      </div>
    );
  }

  if (!invoice || !settings) {
    return (
      <div className="text-center py-20 text-slate-400">
        <p>Invoice not found</p>
        <Button className="mt-4" onClick={() => setLocation("/invoices")}>Back to Invoices</Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/invoices")} className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{invoice.invoiceNumber}</h1>
            <p className="text-slate-500 text-sm">{formatDate(invoice.invoiceDate)}</p>
          </div>
          <Badge
            className={invoice.status === "finalized" ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" : "bg-amber-100 text-amber-700 hover:bg-amber-100"}
          >
            {invoice.status === "finalized" ? <><CheckCircle2 className="h-3 w-3 mr-1 inline" />Finalized</> : <><Clock className="h-3 w-3 mr-1 inline" />Draft</>}
          </Badge>
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

      {/* Invoice card preview */}
      <Card className="border-slate-200" id="invoice-preview">
        <CardContent className="p-0">
          {/* Header */}
          <div className="border-b border-slate-200 p-6 pb-4">
            <div className="text-center mb-4">
              <h2 className="text-lg font-bold text-slate-900 uppercase tracking-wide border border-slate-300 inline-block px-6 py-1">TAX INVOICE</h2>
            </div>
              <div className="text-right text-xs text-slate-400 italic mb-2">Original / Duplicate / Triplicate copy</div>
            <div className="grid grid-cols-2 gap-6 mt-2">
              <div>
                <p className="font-bold text-slate-900 text-base">{settings.companyName}</p>
                {settings.address.split("\n").map((l, i) => (
                  <p key={i} className="text-xs text-slate-600">{l}</p>
                ))}
                <p className="text-xs text-slate-600 mt-1">GSTIN/UIN : <span className="font-semibold">{settings.gstNumber}</span></p>
                <p className="text-xs text-slate-600">STATE CODE : {settings.state}, CODE {settings.stateCode}</p>
                <p className="text-xs text-slate-600">PLACE OF SUPPLY : {settings.placeOfSupply}</p>
              </div>
              <div className="text-xs border-l border-slate-200 pl-4 space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Invoice No.:</span>
                  <span className="font-bold">{invoice.invoiceNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Dated:</span>
                  <span className="font-bold">{formatDate(invoice.invoiceDate)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Despatch Through:</span>
                  <span className="font-semibold">{invoice.despatchThrough || "BY ROAD"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Destination:</span>
                  <span className="font-semibold">{invoice.destination || invoice.buyer.state}</span>
                </div>
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
            {invoice.buyer.state && <p className="text-xs text-slate-600">{invoice.buyer.state} {invoice.buyer.stateCode && `(Code: ${invoice.buyer.stateCode})`}</p>}
            {invoice.buyer.gstNumber && <p className="text-xs text-slate-600 mt-1">GST NO.: <span className="font-semibold">{invoice.buyer.gstNumber}</span></p>}
          </div>

          {/* Items table */}
          <div className="p-4 border-b border-slate-200">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-100">
                  <th className="py-2 px-2 text-left text-slate-600 font-semibold w-8">S.No.</th>
                  <th className="py-2 px-2 text-left text-slate-600 font-semibold">Description</th>
                  <th className="py-2 px-2 text-center text-slate-600 font-semibold">HSN/SAC</th>
                  <th className="py-2 px-2 text-center text-slate-600 font-semibold">GST %</th>
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
                      {item.description && <p className="text-slate-500">{item.description}</p>}
                    </td>
                    <td className="py-3 px-2 text-center font-mono text-slate-600">{item.hsnCode}</td>
                    <td className="py-3 px-2 text-center text-slate-600">{item.gstPercent}%</td>
                    <td className="py-3 px-2 text-center text-slate-900 font-semibold">{item.quantity}</td>
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
                <div>
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

              <div className="mt-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Bank Details</p>
                <p className="text-xs text-slate-600">{settings.bankName}</p>
                <p className="text-xs text-slate-600">A/C: {settings.accountNumber}</p>
                <p className="text-xs text-slate-600">IFSC: {settings.ifscCode}</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Subtotal</span>
                <span className="font-medium">₹{formatCurrency(invoice.subtotal)}</span>
              </div>
              {!invoice.isIGST ? (
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
              )}
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Tax Total (GST 18%)</span>
                <span>₹{formatCurrency(invoice.taxTotal)}</span>
              </div>
              <div className="flex justify-between text-sm bg-slate-50 px-3 py-2 rounded">
                <span className="text-slate-600">After Tax</span>
                <span className="font-semibold">₹{formatCurrency(invoice.subtotal + invoice.taxTotal)}</span>
              </div>
              {invoice.otherCharges > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Other Charges ({invoice.otherChargesLabel})</span>
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
    </div>
  );
}
