import { useState, useEffect } from "react";
import { db, type Customer } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Plus, Search, Users, Edit, Trash2, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";

const emptyCustomer: Omit<Customer, "id" | "createdAt"> = {
  name: "",
  address: "",
  gstNumber: "",
  state: "",
  stateCode: "",
  contact: "",
  email: "",
};

export default function Customers() {
  const { toast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<Omit<Customer, "id" | "createdAt">>(emptyCustomer);
  const [editId, setEditId] = useState<number | null>(null);

  async function load() {
    const custs = await db.customers.orderBy("name").toArray();
    setCustomers(custs);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || c.gstNumber.toLowerCase().includes(q) || c.state.toLowerCase().includes(q);
  });

  function openNew() {
    setForm(emptyCustomer);
    setEditId(null);
    setDialogOpen(true);
  }

  function openEdit(c: Customer) {
    setForm({
      name: c.name,
      address: c.address,
      gstNumber: c.gstNumber,
      state: c.state,
      stateCode: c.stateCode,
      contact: c.contact,
      email: c.email,
    });
    setEditId(c.id!);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    if (editId !== null) {
      await db.customers.update(editId, form);
      toast({ title: "Customer updated" });
    } else {
      await db.customers.add({ ...form, createdAt: new Date() });
      toast({ title: "Customer added" });
    }
    setDialogOpen(false);
    load();
  }

  async function handleDelete() {
    if (deleteId !== null) {
      await db.customers.delete(deleteId);
      setDeleteId(null);
      toast({ title: "Customer deleted" });
      load();
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Customers</h1>
          <p className="text-slate-500 text-sm mt-0.5">{customers.length} saved buyers</p>
        </div>
        <Button onClick={openNew} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2" data-testid="button-add-customer">
          <Plus className="h-4 w-4" />
          Add Customer
        </Button>
      </div>

      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search customers..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search-customer"
            />
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No customers found</p>
              <Button size="sm" className="mt-3 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={openNew}>
                Add Customer
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filtered.map((c) => (
                <div
                  key={c.id}
                  className="border border-slate-200 rounded-lg p-4 hover:border-emerald-300 transition-colors group"
                  data-testid={`card-customer-${c.id}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-emerald-50 rounded-md">
                        <Building2 className="h-4 w-4 text-emerald-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900 text-sm">{c.name}</p>
                        <p className="text-xs text-slate-500">{c.gstNumber || "No GST"}</p>
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-slate-400 hover:text-slate-700"
                        onClick={() => openEdit(c)}
                        data-testid={`button-edit-customer-${c.id}`}
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-slate-400 hover:text-red-600"
                        onClick={() => setDeleteId(c.id!)}
                        data-testid={`button-delete-customer-${c.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1">
                    {c.address && <p className="text-xs text-slate-500 line-clamp-2">{c.address}</p>}
                    {c.state && <p className="text-xs text-slate-400">{c.state} {c.stateCode && `(${c.stateCode})`}</p>}
                    {c.contact && <p className="text-xs text-slate-400">{c.contact}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Customer" : "Add Customer"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Company Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="PAREKH PLAST INDIA LIMITED"
                data-testid="input-customer-name"
              />
            </div>
            <div>
              <Label className="text-xs">GST Number</Label>
              <Input
                value={form.gstNumber}
                onChange={(e) => setForm({ ...form, gstNumber: e.target.value.toUpperCase() })}
                placeholder="36AABCP4523B1ZX"
                data-testid="input-customer-gst"
              />
            </div>
            <div>
              <Label className="text-xs">Address</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="49/A AND B, IDA PHASE II, PATANCHERU"
                data-testid="input-customer-address"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">State</Label>
                <Input
                  value={form.state}
                  onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })}
                  placeholder="TELANGANA"
                  data-testid="input-customer-state"
                />
              </div>
              <div>
                <Label className="text-xs">State Code</Label>
                <Input
                  value={form.stateCode}
                  onChange={(e) => setForm({ ...form, stateCode: e.target.value })}
                  placeholder="36"
                  data-testid="input-customer-state-code"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Contact</Label>
              <Input
                value={form.contact}
                onChange={(e) => setForm({ ...form, contact: e.target.value })}
                placeholder="+91 9999999999"
                data-testid="input-customer-contact"
              />
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="buyer@company.com"
                data-testid="input-customer-email"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="button-save-customer">
              {editId ? "Update" : "Add"} Customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Customer?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone.
            </AlertDialogDescription>
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
