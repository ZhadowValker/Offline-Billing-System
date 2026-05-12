import { useState, useEffect } from "react";
import { db, getSettings, type Settings } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Save, Building2, CreditCard, FileText, RefreshCw, Github, Upload, Download, CheckCircle, XCircle, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { verifyGitHubConfig, pushAllToGitHub, pullAllFromGitHub } from "@/lib/github";

export default function SettingsPage() {
  const { toast } = useToast();
  const [form, setForm] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPat, setShowPat] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState<boolean | null>(null);
  const [syncing, setSyncing] = useState<"push" | "pull" | null>(null);

  useEffect(() => {
    getSettings().then((s) => {
      setForm(s);
      setLoading(false);
    });
  }, []);

  async function handleSave() {
    if (!form) return;
    setSaving(true);
    try {
      if (form.id !== undefined) {
        const { id, ...rest } = form;
        await db.settings.update(id, rest);
        toast({ title: "Settings saved" });
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleResetInvoiceCounter() {
    if (!form) return;
    const confirmed = window.confirm("Reset invoice counter to 1? This won't delete existing invoices.");
    if (confirmed && form.id !== undefined) {
      await db.settings.update(form.id, { nextInvoiceNumber: 1 });
      setForm({ ...form, nextInvoiceNumber: 1 });
      toast({ title: "Counter reset to 1" });
    }
  }

  async function handleVerify() {
    if (!form?.githubPat || !form?.githubRepo) {
      toast({ title: "Enter PAT and repo name first", variant: "destructive" });
      return;
    }
    setVerifying(true);
    setVerified(null);
    const result = await verifyGitHubConfig(form.githubPat, form.githubRepo);
    setVerified(result.success);
    if (result.success) {
      toast({ title: "GitHub connected successfully!" });
      // Save after successful verify
      if (form.id !== undefined) {
        const { id, ...rest } = form;
        await db.settings.update(id, rest);
      }
    } else {
      toast({ title: result.error || "Connection failed", variant: "destructive" });
    }
    setVerifying(false);
  }

  async function handlePush() {
    setSyncing("push");
    const result = await pushAllToGitHub();
    if (result.success) {
      toast({ title: `✓ Pushed to GitHub: ${result.summary}` });
    } else {
      toast({ title: result.error || "Sync failed", variant: "destructive" });
    }
    setSyncing(null);
  }

  async function handlePull() {
    const confirmed = window.confirm("Pull data from GitHub? This will overwrite local data with the GitHub version.");
    if (!confirmed) return;
    setSyncing("pull");
    const result = await pullAllFromGitHub();
    if (result.success) {
      toast({ title: `✓ Pulled: ${result.invoices} invoices, ${result.customers} customers, ${result.products} products` });
    } else {
      toast({ title: result.error || "Pull failed", variant: "destructive" });
    }
    setSyncing(null);
  }

  if (loading || !form) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
          <p className="text-slate-500 text-sm">Configure your company details and billing preferences</p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2" data-testid="button-save-settings">
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : "Save Settings"}
        </Button>
      </div>

      {/* Company */}
      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4 text-emerald-600" />
            Company Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs">Company Name</Label>
            <Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} data-testid="input-company-name" />
          </div>
          <div>
            <Label className="text-xs">Address</Label>
            <textarea
              className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500 h-16"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              data-testid="input-company-address"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">GST Number</Label>
              <Input value={form.gstNumber} onChange={(e) => setForm({ ...form, gstNumber: e.target.value.toUpperCase() })} data-testid="input-company-gst" />
            </div>
            <div>
              <Label className="text-xs">State Code</Label>
              <Input value={form.stateCode} onChange={(e) => setForm({ ...form, stateCode: e.target.value })} data-testid="input-company-state-code" />
            </div>
            <div>
              <Label className="text-xs">State</Label>
              <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })} data-testid="input-company-state" />
            </div>
            <div>
              <Label className="text-xs">Place of Supply</Label>
              <Input value={form.placeOfSupply} onChange={(e) => setForm({ ...form, placeOfSupply: e.target.value.toUpperCase() })} data-testid="input-company-place-of-supply" />
            </div>
            <div>
              <Label className="text-xs">Contact</Label>
              <Input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} data-testid="input-company-contact" />
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="input-company-email" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bank */}
      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-emerald-600" />
            Bank Details
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Bank Name</Label>
            <Input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} data-testid="input-bank-name" />
          </div>
          <div>
            <Label className="text-xs">Account Number</Label>
            <Input value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} data-testid="input-account-number" />
          </div>
          <div>
            <Label className="text-xs">IFSC Code</Label>
            <Input value={form.ifscCode} onChange={(e) => setForm({ ...form, ifscCode: e.target.value.toUpperCase() })} data-testid="input-ifsc-code" />
          </div>
          <div>
            <Label className="text-xs">Branch Name</Label>
            <Input value={form.branchName} onChange={(e) => setForm({ ...form, branchName: e.target.value })} data-testid="input-branch-name" />
          </div>
        </CardContent>
      </Card>

      {/* Invoice settings */}
      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-emerald-600" />
            Invoice Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Invoice Prefix</Label>
              <Input value={form.invoicePrefix} onChange={(e) => setForm({ ...form, invoicePrefix: e.target.value })} placeholder="BP" data-testid="input-invoice-prefix" />
            </div>
            <div>
              <Label className="text-xs">Next Invoice Number</Label>
              <Input
                type="number"
                value={form.nextInvoiceNumber}
                onChange={(e) => setForm({ ...form, nextInvoiceNumber: Number(e.target.value) })}
                data-testid="input-next-invoice-number"
              />
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Next invoice will be: <span className="font-semibold text-slate-700">{form.invoicePrefix}-{new Date().getFullYear()}-{String(form.nextInvoiceNumber).padStart(4, "0")}</span>
          </p>
          <Separator />
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">CGST Rate %</Label>
              <Input type="number" value={form.cgstRate} onChange={(e) => setForm({ ...form, cgstRate: Number(e.target.value) })} data-testid="input-cgst-rate" />
            </div>
            <div>
              <Label className="text-xs">SGST Rate %</Label>
              <Input type="number" value={form.sgstRate} onChange={(e) => setForm({ ...form, sgstRate: Number(e.target.value) })} data-testid="input-sgst-rate" />
            </div>
            <div>
              <Label className="text-xs">IGST Rate %</Label>
              <Input type="number" value={form.igstRate} onChange={(e) => setForm({ ...form, igstRate: Number(e.target.value) })} data-testid="input-igst-rate" />
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetInvoiceCounter}
            className="gap-2 text-orange-600 border-orange-200 hover:bg-orange-50"
            data-testid="button-reset-counter"
          >
            <RefreshCw className="h-3 w-3" />
            Reset Invoice Counter to 1
          </Button>
        </CardContent>
      </Card>

      {/* GitHub Sync */}
      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Github className="h-4 w-4 text-emerald-600" />
            GitHub Sync
            <span className="text-xs font-normal text-slate-400 ml-1">— backup & multi-device</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-600 space-y-1">
            <p>📦 Data is stored as JSON files in your private GitHub repo</p>
            <p>🔄 Every invoice save auto-syncs to GitHub</p>
            <p>📱 Open on any device → pull to get latest data</p>
          </div>

          <div>
            <Label className="text-xs">GitHub Repo <span className="text-slate-400">(owner/repo-name)</span></Label>
            <Input
              value={form.githubRepo || ""}
              onChange={(e) => { setForm({ ...form, githubRepo: e.target.value }); setVerified(null); }}
              placeholder="ZhadowValker/blessy-billing-data"
              data-testid="input-github-repo"
            />
          </div>

          <div>
            <Label className="text-xs">Personal Access Token (PAT)</Label>
            <div className="relative">
              <Input
                type={showPat ? "text" : "password"}
                value={form.githubPat || ""}
                onChange={(e) => { setForm({ ...form, githubPat: e.target.value }); setVerified(null); }}
                placeholder="github_pat_••••••••••••"
                className="pr-10"
                data-testid="input-github-pat"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                onClick={() => setShowPat(!showPat)}
              >
                {showPat ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-1">Fine-grained PAT with Contents: Read & Write on the data repo</p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleVerify}
              disabled={verifying}
              className="gap-2"
              data-testid="button-verify-github"
            >
              {verifying ? (
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-slate-600" />
              ) : verified === true ? (
                <CheckCircle className="h-3 w-3 text-emerald-600" />
              ) : verified === false ? (
                <XCircle className="h-3 w-3 text-red-500" />
              ) : (
                <Github className="h-3 w-3" />
              )}
              {verifying ? "Verifying..." : "Test Connection"}
            </Button>
            {verified === true && <span className="text-xs text-emerald-600 font-medium">✓ Connected</span>}
            {verified === false && <span className="text-xs text-red-500">Connection failed</span>}
          </div>

          <Separator />

          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-600">Manual Sync</p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePush}
                disabled={syncing !== null || !form.githubPat || !form.githubRepo}
                className="gap-2 flex-1"
                data-testid="button-push-github"
              >
                {syncing === "push" ? (
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-slate-600" />
                ) : (
                  <Upload className="h-3 w-3" />
                )}
                {syncing === "push" ? "Pushing..." : "Push to GitHub"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePull}
                disabled={syncing !== null || !form.githubPat || !form.githubRepo}
                className="gap-2 flex-1"
                data-testid="button-pull-github"
              >
                {syncing === "pull" ? (
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-slate-600" />
                ) : (
                  <Download className="h-3 w-3" />
                )}
                {syncing === "pull" ? "Pulling..." : "Pull from GitHub"}
              </Button>
            </div>
            <p className="text-xs text-slate-400">Push = local → GitHub &nbsp;|&nbsp; Pull = GitHub → local (overwrites local)</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
