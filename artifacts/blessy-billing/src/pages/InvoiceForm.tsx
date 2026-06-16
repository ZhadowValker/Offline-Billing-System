import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import {
  db, type Invoice, type InvoiceItem, type Customer, type Product,
  getNextInvoiceNumber, incrementInvoiceNumber, getSettings, numberToWords,
} from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Command, CommandInput, CommandList, CommandItem, CommandEmpty,
} from "@/components/ui/command";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Plus, Trash2, Save, ArrowLeft, Check, ChevronsUpDown,
  Receipt, FileText, ClipboardList, ThumbsUp, ThumbsDown,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDateInput } from "@/lib/utils";
import { generateInvoicePDF } from "@/lib/pdf";
import { syncInvoicesToGitHub } from "@/lib/github";
import { cn } from "@/lib/utils";

type BillType = "gst" | "non-gst" | "quotation";

// ── Bill type config ──────────────────────────────────────────────────────────
const BILL_TYPE_CONFIG = {
  "gst": {
    label: "GST Bill",
    icon: <Receipt className="h-4 w-4" />,
    color: "#1A5FA8",

    docTitle: "TAX INVOICE",
    saveLabel: "Finalize Invoice",
    draftLabel: "Save as Draft",
  },
  "non-gst": {
    label: "Non-GST Bill",
    icon: <FileText className="h-4 w-4" />,
    color: "#374151",

    docTitle: "INVOICE",
    saveLabel: "Finalize Invoice",
    draftLabel: "Save as Draft",
  },
  "quotation": {
    label: "Quotation",
    icon: <ClipboardList className="h-4 w-4" />,
    color: "#D97706",

    docTitle: "QUOTATION",
    saveLabel: "Save Quotation",
    draftLabel: "Save as Draft",
  },
} as const;

const emptyItem = (): InvoiceItem => ({
  productName: "", description: "", hsnCode: "",
  quantity: 1, rate: 0, gstPercent: 18, unit: "NOS",
  amount: 0, cgst: 0, sgst: 0, igst: 0,
});

function calcItem(item: InvoiceItem, isIGST: boolean, hasGST: boolean): InvoiceItem {
  const amount = item.quantity * item.rate;
  const gst = hasGST ? (amount * item.gstPercent) / 100 : 0;
  return {
    ...item, amount,
    cgst: (hasGST && !isIGST) ? gst / 2 : 0,
    sgst: (hasGST && !isIGST) ? gst / 2 : 0,
    igst: (hasGST && isIGST)  ? gst      : 0,
  };
}

// ── Bill type header banner ───────────────────────────────────────────────────
function BillTypeBanner({ billType }: { billType: BillType }) {
  const cfg = BILL_TYPE_CONFIG[billType];
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl text-white text-sm font-semibold"
      style={{ background: cfg.color }}>
      {cfg.icon}
      <span>{cfg.label}</span>
      <span className="ml-auto text-xs font-normal opacity-80">{cfg.docTitle}</span>
    </div>
  );
}

interface Props {
  mode: "create" | "edit";
  initialBillType?: BillType;
  prefillData?: Partial<Invoice>; // for "convert quotation to invoice"
  fromQuotationId?: number;
}

export default function InvoiceForm({ mode, initialBillType = "gst", prefillData, fromQuotationId }: Props) {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts]   = useState<Product[]>([]);
  const [existingInvoice, setExistingInvoice] = useState<Invoice | null>(null);

  // Bill type — set from URL param, can't be changed mid-form
  const [billType] = useState<BillType>(initialBillType);
  const cfg = BILL_TYPE_CONFIG[billType];
  const hasGST  = billType === "gst";
  const isQuote = billType === "quotation";

  // Header fields
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [baseNumber, setBaseNumber]       = useState("");
  const [invoiceDate, setInvoiceDate]     = useState(formatDateInput(new Date()));
  const [validityDate, setValidityDate]   = useState(formatDateInput(new Date(Date.now() + 30 * 86400000)));
  const [isIGST, setIsIGST]              = useState(false);
  const [placeOfSupply, setPlaceOfSupply] = useState("TELANGANA");
  const [quotationStatus, setQuotationStatus] = useState<"open" | "accepted" | "rejected">("open");

  // Buyer
  const [buyerOpen, setBuyerOpen]         = useState(false);
  const [selectedBuyer, setSelectedBuyer] = useState<Customer | null>(null);
  const [manualBuyer, setManualBuyer]     = useState<Customer>({
    name: "", address: "", gstNumber: "", state: "", stateCode: "", contact: "", email: "", createdAt: new Date(),
  });

  // Items
  const [items, setItems] = useState<InvoiceItem[]>([emptyItem()]);

  // Charges & transport
  const [otherCharges, setOtherCharges]           = useState(0);
  const [otherChargesLabel, setOtherChargesLabel] = useState("FREIGHT");
  const [despatchThrough, setDespatchThrough]     = useState("BY ROAD");
  const [destination, setDestination]             = useState("");
  const [buyersOrderNo, setBuyersOrderNo]         = useState("");
  const [motorVehicleNo, setMotorVehicleNo]       = useState("");
  const [billOfLadingNo, setBillOfLadingNo]       = useState("");
  const [deliveryNote, setDeliveryNote]           = useState("");
  const [suppliersRef, setSuppliersRef]           = useState("");

  useEffect(() => {
    async function init() {
      const [custs, prods] = await Promise.all([
        db.customers.orderBy("name").toArray(),
        db.products.orderBy("name").toArray(),
      ]);
      setCustomers(custs);
      setProducts(prods);

      if (mode === "create") {
        const num = await getNextInvoiceNumber(initialBillType);
        setBaseNumber(num);
        setInvoiceNumber(num);
        const settings = await getSettings();
        setPlaceOfSupply(settings.placeOfSupply || "TELANGANA");

        // Handle prefill from quotation conversion
        const sourceData = prefillData || (fromQuotationId ? await db.invoices.get(fromQuotationId) : null);
        if (sourceData) {
          if (sourceData.buyer)             { setManualBuyer(sourceData.buyer as Customer); }
          if (sourceData.items)             { setItems(sourceData.items); }
          if (sourceData.otherCharges)      { setOtherCharges(sourceData.otherCharges); }
          if (sourceData.otherChargesLabel) { setOtherChargesLabel(sourceData.otherChargesLabel); }
          if (sourceData.destination)       { setDestination(sourceData.destination); }
          if (sourceData.despatchThrough)   { setDespatchThrough(sourceData.despatchThrough); }
          if (sourceData.buyersOrderNo)     { setBuyersOrderNo(sourceData.buyersOrderNo); }
        }
      } else if (mode === "edit" && params.id) {
        const inv = await db.invoices.get(Number(params.id));
        if (inv) {
          setExistingInvoice(inv);
          setInvoiceNumber(inv.invoiceNumber);
          setBaseNumber(inv.invoiceNumber);
          setInvoiceDate(formatDateInput(new Date(inv.invoiceDate)));
          if (inv.validityDate) setValidityDate(formatDateInput(new Date(inv.validityDate)));
          setIsIGST(inv.isIGST);
          setPlaceOfSupply(inv.placeOfSupply);
          setSelectedBuyer(inv.buyer as Customer);
          setManualBuyer(inv.buyer as Customer);
          setItems(inv.items);
          setOtherCharges(inv.otherCharges);
          setOtherChargesLabel(inv.otherChargesLabel);
          setDespatchThrough(inv.despatchThrough);
          setDestination(inv.destination);
          setBuyersOrderNo(inv.buyersOrderNo);
          setMotorVehicleNo(inv.motorVehicleNo || "");
          setBillOfLadingNo(inv.billOfLadingNo || "");
          setDeliveryNote(inv.deliveryNote || "");
          setSuppliersRef(inv.suppliersRef || "");
          if (inv.quotationStatus) setQuotationStatus(inv.quotationStatus);
        }
      }
      setLoading(false);
    }
    init();
  }, [mode, params.id]);

  const buyer = selectedBuyer || manualBuyer;
  const calculatedItems = items.map((it) => calcItem(it, isIGST, hasGST));
  const subtotal    = calculatedItems.reduce((s, i) => s + i.amount, 0);
  const cgstTotal   = calculatedItems.reduce((s, i) => s + i.cgst, 0);
  const sgstTotal   = calculatedItems.reduce((s, i) => s + i.sgst, 0);
  const igstTotal   = calculatedItems.reduce((s, i) => s + i.igst, 0);
  const taxTotal    = cgstTotal + sgstTotal + igstTotal;
  const totalAmount = subtotal + taxTotal + otherCharges;
  const totalInWords = numberToWords(totalAmount);

  function updateItem(idx: number, changes: Partial<InvoiceItem>) {
    setItems((prev) => {
      const updated = [...prev];
      updated[idx] = calcItem({ ...updated[idx], ...changes }, isIGST, hasGST);
      return updated;
    });
  }

  function selectProduct(idx: number, prod: Product) {
    updateItem(idx, {
      productName: prod.name,
      description: prod.size ? `SIZE: ${prod.size}` : "",
      hsnCode: prod.hsnCode,
      rate: prod.defaultRate,
      gstPercent: prod.gstPercent,
      unit: prod.unit,
    });
  }

  function buildInvoiceData(saveStatus: "draft" | "finalized"): Omit<Invoice, "id"> {
    return {
      invoiceNumber,
      invoiceDate: new Date(invoiceDate),
      validityDate: isQuote ? new Date(validityDate) : undefined,
      buyer,
      items: calculatedItems,
      subtotal, cgstTotal, sgstTotal, igstTotal, taxTotal,
      otherCharges, otherChargesLabel,
      totalAmount, totalInWords,
      isIGST, placeOfSupply,
      billType,
      quotationStatus: isQuote ? quotationStatus : undefined,
      quotationRef: prefillData?.invoiceNumber,
      status: saveStatus,
      paymentStatus: existingInvoice?.paymentStatus || "unpaid",
      paidAmount:    existingInvoice?.paidAmount    || 0,
      payments:      existingInvoice?.payments      || [],
      transportMode: "", vehicleNumber: "",
      deliveryNote, suppliersRef, otherRef: "",
      buyersOrderNo, despatchThrough, destination,
      billOfLadingNo, motorVehicleNo,
      createdAt: existingInvoice?.createdAt || new Date(),
      updatedAt: new Date(),
      versions: existingInvoice?.versions || [],
    };
  }

  async function handleSave(saveStatus: "draft" | "finalized") {
    if (!buyer.name.trim()) { toast({ title: "Buyer name is required", variant: "destructive" }); return; }
    if (!items[0]?.productName) { toast({ title: "Add at least one item", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const invData = buildInvoiceData(saveStatus);
      if (mode === "edit" && existingInvoice?.id) {
        const versions = [...(existingInvoice.versions || [])];
        versions.push({ versionNumber: versions.length + 1, editedAt: new Date(), editNote: "", snapshot: { ...existingInvoice } });
        invData.versions = versions;
        await db.invoices.update(existingInvoice.id, invData);
        toast({ title: "Saved" });
      } else {
        await db.invoices.add(invData);
        await incrementInvoiceNumber(billType);
        toast({ title: isQuote ? "Quotation created" : "Invoice created" });
      }
      syncInvoicesToGitHub().then((r) => { if (r.success) toast({ title: "✓ Synced to GitHub" }); });
      setLocation("/invoices");
    } finally { setSaving(false); }
  }

  async function handleSaveAndDownload() {
    if (!buyer.name.trim()) { toast({ title: "Buyer name is required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const invData = buildInvoiceData("finalized");
      let savedInv: Invoice;
      if (mode === "edit" && existingInvoice?.id) {
        await db.invoices.update(existingInvoice.id, invData);
        savedInv = { ...invData, id: existingInvoice.id };
      } else {
        const id = await db.invoices.add(invData);
        await incrementInvoiceNumber(billType);
        savedInv = { ...invData, id };
      }
      await generateInvoicePDF(savedInv);
      syncInvoicesToGitHub();
      setLocation("/invoices");
    } finally { setSaving(false); }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: cfg.color }} />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Page title */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/invoices")} className="h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {mode === "create"
              ? `New ${cfg.label}`
              : `Edit ${cfg.label}`}
          </h1>
          <p className="text-slate-500 text-sm font-mono">{invoiceNumber}</p>
        </div>
      </div>

      {/* Bill type banner */}
      <BillTypeBanner billType={billType} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">

          {/* Header card */}
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {isQuote ? "Quotation Details" : "Invoice Details"}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-slate-600">
                  {isQuote ? "Quotation Number" : "Invoice Number"}
                </Label>
                <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className="font-mono" />
              </div>
              <div>
                <Label className="text-xs text-slate-600">Date</Label>
                <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
              </div>

              {/* Quotation-specific: validity date + status */}
              {isQuote && (
                <>
                  <div>
                    <Label className="text-xs text-slate-600">Valid Until</Label>
                    <Input type="date" value={validityDate} onChange={(e) => setValidityDate(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-600">Quotation Status</Label>
                    <Select value={quotationStatus} onValueChange={(v) => setQuotationStatus(v as any)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="accepted">Accepted</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {/* GST-only: place of supply + IGST toggle */}
              {hasGST && (
                <>
                  <div>
                    <Label className="text-xs text-slate-600">Place of Supply</Label>
                    <Input value={placeOfSupply} onChange={(e) => setPlaceOfSupply(e.target.value)} />
                  </div>
                  <div className="flex items-center gap-3 pt-5">
                    <Switch checked={isIGST} onCheckedChange={setIsIGST} />
                    <Label className="text-sm cursor-pointer" onClick={() => setIsIGST(!isIGST)}>
                      Apply IGST (inter-state)
                    </Label>
                  </div>
                </>
              )}

              {/* Non-GST: just place of supply */}
              {!hasGST && !isQuote && (
                <div>
                  <Label className="text-xs text-slate-600">Place of Supply</Label>
                  <Input value={placeOfSupply} onChange={(e) => setPlaceOfSupply(e.target.value)} />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Buyer card */}
          <Card className="border-slate-200">
            <CardHeader className="pb-3"><CardTitle className="text-base">Buyer Details</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs text-slate-600">Select Saved Buyer</Label>
                <Popover open={buyerOpen} onOpenChange={setBuyerOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                      {selectedBuyer ? selectedBuyer.name : "Search saved buyers..."}
                      <ChevronsUpDown className="h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[350px] p-0">
                    <Command>
                      <CommandInput placeholder="Search buyer..." />
                      <CommandList>
                        <CommandEmpty>No buyer found.</CommandEmpty>
                        {customers.map((c) => (
                          <CommandItem key={c.id} value={c.name}
                            onSelect={() => { setSelectedBuyer(c); setManualBuyer(c); setBuyerOpen(false); }}>
                            <Check className={cn("mr-2 h-4 w-4", selectedBuyer?.id === c.id ? "opacity-100" : "opacity-0")} />
                            <div>
                              <p className="text-sm font-medium">{c.name}</p>
                              <p className="text-xs text-slate-500">{c.gstNumber}</p>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label className="text-xs text-slate-600">Company Name *</Label>
                  <Input value={manualBuyer.name}
                    onChange={(e) => { setSelectedBuyer(null); setManualBuyer({ ...manualBuyer, name: e.target.value }); }}
                    placeholder="Company name" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-slate-600">Address</Label>
                  <Input value={manualBuyer.address}
                    onChange={(e) => setManualBuyer({ ...manualBuyer, address: e.target.value })}
                    placeholder="Address" />
                </div>
                {/* GST number — required for GST bill, optional for others */}
                <div>
                  <Label className="text-xs text-slate-600">
                    GST Number {hasGST ? "*" : <span className="text-slate-400">(optional)</span>}
                  </Label>
                  <Input value={manualBuyer.gstNumber}
                    onChange={(e) => setManualBuyer({ ...manualBuyer, gstNumber: e.target.value.toUpperCase() })}
                    placeholder="36AABCP4523B1ZX" />
                </div>
                <div>
                  <Label className="text-xs text-slate-600">State</Label>
                  <Input value={manualBuyer.state}
                    onChange={(e) => setManualBuyer({ ...manualBuyer, state: e.target.value.toUpperCase() })}
                    placeholder="TELANGANA" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Items card */}
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Items</CardTitle>
                <Button variant="outline" size="sm" onClick={() => setItems((p) => [...p, emptyItem()])} className="gap-1 text-xs">
                  <Plus className="h-3 w-3" /> Add Item
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {items.map((item, idx) => (
                  <div key={idx} className="border border-slate-200 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-400 uppercase">Item {idx + 1}</span>
                      {items.length > 1 && (
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-red-400 hover:text-red-600"
                          onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>

                    {/* Product selector */}
                    <div>
                      <Label className="text-xs text-slate-600">Select from catalog</Label>
                      <Select onValueChange={(val) => {
                        const p = products.find((p) => String(p.id) === val);
                        if (p) selectProduct(idx, p);
                      }}>
                        <SelectTrigger className="text-sm"><SelectValue placeholder="Select product..." /></SelectTrigger>
                        <SelectContent>
                          {products.map((p) => (
                            <SelectItem key={p.id} value={String(p.id)}>
                              {p.name} {p.size && `(${p.size})`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs text-slate-600">Product Name *</Label>
                        <Input value={item.productName}
                          onChange={(e) => updateItem(idx, { productName: e.target.value })}
                          placeholder="HDPE WOVEN SACK" />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-600">Description / Size</Label>
                        <Textarea value={item.description}
                          onChange={(e) => updateItem(idx, { description: e.target.value })}
                          placeholder="SIZE: 36x50" rows={2} className="resize-none text-sm" />
                      </div>

                      {/* HSN — shown for GST bills, optional for others */}
                      <div>
                        <Label className="text-xs text-slate-600">
                          HSN/SAC {!hasGST && <span className="text-slate-400">(optional)</span>}
                        </Label>
                        <Input value={item.hsnCode}
                          onChange={(e) => updateItem(idx, { hsnCode: e.target.value })}
                          placeholder="39232990" />
                      </div>

                      {/* GST % — only for GST bills */}
                      {hasGST && (
                        <div>
                          <Label className="text-xs text-slate-600">GST %</Label>
                          <Select value={String(item.gstPercent)}
                            onValueChange={(v) => updateItem(idx, { gstPercent: Number(v) })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="5">5%</SelectItem>
                              <SelectItem value="12">12%</SelectItem>
                              <SelectItem value="18">18%</SelectItem>
                              <SelectItem value="28">28%</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      <div>
                        <Label className="text-xs text-slate-600">Quantity</Label>
                        <Input type="number" value={item.quantity}
                          onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })} />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-600">Rate (₹)</Label>
                        <Input type="number" value={item.rate}
                          onChange={(e) => updateItem(idx, { rate: Number(e.target.value) })} />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-600">Unit</Label>
                        <Select value={item.unit} onValueChange={(v) => updateItem(idx, { unit: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="NOS">NOS</SelectItem>
                            <SelectItem value="KGS">KGS</SelectItem>
                            <SelectItem value="MTR">MTR</SelectItem>
                            <SelectItem value="PCS">PCS</SelectItem>
                            <SelectItem value="BAG">BAG</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs text-slate-600">Amount</Label>
                        <div className="h-9 flex items-center px-3 border border-slate-200 rounded-md bg-slate-50 text-sm font-semibold">
                          ₹{formatCurrency(item.amount)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Transport — hide for quotations */}
          {!isQuote && (
            <Card className="border-slate-200">
              <CardHeader className="pb-3"><CardTitle className="text-base">Transport & Reference</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Despatch Through</Label><Input value={despatchThrough} onChange={(e) => setDespatchThrough(e.target.value)} placeholder="BY ROAD" /></div>
                <div><Label className="text-xs">Destination</Label><Input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="PATANCHERU" /></div>
                <div><Label className="text-xs">Motor Vehicle No.</Label><Input value={motorVehicleNo} onChange={(e) => setMotorVehicleNo(e.target.value)} /></div>
                <div><Label className="text-xs">Bill of Lading / LR-RR No.</Label><Input value={billOfLadingNo} onChange={(e) => setBillOfLadingNo(e.target.value)} /></div>
                <div><Label className="text-xs">Delivery Note</Label><Input value={deliveryNote} onChange={(e) => setDeliveryNote(e.target.value)} /></div>
                <div><Label className="text-xs">Supplier's Ref.</Label><Input value={suppliersRef} onChange={(e) => setSuppliersRef(e.target.value)} /></div>
                <div><Label className="text-xs">Buyer's Order No.</Label><Input value={buyersOrderNo} onChange={(e) => setBuyersOrderNo(e.target.value)} /></div>
                <div><Label className="text-xs">Other Charges Label</Label><Input value={otherChargesLabel} onChange={(e) => setOtherChargesLabel(e.target.value)} placeholder="FREIGHT" /></div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Summary sidebar */}
        <div>
          <Card className="border-slate-200 sticky top-4">
            <CardHeader className="pb-3"><CardTitle className="text-base">Summary</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Subtotal</span>
                  <span className="font-medium">₹{formatCurrency(subtotal)}</span>
                </div>
                {hasGST && (!isIGST ? (
                  <>
                    <div className="flex justify-between"><span className="text-slate-500">CGST (9%)</span><span>₹{formatCurrency(cgstTotal)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">SGST (9%)</span><span>₹{formatCurrency(sgstTotal)}</span></div>
                  </>
                ) : (
                  <div className="flex justify-between"><span className="text-slate-500">IGST (18%)</span><span>₹{formatCurrency(igstTotal)}</span></div>
                ))}
                {hasGST && (
                  <div className="flex justify-between"><span className="text-slate-500">Tax Total</span><span>₹{formatCurrency(taxTotal)}</span></div>
                )}
              </div>

              <div>
                <Label className="text-xs">Other Charges (₹)</Label>
                <Input type="number" value={otherCharges} onChange={(e) => setOtherCharges(Number(e.target.value))} />
              </div>

              <Separator />

              <div className="flex justify-between text-base font-bold text-slate-900">
                <span>Total</span>
                <span>₹{formatCurrency(totalAmount)}</span>
              </div>
              <p className="text-xs text-slate-500 italic leading-relaxed">{totalInWords}</p>

              {/* Quotation status quick-set */}
              {isQuote && (
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    variant={quotationStatus === "accepted" ? "default" : "outline"}
                    className={cn("flex-1 gap-1 text-xs", quotationStatus === "accepted" && "bg-emerald-600 hover:bg-emerald-700")}
                    onClick={() => setQuotationStatus("accepted")}
                  >
                    <ThumbsUp className="h-3 w-3" /> Accepted
                  </Button>
                  <Button
                    size="sm"
                    variant={quotationStatus === "rejected" ? "default" : "outline"}
                    className={cn("flex-1 gap-1 text-xs", quotationStatus === "rejected" && "bg-red-500 hover:bg-red-600")}
                    onClick={() => setQuotationStatus("rejected")}
                  >
                    <ThumbsDown className="h-3 w-3" /> Rejected
                  </Button>
                </div>
              )}

              <div className="space-y-2 pt-2">
                <Button
                  className="w-full gap-2"
                  style={{ background: cfg.color }}
                  onClick={() => handleSave("finalized")}
                  disabled={saving}
                  data-testid="button-finalize"
                >
                  <Save className="h-4 w-4" />
                  {cfg.saveLabel}
                </Button>
                <Button variant="outline" className="w-full gap-2"
                  onClick={() => handleSave("draft")} disabled={saving} data-testid="button-save-draft">
                  {cfg.draftLabel}
                </Button>
                <Button variant="outline"
                  className="w-full gap-2"
                  style={{ color: cfg.color, borderColor: cfg.color + "40" }}
                  onClick={handleSaveAndDownload} disabled={saving} data-testid="button-save-download">
                  Save & Download PDF
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
