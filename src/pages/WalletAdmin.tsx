import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Loader2, Wallet, BadgeCheck, XCircle, Banknote } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface Payout {
  id: string;
  user_id: string;
  amount: number;
  method: string;
  account_details: string;
  status: string;
  admin_note: string | null;
  created_at: string;
}

interface WalletRow {
  user_id: string;
  balance: number;
}

export default function WalletAdmin() {
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [balance, setBalance] = useState(0);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [account, setAccount] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    const id = auth?.user?.id ?? null;
    setUid(id);
    if (!id) {
      setLoading(false);
      return;
    }

    const [{ data: roles }, { data: w }, { data: p }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", id),
      supabase.from("wallets").select("balance").eq("user_id", id).maybeSingle(),
      supabase
        .from("payouts")
        .select("id,user_id,amount,method,account_details,status,admin_note,created_at")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    const admin = (roles ?? []).some((r) => r.role === "admin");
    setIsAdmin(admin);
    setBalance(Number(w?.balance ?? 0));
    const list = (p ?? []) as unknown as Payout[];
    setPayouts(list);

    if (admin) {
      const { data: allW } = await supabase
        .from("wallets")
        .select("user_id,balance")
        .order("balance", { ascending: false })
        .limit(200);
      setWallets((allW ?? []) as unknown as WalletRow[]);
      const ids = Array.from(
        new Set([...(allW ?? []).map((x) => x.user_id), ...list.map((x) => x.user_id)]),
      );
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id,display_name,username")
          .in("id", ids);
        const map: Record<string, string> = {};
        for (const pr of profs ?? []) map[pr.id] = pr.display_name || pr.username;
        setNames(map);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const requestPayout = async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("أدخل مبلغًا صحيحًا");
      return;
    }
    if (amt > balance) {
      toast.error("المبلغ أكبر من رصيدك المتاح");
      return;
    }
    if (account.trim().length < 3) {
      toast.error("أدخل تفاصيل الحساب الخارجي");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("request_payout", {
      p_amount: amt,
      p_method: method.trim() || "manual",
      p_account_details: account.trim(),
    } as never);
    setBusy(false);
    if (error) {
      toast.error("تعذّر إرسال طلب السحب");
      return;
    }
    toast.success("تم إرسال طلب السحب بنجاح وخُصم المبلغ من رصيدك.");
    setAmount("");
    setAccount("");
    await load();
  };

  const settle = async (id: string, status: "paid" | "rejected") => {
    const { error } = await supabase.rpc("settle_payout", {
      p_payout_id: id,
      p_status: status,
      p_note: null,
    } as never);
    if (error) {
      toast.error("تعذّر تحديث حالة الطلب");
      return;
    }
    toast.success(status === "paid" ? "تم تأكيد صرف المبلغ" : "تم رفض الطلب وإعادة المبلغ");
    await load();
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!uid) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-xl font-bold">سجّل الدخول للوصول إلى محفظتك</h1>
        <Button asChild variant="outline">
          <Link to="/auth">تسجيل الدخول</Link>
        </Button>
      </div>
    );
  }

  const totalAll = wallets.reduce((s, w) => s + Number(w.balance), 0);

  return (
    <main dir="rtl" className="mx-auto w-full max-w-3xl space-y-6 p-4 pb-16">
      <header className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <Link to="/" aria-label="رجوع">
            <ArrowRight className="h-5 w-5" />
          </Link>
        </Button>
        <h1 className="text-xl font-bold">المحفظة والسحب</h1>
      </header>

      <section className="rounded-xl border bg-card p-4 space-y-1">
        <div className="flex items-center gap-2 font-semibold">
          <Wallet className="h-4 w-4" /> إجمالي رصيدك
        </div>
        <div className="text-3xl font-bold text-primary tabular-nums">{balance.toFixed(4)}</div>
        <p className="text-xs text-muted-foreground">
          الأرباح المعروضة تقديرية وقد تتغير بعد التسويات والتحقق من النشاط الصالح.
        </p>
      </section>

      <section className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2 font-semibold">
          <Banknote className="h-4 w-4" /> سحب الأرباح إلى حساب خارجي
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs">المبلغ</Label>
            <Input
              type="number"
              step="0.0001"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">وسيلة الاستلام</Label>
            <Input
              value={method}
              placeholder="محفظة إلكترونية / بنك"
              onChange={(e) => setMethod(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">تفاصيل الحساب</Label>
            <Input
              value={account}
              placeholder="رقم الحساب أو المحفظة"
              onChange={(e) => setAccount(e.target.value)}
            />
          </div>
        </div>
        <Button onClick={requestPayout} disabled={busy} aria-busy={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
          طلب السحب
        </Button>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">طلبات السحب</h2>
        {payouts.length === 0 && (
          <p className="text-sm text-muted-foreground">لا توجد طلبات سحب بعد.</p>
        )}
        {payouts.map((p) => (
          <div key={p.id} className="rounded-xl border bg-card p-3 text-sm space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold tabular-nums">{Number(p.amount).toFixed(4)}</span>
              <span className="text-xs text-muted-foreground">
                {p.status === "pending" ? "قيد المراجعة" : p.status === "paid" ? "تم الصرف" : "مرفوض"}
              </span>
            </div>
            <div className="text-muted-foreground break-all">
              {names[p.user_id] ? `المستخدم: ${names[p.user_id]} · ` : ""}
              {p.method} — {p.account_details}
            </div>
            <div className="text-muted-foreground">{new Date(p.created_at).toLocaleString("ar")}</div>
            {isAdmin && p.status === "pending" && (
              <div className="flex gap-2 pt-1">
                <Button size="sm" onClick={() => settle(p.id, "paid")}>
                  <BadgeCheck className="h-4 w-4" /> تأكيد الصرف
                </Button>
                <Button size="sm" variant="outline" onClick={() => settle(p.id, "rejected")}>
                  <XCircle className="h-4 w-4" /> رفض وإرجاع
                </Button>
              </div>
            )}
          </div>
        ))}
      </section>

      {isAdmin && (
        <section className="space-y-3">
          <h2 className="font-semibold">محافظ الأعضاء (إجمالي {totalAll.toFixed(4)})</h2>
          {wallets.map((w) => (
            <div
              key={w.user_id}
              className="flex items-center justify-between rounded-xl border bg-card p-3 text-sm"
            >
              <span className="break-all">{names[w.user_id] ?? w.user_id}</span>
              <span className="font-bold text-primary tabular-nums">
                {Number(w.balance).toFixed(4)}
              </span>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
