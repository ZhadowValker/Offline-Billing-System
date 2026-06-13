import { useState } from "react";
import { login, verifyPassword, hashPassword, DEFAULT_PASSWORD } from "@/lib/auth";
import { getSettings, db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Lock } from "lucide-react";

interface Props {
  onLogin: () => void;
}

export default function LoginPage({ onLogin }: Props) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError("");

    try {
      const settings = await getSettings();
      let valid = false;

      if (!settings.loginPasswordHash) {
        // First time — no password set yet, use default and save hash
        const defaultHash = await hashPassword(DEFAULT_PASSWORD);
        valid = await verifyPassword(password, defaultHash);
        if (valid && settings.id !== undefined) {
          await db.settings.update(settings.id, { loginPasswordHash: defaultHash });
        }
      } else {
        valid = await verifyPassword(password, settings.loginPasswordHash);
      }

      if (valid) {
        login();
        onLogin();
      } else {
        setError("Incorrect password");
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="h-14 w-14 bg-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-white font-bold text-xl">BP</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Blessy Packagings</h1>
          <p className="text-slate-500 text-sm mt-1">Billing System</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-5">
            <Lock className="h-4 w-4 text-slate-400" />
            <h2 className="text-base font-semibold text-slate-700">Sign in</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label className="text-xs text-slate-600">Password</Label>
              <div className="relative mt-1">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  placeholder="Enter password"
                  className={`pr-10 ${error ? "border-red-400 focus-visible:ring-red-400" : ""}`}
                  autoFocus
                  data-testid="input-password"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
            </div>

            <Button
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={loading || !password}
              data-testid="button-login"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  Signing in...
                </div>
              ) : "Sign In"}
            </Button>
          </form>

          <p className="text-xs text-slate-400 text-center mt-4">
            Default password: <span className="font-mono font-medium text-slate-500">{DEFAULT_PASSWORD}</span>
          </p>
        </div>

        <p className="text-xs text-center text-slate-400 mt-4">
          Change password anytime in Settings
        </p>
      </div>
    </div>
  );
}
