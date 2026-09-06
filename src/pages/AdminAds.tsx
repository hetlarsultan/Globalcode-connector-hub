import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Loader2, Save, Trash2, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

interface Placement {
  id: string;
  ad_type: string;
  label: string;
  gross_value: number;
  reward_rate: number;
  is_active: boolean;
  ad_client: string | null;
  ad_unit_id: string | null;
}

interface RewardTx {
  id: string;
  user_id: string;
  transaction_id: string;
  ad_type: string;
  ad_network: string;
  gross_value: number;
  reward_value: number;
  verification_status: string;
  credit_status: string;
  created_at: string;
}

export default function AdminAds() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [txs, setTxs] = useState<RewardTx[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", uid);
    const admin = (roles ?? []).some((r) => r.role === "admin");
    setIsAdmin(admin);

    const { data: pl } = await supabase
      .from("ad_placements")
      .select("id,ad_type,label,gross_value,reward_rate,is_active,ad_client,ad_unit_id")
      .order("ad_type");
    setPlacements((pl ?? []) as Placement[]);

    if (admin) {
      const { data: tx } = await supabase
        .from("ad_reward_transactions")
        .select(
          "id,user_id,transaction_id,ad_type,ad_network,gross_value,reward_value,verification_status,credit_status,created_at",
        )
        .order("created_at", { ascending: false })
        .limit(100);
      setTxs((tx ?? []) as RewardTx[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const update = (id: string, patch: Partial<Placement>) =>
    setPlacements((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const save = async (p: Placement) => {
    setSavingId(p.id);
    const { error } = await supabase
      .from("ad_placements")
      .update({
        label: p.label,
        gross_value: Number(p.gross_value) || 0,
        reward_rate: Math.min(Math.max(Number(p.reward_rate) || 0, 0), 1),
        is_active: p.is_active,
        ad_client: p.ad_client?.trim() || null,
        ad_unit_id: p.ad_unit_id?.trim() || null,
      })
      .eq("id", p.id);
    setSavingId(null);
    if (error) toast.error("تعذّر حفظ القيمة");
    else toast.success("تم حفظ قيمة العملية المعتمدة");
  };

  const removeTx = async (id: string) => {
    const { error } = await supabase.from("ad_reward_transactions").delete().eq("id", id);
    if (error) {
      toast.error("تعذّر حذف العملية");
      return;
    }
    setTxs((list) => list.filter((t) => t.id !== id));
    toast.success("تم حذف العملية من السجل");
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <ShieldAlert className="h-10 w-10 text-destructive" />
        <h1 className="text-xl font-bold">هذه الصفحة للمشرفين فقط</h1>
        <Button asChild variant="outline">
          <Link to="/">العودة للتطبيق</Link>
        </Button>
      </div>
    );
  }

  return (
    <main dir="rtl" className="mx-auto w-full max-w-3xl space-y-6 p-4 pb-16">
      <header className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <Link to="/" aria-label="رجوع">
            <ArrowRight className="h-5 w-5" />
          </Link>
        </Button>
        <h1 className="text-xl font-bold">إدارة الإعلانات والمكافآت</h1>
      </header>

      <section className="space-y-3">
        <h2 className="font-semibold">قيم العمليات المعتمدة لكل نوع إعلان</h2>
        {placements.map((p) => (
          <div key={p.id} className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm text-muted-foreground">{p.ad_type}</div>
              <div className="flex items-center gap-2">
                <Label htmlFor={`a-${p.id}`} className="text-xs">
                  مفعّل
                </Label>
                <Switch
                  id={`a-${p.id}`}
                  checked={p.is_active}
                  onCheckedChange={(v) => update(p.id, { is_active: v })}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs">الاسم</Label>
                <Input value={p.label} onChange={(e) => update(p.id, { label: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">قيمة العملية المعتمدة</Label>
                <Input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={p.gross_value}
                  onChange={(e) => update(p.id, { gross_value: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">نسبة المستخدم (0 - 1)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={p.reward_rate}
                  onChange={(e) => update(p.id, { reward_rate: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">معرّف حساب الإعلانات (ca-pub-…)</Label>
                <Input
                  value={p.ad_client ?? ""}
                  placeholder="ca-pub-xxxxxxxxxxxxxxxx"
                  onChange={(e) => update(p.id, { ad_client: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">معرّف الوحدة الإعلانية</Label>
                <Input
                  value={p.ad_unit_id ?? ""}
                  placeholder="1234567890"
                  onChange={(e) => update(p.id, { ad_unit_id: e.target.value })}
                />
              </div>
            </div>
            <Button size="sm" onClick={() => save(p)} disabled={savingId === p.id}>
              {savingId === p.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              حفظ
            </Button>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">سجل عمليات المكافآت</h2>
        {txs.length === 0 && (
          <p className="text-sm text-muted-foreground">لا توجد عمليات مسجّلة بعد.</p>
        )}
        {txs.map((t) => (
          <div key={t.id} className="rounded-xl border bg-card p-3 text-sm space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{t.ad_type}</span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="حذف العملية"
                onClick={() => removeTx(t.id)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
            <div className="text-muted-foreground break-all">معرّف العملية: {t.transaction_id}</div>
            <div className="text-muted-foreground break-all">المستخدم: {t.user_id}</div>
            <div>
              مكافأة المستخدم: <span className="font-bold text-primary">{Number(t.reward_value).toFixed(4)}</span>
            </div>
            <div className="text-muted-foreground">
              التحقق: {t.verification_status} · الإضافة: {t.credit_status} ·{" "}
              {new Date(t.created_at).toLocaleString("ar")}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
