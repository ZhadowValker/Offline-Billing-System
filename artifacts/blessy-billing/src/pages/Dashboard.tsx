import { useState, useEffect } from "react";
import { Link } from "wouter";
import { db, type Invoice } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  FileText,
  Users,
  IndianRupee,
  Plus,
  ArrowRight,
  Clock,
  CheckCircle2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export default function Dashboard() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customerCount, setCustomerCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [invs, custs] = await Promise.all([
        db.invoices.orderBy("invoiceDate").reverse().limit(50).toArray(),
        db.customers.count(),
      ]);
      setInvoices(invs);
      setCustomerCount(custs);
      setLoading(false);
    }
    load();
  }, []);

  const totalRevenue = invoices.reduce((s, i) => s + i.totalAmount, 0);
  const totalGST = invoices.reduce((s, i) => s + i.taxTotal, 0);
  const finalizedCount = invoices.filter((i) => i.status === "finalized").length;
  const draftCount = invoices.filter((i) => i.status === "draft").length;

  const now = new Date();
  const thisMonth = invoices.filter((i) => {
    const d = new Date(i.invoiceDate);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const monthRevenue = thisMonth.reduce((s, i) => s + i.totalAmount, 0);

  const monthlyData: Record<string, number> = {};
  invoices.forEach((inv) => {
    const d = new Date(inv.invoiceDate);
    const key = d.toLocaleString("en-IN", { month: "short", year: "2-digit" });
    monthlyData[key] = (monthlyData[key] || 0) + inv.totalAmount;
  });
  const chartData = Object.entries(monthlyData)
    .slice(-6)
    .map(([month, amount]) => ({ month, amount }));

  const recent = invoices.slice(0, 8);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-0.5">Welcome back, Blessy Packagings</p>
        </div>
        <Link href="/invoices/new">
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2" data-testid="button-new-invoice">
            <Plus className="h-4 w-4" />
            New Invoice
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-slate-200">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Total Revenue</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">₹{formatCurrency(totalRevenue)}</p>
                <p className="text-xs text-emerald-600 mt-1">{invoices.length} invoices</p>
              </div>
              <div className="p-2 bg-emerald-50 rounded-lg">
                <IndianRupee className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">This Month</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">₹{formatCurrency(monthRevenue)}</p>
                <p className="text-xs text-blue-600 mt-1">{thisMonth.length} invoices</p>
              </div>
              <div className="p-2 bg-blue-50 rounded-lg">
                <TrendingUp className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Total GST</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">₹{formatCurrency(totalGST)}</p>
                <p className="text-xs text-orange-600 mt-1">collected</p>
              </div>
              <div className="p-2 bg-orange-50 rounded-lg">
                <FileText className="h-5 w-5 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Customers</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{customerCount}</p>
                <p className="text-xs text-purple-600 mt-1">saved buyers</p>
              </div>
              <div className="p-2 bg-purple-50 rounded-lg">
                <Users className="h-5 w-5 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-slate-900">Monthly Sales</CardTitle>
            </CardHeader>
            <CardContent>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      formatter={(v: number) => [`₹${formatCurrency(v)}`, "Amount"]}
                      contentStyle={{ border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 12 }}
                    />
                    <Bar dataKey="amount" fill="#059669" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
                  No invoice data yet. Create your first invoice!
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-slate-900">Status Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm font-medium text-emerald-800">Finalized</span>
                </div>
                <span className="text-lg font-bold text-emerald-700">{finalizedCount}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-600" />
                  <span className="text-sm font-medium text-amber-800">Drafts</span>
                </div>
                <span className="text-lg font-bold text-amber-700">{draftCount}</span>
              </div>
              <Link href="/invoices">
                <Button variant="outline" className="w-full mt-2 text-sm gap-1" data-testid="link-all-invoices">
                  View All Invoices <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold text-slate-900">Recent Invoices</CardTitle>
            <Link href="/invoices">
              <Button variant="ghost" size="sm" className="text-emerald-600 hover:text-emerald-700 text-xs gap-1">
                View all <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No invoices yet</p>
              <Link href="/invoices/new">
                <Button size="sm" className="mt-3 bg-emerald-600 hover:bg-emerald-700 text-white">
                  Create First Invoice
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {recent.map((inv) => (
                <Link key={inv.id} href={`/invoices/${inv.id}`}>
                  <div
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-all cursor-pointer"
                    data-testid={`row-invoice-${inv.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-emerald-50 rounded-md">
                        <FileText className="h-4 w-4 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{inv.invoiceNumber}</p>
                        <p className="text-xs text-slate-500">{inv.buyer.name} · {formatDate(inv.invoiceDate)}</p>
                      </div>
                    </div>
                    <div className="text-right flex items-center gap-3">
                      <div>
                        <p className="text-sm font-bold text-slate-900">₹{formatCurrency(inv.totalAmount)}</p>
                      </div>
                      <Badge
                        variant={inv.status === "finalized" ? "default" : "secondary"}
                        className={inv.status === "finalized" ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" : "bg-amber-100 text-amber-700 hover:bg-amber-100"}
                      >
                        {inv.status}
                      </Badge>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
