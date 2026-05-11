import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import {
  db,
  type Invoice,
  type InvoiceItem,
  type Customer,
  type Product,
  getNextInvoiceNumber,
  incrementInvoiceNumber,
  getSettings,
  numberToWords,
} from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandInput,
  CommandList,
  CommandItem,
  CommandEmpty,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Plus, Trash2, ChevronDown, Save, ArrowLeft, Check, ChevronsUpDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDateInput } from "@/lib/utils";
import { generateInvoicePDF } from "@/lib/pdf";
import { cn } from "@/lib/utils";

const emptyItem = (): InvoiceItem => ({
  productName: "",
  description: "",
  hsnCode: "",
  quantity: 1,
  rate: 0,
  gstPercent: 18,
  unit: "NOS",
  amount: 0,
  cgst: 0,
  sgst: 0,
  igst: 0,
});

function calcItem(item: InvoiceItem, isIGST: boolean): InvoiceItem {
  const amount = item.quantity * item.rate;
  const gst = (amount * item.gstPercent) / 100;
  return {
    ...item,
    amount,
    cgst: isIGST ? 0 : gst / 2,
    sgst: isIGST ? 0 : gst / 2,
    igst: isIGST ? gst : 0,
  };
}

export default function InvoiceForm({ mode }: { mode: "create" | "edit" }) {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [existingInvoice, setExistingInvoice] = useState<Invoice | null>(null);

  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(formatDateInput(new Date()));
  const [isIGST, setIsIGST] = useState(false);
  const [placeOfSupply, setPlaceOfSupply] = useState("TELANGANA");
  const [buyerOpen, setBuyerOpen] = useState(false);
  const [selectedBuyer, setSelectedBuyer] = useState<Customer | null>(null);
  const [manualBuyer, setManualBuyer] = useState<Customer>({
    name: "",
    address: "",
    gstNumber: "",
    state: "",
    stateCode: "",
    contact: "",
    email: "",
    createdAt: new Date(),
  });
  const [items, setItems] = useState<InvoiceItem[]>([emptyItem()]);
  const [otherCharges, setOtherCharges] = useState(0);
  const [otherChargesLabel, setOtherChargesLabel] = useState("Auto Fright");
  const [despatchThrough, setDespatchThrough] = useState("BY ROAD");
  const [destination, setDestination] = useState("");
  const [buyersOrderNo, setBuyersOrderNo] = useState("");
  const [transportMode, setTransportMode] = useState("");
  const [motorVehicleNo, setMotorVehicleNo] = useState("");
  const [billOfLadingNo, setBillOfLadingNo] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [suppliersRef, setSuppliersRef] = useState("");
  const [status, setStatus] = useState<"draft" | "finalized">("draft");

  useEffect(() => {
    async function init() {
      const [custs, prods] = await Promise.all([
        db.customers.orderBy("name").toArray(),
        db.products.orderBy("name").toArray(),
      ]);
      setCustomers(custs);
      setProducts(prods);

      if (mode === "create") {
        const num = await getNextInvoiceNumber();
        setInvoiceNumber(num);
        const settings = await getSettings();
        setPlaceOfSupply(settings.placeOfSupply);
      } else if (mode === "edit" && params.id) {
        const inv = await db.invoices.get(Number(params.id));
        if (inv) {
          setExistingInvoice(inv);
          setInvoiceNumber(inv.invoiceNumber);
          setInvoiceDate(formatDateInput(new Date(inv.invoiceDate)));
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
          setStatus(inv.status);
        }
      }
      setLoading(false);
    }
    init();
  }, [mode, params.id]);

  const buyer = selectedBuyer || manualBuyer;

  const calculatedItems = items.map((it) => calcItem(it, isIGST));
  const subtotal = calculatedItems.reduce((s, i) => s + i.amount, 0);
  const cgstTotal = calculatedItems.reduce((s, i) => s + i.cgst, 0);
  const sgstTotal = calculatedItems.reduce((s, i) => s + i.sgst, 0);
  const igstTotal = calculatedItems.reduce((s, i) => s + i.igst, 0);
  const taxTotal = cgstTotal + sgstTotal + igstTotal;
  const totalAmount = subtotal + taxTotal + otherCharges;
  const totalInWords = numberToWords(totalAmount);

  function updateItem(idx: number, changes: Partial<InvoiceItem>) {
    setItems((prev) => {
      const updated = [...prev];
      updated[idx] = calcItem({ ...updated[idx], ...changes }, isIGST);
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

  function addItem() {
    setItems((prev) => [...prev, emptyItem()]);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSave(saveStatus: "draft" | "finalized") {
    if (!buyer.name.trim()) {
      toast({ title: "Buyer name is required", variant: "destructive" });
      return;
    }
    if (items.length === 0 || !items[0].productName) {
      toast({ title: "Add at least one item", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const invData: Omit<Invoice, "id"> = {
        invoiceNumber,
        invoiceDate: new Date(invoiceDate),
        buyer,
        items: calculatedItems,
        subtotal,
        cgstTotal,
        sgstTotal,
        igstTotal,
        taxTotal,
        otherCharges,
        otherChargesLabel,
        totalAmount,
        totalInWords,
        isIGST,
        placeOfSupply,
        status: saveStatus,
        transportMode,
        vehicleNumber: "",
        deliveryNote,
        suppliersRef,
        otherRef: "",
        buyersOrderNo,
        despatchThrough,
        destination,
        billOfLadingNo,
        motorVehicleNo,
        createdAt: existingInvoice?.createdAt || new Date(),
        updatedAt: new Date(),
        versions: existingInvoice?.versions || [],
      };

      if (mode === "edit" && existingInvoice?.id) {
        // Save version
        const prevSnapshot = { ...existingInvoice };
        const versions = [...(existingInvoice.versions || [])];
        versions.push({
          versionNumber: versions.length + 1,
          editedAt: new Date(),
          editNote: "",
          snapshot: prevSnapshot,
        });
        invData.versions = versions;
        await db.invoices.update(existingInvoice.id, invData);
        toast({ title: "Invoice updated" });
      } else {
        await db.invoices.add(invData);
        await incrementInvoiceNumber();
        toast({ title: "Invoice created" });
      }

      setLocation("/invoices");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAndDownload() {
    if (!buyer.name.trim()) {
      toast({ title: "Buyer name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const invData: Omit<Invoice, "id"> = {
        invoiceNumber,
        invoiceDate: new Date(invoiceDate),
        buyer,
        items: calculatedItems,
        subtotal,
        cgstTotal,
        sgstTotal,
        igstTotal,
        taxTotal,
        otherCharges,
        otherChargesLabel,
        totalAmount,
        totalInWords,
        isIGST,
        placeOfSupply,
        status: "finalized",
        transportMode,
        vehicleNumber: "",
        deliveryNote,
        suppliersRef,
        otherRef: "",
        buyersOrderNo,
        despatchThrough,
        destination,
        billOfLadingNo,
        motorVehicleNo,
        createdAt: existingInvoice?.createdAt || new Date(),
        updatedAt: new Date(),
        versions: existingInvoice?.versions || [],
      };

      let savedInv: Invoice;
      if (mode === "edit" && existingInvoice?.id) {
        await db.invoices.update(existingInvoice.id, invData);
        savedInv = { ...invData, id: existingInvoice.id };
      } else {
        const id = await db.invoices.add(invData);
        await incrementInvoiceNumber();
        savedInv = { ...invData, id };
      }

      await generateInvoicePDF(savedInv);
      setLocation("/invoices");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/invoices")} className="h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{mode === "create" ? "New Invoice" : "Edit Invoice"}</h1>
          <p className="text-slate-500 text-sm">{invoiceNumber}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          {/* Invoice Header */}
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Invoice Details</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-slate-600">Invoice Number</Label>
                <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className="font-mono" data-testid="input-invoice-number" />
              </div>
              <div>
                <Label className="text-xs text-slate-600">Invoice Date</Label>
                <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} data-testid="input-invoice-date" />
              </div>
              <div>
                <Label className="text-xs text-slate-600">Place of Supply</Label>
                <Input value={placeOfSupply} onChange={(e) => setPlaceOfSupply(e.target.value)} data-testid="input-place-of-supply" />
              </div>
              <div className="flex items-center gap-3 pt-5">
                <Switch checked={isIGST} onCheckedChange={setIsIGST} data-testid="switch-igst" />
                <Label className="text-sm cursor-pointer" onClick={() => setIsIGST(!isIGST)}>
                  Apply IGST (inter-state)
                </Label>
              </div>
            </CardContent>
          </Card>

          {/* Buyer */}
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Buyer Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs text-slate-600">Select Saved Buyer</Label>
                <Popover open={buyerOpen} onOpenChange={setBuyerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between font-normal"
                      data-testid="button-select-buyer"
                    >
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
                          <CommandItem
                            key={c.id}
                            value={c.name}
                            onSelect={() => {
                              setSelectedBuyer(c);
                              setManualBuyer(c);
                              setBuyerOpen(false);
                            }}
                          >
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
                  <Input
                    value={manualBuyer.name}
                    onChange={(e) => {
                      setSelectedBuyer(null);
                      setManualBuyer({ ...manualBuyer, name: e.target.value });
                    }}
                    placeholder="PAREKH PLAST INDIA LIMITED"
                    data-testid="input-buyer-name"
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-slate-600">Address</Label>
                  <Input
                    value={manualBuyer.address}
                    onChange={(e) => setManualBuyer({ ...manualBuyer, address: e.target.value })}
                    placeholder="49/A AND B, IDA PHASE II, PATANCHERU"
                    data-testid="input-buyer-address"
                  />
                </div>
                <div>
                  <Label className="text-xs text-slate-600">GST Number</Label>
                  <Input
                    value={manualBuyer.gstNumber}
                    onChange={(e) => setManualBuyer({ ...manualBuyer, gstNumber: e.target.value.toUpperCase() })}
                    placeholder="36AABCP4523B1ZX"
                    data-testid="input-buyer-gst"
                  />
                </div>
                <div>
                  <Label className="text-xs text-slate-600">State</Label>
                  <Input
                    value={manualBuyer.state}
                    onChange={(e) => setManualBuyer({ ...manualBuyer, state: e.target.value.toUpperCase() })}
                    placeholder="TELANGANA"
                    data-testid="input-buyer-state"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Items */}
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Items</CardTitle>
                <Button variant="outline" size="sm" onClick={addItem} className="gap-1 text-xs" data-testid="button-add-item">
                  <Plus className="h-3 w-3" /> Add Item
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {items.map((item, idx) => (
                  <div key={idx} className="border border-slate-200 rounded-lg p-4 space-y-3 relative" data-testid={`item-row-${idx}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-400 uppercase">Item {idx + 1}</span>
                      {items.length > 1 && (
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-red-400 hover:text-red-600" onClick={() => removeItem(idx)} data-testid={`button-remove-item-${idx}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>

                    {/* Product selector */}
                    <div>
                      <Label className="text-xs text-slate-600">Select from catalog</Label>
                      <Select onValueChange={(val) => {
                        const prod = products.find((p) => String(p.id) === val);
                        if (prod) selectProduct(idx, prod);
                      }}>
                        <SelectTrigger className="text-sm" data-testid={`select-product-${idx}`}>
                          <SelectValue placeholder="Select product..." />
                        </SelectTrigger>
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
                        <Input
                          value={item.productName}
                          onChange={(e) => updateItem(idx, { productName: e.target.value })}
                          placeholder="HDPE WOVEN SACK"
                          data-testid={`input-product-name-${idx}`}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-600">Description / Size <span className="text-slate-400">(Enter for new line)</span></Label>
                        <Textarea
                          value={item.description}
                          onChange={(e) => updateItem(idx, { description: e.target.value })}
                          placeholder={"SIZE: 36x50\n2x500"}
                          rows={2}
                          className="resize-none text-sm"
                          data-testid={`input-item-desc-${idx}`}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-600">HSN/SAC Code</Label>
                        <Input
                          value={item.hsnCode}
                          onChange={(e) => updateItem(idx, { hsnCode: e.target.value })}
                          placeholder="39232990"
                          data-testid={`input-item-hsn-${idx}`}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-600">GST %</Label>
                        <Select value={String(item.gstPercent)} onValueChange={(v) => updateItem(idx, { gstPercent: Number(v) })}>
                          <SelectTrigger data-testid={`select-item-gst-${idx}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="5">5%</SelectItem>
                            <SelectItem value="12">12%</SelectItem>
                            <SelectItem value="18">18%</SelectItem>
                            <SelectItem value="28">28%</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs text-slate-600">Quantity</Label>
                        <Input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })}
                          data-testid={`input-item-qty-${idx}`}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-600">Rate (₹)</Label>
                        <Input
                          type="number"
                          value={item.rate}
                          onChange={(e) => updateItem(idx, { rate: Number(e.target.value) })}
                          data-testid={`input-item-rate-${idx}`}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-600">Unit</Label>
                        <Select value={item.unit} onValueChange={(v) => updateItem(idx, { unit: v })}>
                          <SelectTrigger data-testid={`select-item-unit-${idx}`}>
                            <SelectValue />
                          </SelectTrigger>
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
                        <div className="h-9 flex items-center px-3 border border-slate-200 rounded-md bg-slate-50 text-sm font-semibold text-slate-900">
                          ₹{formatCurrency(item.amount)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Transport */}
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Transport & Reference</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Despatch Through</Label>
                <Input value={despatchThrough} onChange={(e) => setDespatchThrough(e.target.value)} placeholder="BY ROAD" data-testid="input-despatch-through" />
              </div>
              <div>
                <Label className="text-xs">Destination</Label>
                <Input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="PATANCHERU" data-testid="input-destination" />
              </div>
              <div>
                <Label className="text-xs">Motor Vehicle No.</Label>
                <Input value={motorVehicleNo} onChange={(e) => setMotorVehicleNo(e.target.value)} placeholder="TS09AB1234" data-testid="input-motor-vehicle-no" />
              </div>
              <div>
                <Label className="text-xs">Bill of Lading / LR-RR No.</Label>
                <Input value={billOfLadingNo} onChange={(e) => setBillOfLadingNo(e.target.value)} placeholder="LR-001" data-testid="input-bill-of-lading" />
              </div>
              <div>
                <Label className="text-xs">Delivery Note</Label>
                <Input value={deliveryNote} onChange={(e) => setDeliveryNote(e.target.value)} placeholder="DN-001" data-testid="input-delivery-note" />
              </div>
              <div>
                <Label className="text-xs">Supplier's Ref.</Label>
                <Input value={suppliersRef} onChange={(e) => setSuppliersRef(e.target.value)} placeholder="Other References" data-testid="input-suppliers-ref" />
              </div>
              <div>
                <Label className="text-xs">Buyer's Order No.</Label>
                <Input value={buyersOrderNo} onChange={(e) => setBuyersOrderNo(e.target.value)} data-testid="input-buyers-order-no" />
              </div>
              <div>
                <Label className="text-xs">Other Charges Label</Label>
                <Input value={otherChargesLabel} onChange={(e) => setOtherChargesLabel(e.target.value)} placeholder="FRIGHT" data-testid="input-other-charges-label" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Summary sidebar */}
        <div className="space-y-4">
          <Card className="border-slate-200 sticky top-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Subtotal</span>
                  <span className="font-medium">₹{formatCurrency(subtotal)}</span>
                </div>
                {!isIGST ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-slate-500">CGST (9%)</span>
                      <span>₹{formatCurrency(cgstTotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">SGST (9%)</span>
                      <span>₹{formatCurrency(sgstTotal)}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between">
                    <span className="text-slate-500">IGST (18%)</span>
                    <span>₹{formatCurrency(igstTotal)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500">Tax Total</span>
                  <span>₹{formatCurrency(taxTotal)}</span>
                </div>
              </div>

              <div>
                <Label className="text-xs">Other Charges (₹)</Label>
                <Input
                  type="number"
                  value={otherCharges}
                  onChange={(e) => setOtherCharges(Number(e.target.value))}
                  data-testid="input-other-charges"
                />
              </div>

              <Separator />

              <div className="flex justify-between text-base font-bold text-slate-900">
                <span>Total Payable</span>
                <span>₹{formatCurrency(totalAmount)}</span>
              </div>

              <p className="text-xs text-slate-500 italic leading-relaxed">{totalInWords}</p>

              <div className="space-y-2 pt-2">
                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                  onClick={() => handleSave("finalized")}
                  disabled={saving}
                  data-testid="button-finalize"
                >
                  <Save className="h-4 w-4" />
                  Finalize Invoice
                </Button>
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => handleSave("draft")}
                  disabled={saving}
                  data-testid="button-save-draft"
                >
                  Save as Draft
                </Button>
                <Button
                  variant="outline"
                  className="w-full text-blue-600 border-blue-200 hover:bg-blue-50 gap-2"
                  onClick={handleSaveAndDownload}
                  disabled={saving}
                  data-testid="button-save-download"
                >
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
