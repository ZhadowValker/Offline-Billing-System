import { useState, useEffect } from "react";
import { db, type Product } from "@/lib/db";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Package, Edit, Trash2, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";

const emptyProduct: Omit<Product, "id" | "createdAt"> = {
  name: "",
  category: "HDPE Woven Sack",
  size: "",
  hsnCode: "39232990",
  defaultRate: 0,
  gstPercent: 18,
  unit: "NOS",
};

export default function Products() {
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<Omit<Product, "id" | "createdAt">>(emptyProduct);
  const [editId, setEditId] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);

  async function importFromInvoices() {
    setImporting(true);
    try {
      const invoices = await db.invoices.toArray();
      const existing = await db.products.toArray();
      const existingNames = new Set(existing.map((p) => p.name.trim().toUpperCase()));
      let added = 0;
      const seen = new Set<string>();
      for (const inv of invoices) {
        for (const item of inv.items || []) {
          const key = item.productName.trim().toUpperCase();
          if (!existingNames.has(key) && !seen.has(key)) {
            seen.add(key);
            await db.products.add({
              name: item.productName,
              category: "Woven Sack",
              size: item.description || "",
              hsnCode: item.hsnCode || "",
              defaultRate: item.rate || 0,
              gstPercent: item.gstPercent || 18,
              unit: item.unit || "NOS",
              createdAt: new Date(),
            });
            added++;
          }
        }
      }
      toast({ title: added > 0 ? `Imported ${added} product${added > 1 ? "s" : ""} from invoices` : "All invoice products already exist" });
      load();
    } finally {
      setImporting(false);
    }
  }

  async function load() {
    const prods = await db.products.orderBy("name").toArray();
    setProducts(prods);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = products.filter((p) => {
    const q = search.toLowerCase();
    return !q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) || p.hsnCode.includes(q);
  });

  function openNew() {
    setForm(emptyProduct);
    setEditId(null);
    setDialogOpen(true);
  }

  function openEdit(p: Product) {
    setForm({
      name: p.name,
      category: p.category,
      size: p.size,
      hsnCode: p.hsnCode,
      defaultRate: p.defaultRate,
      gstPercent: p.gstPercent,
      unit: p.unit,
    });
    setEditId(p.id!);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast({ title: "Product name is required", variant: "destructive" });
      return;
    }
    if (editId !== null) {
      await db.products.update(editId, form);
      toast({ title: "Product updated" });
    } else {
      await db.products.add({ ...form, createdAt: new Date() });
      toast({ title: "Product added" });
    }
    setDialogOpen(false);
    load();
  }

  async function handleDelete() {
    if (deleteId !== null) {
      await db.products.delete(deleteId);
      setDeleteId(null);
      toast({ title: "Product deleted" });
      load();
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Products</h1>
          <p className="text-slate-500 text-sm mt-0.5">{products.length} items in catalog</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={importFromInvoices}
            disabled={importing}
            className="gap-2 text-xs"
            data-testid="button-import-products"
          >
            <Download className="h-3.5 w-3.5" />
            {importing ? "Importing..." : "Import from Invoices"}
          </Button>
          <Button onClick={openNew} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2" data-testid="button-add-product">
            <Plus className="h-4 w-4" />
            Add Product
          </Button>
        </div>
      </div>

      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search products..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search-product"
            />
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No products found</p>
              <Button size="sm" className="mt-3 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={openNew}>
                Add Product
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Product</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">HSN/SAC</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Size</th>
                    <th className="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Rate</th>
                    <th className="text-center py-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">GST%</th>
                    <th className="text-center py-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Unit</th>
                    <th className="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors" data-testid={`row-product-${p.id}`}>
                      <td className="py-3 px-3">
                        <div>
                          <p className="font-semibold text-slate-900">{p.name}</p>
                          <p className="text-xs text-slate-400">{p.category}</p>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-600 font-mono text-xs">{p.hsnCode}</td>
                      <td className="py-3 px-3 text-slate-600">{p.size || "—"}</td>
                      <td className="py-3 px-3 text-right font-semibold text-slate-900">₹{formatCurrency(p.defaultRate)}</td>
                      <td className="py-3 px-3 text-center text-slate-600">{p.gstPercent}%</td>
                      <td className="py-3 px-3 text-center text-slate-600">{p.unit}</td>
                      <td className="py-3 px-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-700" onClick={() => openEdit(p)} data-testid={`button-edit-product-${p.id}`}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-600" onClick={() => setDeleteId(p.id!)} data-testid={`button-delete-product-${p.id}`}>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Product" : "Add Product"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Product Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="HDPE WOVEN SACK" data-testid="input-product-name" />
            </div>
            <div>
              <Label className="text-xs">Category</Label>
              <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="HDPE Woven Sack" data-testid="input-product-category" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Size</Label>
                <Input value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} placeholder="36x50" data-testid="input-product-size" />
              </div>
              <div>
                <Label className="text-xs">HSN/SAC Code</Label>
                <Input value={form.hsnCode} onChange={(e) => setForm({ ...form, hsnCode: e.target.value })} placeholder="39232990" data-testid="input-product-hsn" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Default Rate (₹)</Label>
                <Input type="number" value={form.defaultRate} onChange={(e) => setForm({ ...form, defaultRate: Number(e.target.value) })} placeholder="43" data-testid="input-product-rate" />
              </div>
              <div>
                <Label className="text-xs">GST %</Label>
                <Select value={String(form.gstPercent)} onValueChange={(v) => setForm({ ...form, gstPercent: Number(v) })}>
                  <SelectTrigger data-testid="select-product-gst">
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
            </div>
            <div>
              <Label className="text-xs">Unit</Label>
              <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                <SelectTrigger data-testid="select-product-unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NOS">NOS</SelectItem>
                  <SelectItem value="KGS">KGS</SelectItem>
                  <SelectItem value="MTR">MTR</SelectItem>
                  <SelectItem value="PCS">PCS</SelectItem>
                  <SelectItem value="BOX">BOX</SelectItem>
                  <SelectItem value="BAG">BAG</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="button-save-product">
              {editId ? "Update" : "Add"} Product
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
