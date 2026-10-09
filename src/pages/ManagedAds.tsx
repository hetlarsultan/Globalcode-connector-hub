import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Loader2, MonitorPlay, ShieldCheck, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AdSlot } from "@/components/AdSlot";
import { isNativeApp, showRewardedAd, REWARDED_AD_UNIT_ID } from "@/lib/admob";

const AD_DURATION = 15;

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
  transaction_id: string;
  ad_type: string;
  ad_network: string;
  gross_value: number;
  reward_value: number;
  verification_status: string;
  credit_status: string;
  created_at: string;
}

interface AdViewRow {
  transaction_id: string | null;
  ad_unit_id: string | null;
  ad_network: string;
  completed: boolean;
  started_at: string;
  completed_at: string | null;
}

type Phase = "idle" | "starting" | "playing" | "verifying" | "done" | "failed";

interface RunState {
  phase: Phase;
  left: number;
  rewarded: number | null;
}

const IDLE: RunState = { phase: "idle", left: AD_DURATION, rewarded: null };

/** Managed ads page: active placements with countdown + detailed reward log. */
export default function ManagedAds() {
  const [userId, setUserId] = useState<string | null>(null);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [runs, setRuns] = useState<Record<string, RunState>>({});
  const [txs, setTxs] = useState<RewardTx[]>([]);
  const [viewsByTx, setViewsByTx] = useState<Record<string, AdViewRow>>({});
  const [balance, setBalance] = useState(0);
  const cancelRef = useRef(false);

  const setRun = (id: string, patch: Partial<RunState>) =>
    setRuns((r) => ({ ...r, [id]: { ...(r[id] ?? IDLE), ...patch } }));

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id ?? null;
    setUserId(uid);

    const { data: pl } = await supabase
      .from("ad_placements")
      .select("id,ad_type,label,gross_value,reward_rate,is_active,ad_client,ad_unit_id")
      .eq("is_active", true)
      .order("ad_type");
    setPlacements(
      ((pl ?? []) as unknown as Placement[]).filter((p) => p.ad_type.startsWith("rewarded")),
    );

    if (!uid) return;
    const [{ data: w }, { data: tx }, { data: vw }] = await Promise.all([
      supabase.from("wallets").select("balance").eq("user_id", uid).maybeSingle(),
      supabase
        .from("ad_reward_transactions")
        .select(
          "id,transaction_id,ad_type,ad_network,gross_value,reward_value,verification_status,credit_status,created_at",
        )
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("ad_views")
        .select("transaction_id,ad_unit_id,ad_network,completed,started_at,completed_at")
        .order("started_at", { ascending: false })
        .limit(100),
    ]);
    setBalance(Number(w?.balance ?? 0));
    setTxs((tx ?? []) as RewardTx[]);
    const map: Record<string, AdViewRow> = {};
    for (const v of (vw ?? []) as AdViewRow[]) {
      if (v.transaction_id && !map[v.transaction_id]) map[v.transaction_id] = v;
    }
    setViewsByTx(map);
  }, []);

  useEffect(() => {
    void load();
    return () => {
      cancelRef.current = true;
    };
  }, [load]);

  // Countdown ticks for every placement currently playing.
  useEffect(() => {
    const t = setInterval(() => {
      setRuns((r) => {
        let changed = false;
        const next = { ...r };
        for (const [id, s] of Object.entries(next)) {
          if (s.phase === "playing" && s.left > 0) {
            next[id] = { ...s, left: s.left - 1 };
            changed = true;
          }
        }
        return changed ? next : r;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const waitForVerification = useCallback(async (transactionId: string) => {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline && !cancelRef.current) {
      const { data } = await supabase
        .from("ad_reward_transactions")
        .select("reward_value,verification_status,credit_status")
        .eq("transaction_id", transactionId)
        .maybeSingle();
      if (data?.verification_status === "verified" && data?.credit_status === "credited") {
        return Number(data.reward_value ?? 0);
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    return null;
  }, []);

  const watch = async (p: Placement) => {
    const state = runs[p.id] ?? IDLE;
    if (state.phase === "starting" || state.phase === "playing" || state.phase === "verifying")
      return;
    if (!userId) return;
    setRun(p.id, { phase: "starting", rewarded: null, left: AD_DURATION });
    let viewId: string | null = null;
    try {
      // Request a session for this specific placement type (read from query string).
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) throw new Error("unauthorized");
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ad-reward-start?ad_type=${encodeURIComponent(p.ad_type)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.transaction_id) throw new Error("start_failed");

      setRun(p.id, { phase: "playing", left: AD_DURATION });

      const { data: view } = await supabase
        .from("ad_views")
        .insert({
          user_id: userId,
          ad_type: String(data.ad_type ?? p.ad_type),
          ad_unit_id: (data.ad_unit_id as string | null) ?? p.ad_unit_id,
          ad_network: isNativeApp() ? "admob" : "web",
          transaction_id: String(data.transaction_id),
        } as never)
        .select("id")
        .maybeSingle();
      viewId = (view as { id?: string } | null)?.id ?? null;

      if (isNativeApp()) {
        const slot = String(data.ad_unit_id ?? "");
        const adUnitId = slot.startsWith("ca-app-pub")
          ? slot
          : slot
            ? `ca-app-pub-8449241346087567/${slot}`
            : REWARDED_AD_UNIT_ID;
        const earned = await showRewardedAd({
          userId: data.user_id as string,
          transactionId: data.transaction_id as string,
          adUnitId,
        });
        if (!earned) {
          setRun(p.id, { phase: "failed" });
          return;
        }
      } else {
        await new Promise((r) => setTimeout(r, AD_DURATION * 1000));
      }

      if (viewId) {
        await supabase
          .from("ad_views")
          .update({ completed: true, completed_at: new Date().toISOString() } as never)
          .eq("id", viewId);
      }

      setRun(p.id, { phase: "verifying" });
      const reward = await waitForVerification(data.transaction_id as string);
      if (reward === null) {
        setRun(p.id, { phase: "failed" });
        return;
      }
      setRun(p.id, { phase: "done", rewarded: reward });
      await load();
    } catch {
      setRun(p.id, { phase: "failed" });
    }
  };

  return (
    <main dir="rtl" className="mx-auto w-full max-w-3xl space-y-6 p-4 pb-16">
      <header className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <Link to="/" aria-label="رجوع">
            <ArrowRight className="h-5 w-5" />
          </Link>
        </Button>
        <h1 className="text-xl font-bold">الإعلانات المُدارة</h1>
      </header>

      <div className="flex items-center justify-between rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2 font-semibold">
          <Wallet className="h-4 w-4" /> رصيد محفظتك
        </div>
        <div className="text-2xl font-bold text-primary tabular-nums">{balance.toFixed(2)}</div>
      </div>

      {placements.length === 0 && (
        <p className="text-sm text-muted-foreground">لا توجد وحدات إعلانية مفعّلة حاليًا.</p>
      )}

      {placements.map((p) => {
        const s = runs[p.id] ?? IDLE;
        const busy = s.phase === "starting" || s.phase === "playing" || s.phase === "verifying";
        return (
          <section key={p.id} className="space-y-3 rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{p.label}</span>
              <span className="text-xs text-muted-foreground">
                حصتك عند الاكتمال: {(Number(p.reward_rate) * 100).toFixed(0)}%
              </span>
            </div>

            <AdSlot playing={s.phase === "playing"} adClient={p.ad_client} adUnitId={p.ad_unit_id}>
              {s.phase === "playing" ? (
                <>
                  <MonitorPlay className="h-10 w-10 text-primary animate-pulse" />
                  <span className="text-2xl font-bold tabular-nums">{s.left}</span>
                  <span className="text-xs text-muted-foreground">جارٍ عرض الإعلان…</span>
                </>
              ) : s.phase === "verifying" ? (
                <>
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <span className="text-xs text-muted-foreground">جارٍ التحقق من المشاهدة…</span>
                </>
              ) : null}
            </AdSlot>

            <Button
              className="w-full disabled:cursor-not-allowed disabled:opacity-70"
              onClick={() => watch(p)}
              disabled={busy || !userId}
              aria-busy={busy}
            >
              {busy ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {s.phase === "starting"
                    ? "جارٍ التحضير…"
                    : s.phase === "playing"
                      ? `تبقّى ${s.left}ث`
                      : "جارٍ التحقق…"}
                </span>
              ) : (
                "شاهد الآن"
              )}
            </Button>

            {s.phase === "done" && s.rewarded !== null && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-2 text-sm text-emerald-600">
                <ShieldCheck className="h-4 w-4" />
                تمت إضافة مكافأتك ({s.rewarded.toFixed(4)}) إلى محفظتك بنجاح.
              </div>
            )}
            {s.phase === "failed" && (
              <div className="rounded-lg bg-destructive/10 p-2 text-sm text-destructive">
                لم يتم التحقق من المشاهدة، ولم تتم إضافة أي رصيد.
              </div>
            )}
          </section>
        );
      })}

      <section className="space-y-3">
        <h2 className="font-semibold">سجل عمليات المكافآت</h2>
        {txs.length === 0 && (
          <p className="text-sm text-muted-foreground">لا توجد عمليات مسجّلة بعد.</p>
        )}
        {txs.map((t) => {
          const v = viewsByTx[t.transaction_id];
          return (
            <div key={t.id} className="space-y-1 rounded-xl border bg-card p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{t.ad_type}</span>
                <span className="font-bold text-primary">
                  +{Number(t.reward_value).toFixed(4)}
                </span>
              </div>
              <div className="break-all text-muted-foreground">
                معرّف العملية: {t.transaction_id}
              </div>
              <div className="text-muted-foreground">
                قيمة العملية المعتمدة: {Number(t.gross_value).toFixed(4)} · الشبكة: {t.ad_network}
              </div>
              {v && (
                <div className="text-muted-foreground">
                  الوحدة: {v.ad_unit_id ?? "—"} · المشاهدة:{" "}
                  {v.completed ? "مكتملة" : "غير مكتملة"} · بدأت{" "}
                  {new Date(v.started_at).toLocaleString("ar")}
                  {v.completed_at
                    ? ` · اكتملت ${new Date(v.completed_at).toLocaleString("ar")}`
                    : ""}
                </div>
              )}
              <div className="text-muted-foreground">
                التحقق: {t.verification_status} · الإضافة: {t.credit_status} ·{" "}
                {new Date(t.created_at).toLocaleString("ar")}
              </div>
            </div>
          );
        })}
      </section>
    </main>
  );
}
