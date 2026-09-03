import { useCallback, useEffect, useRef, useState } from "react";
import { MonitorPlay, ShieldCheck, Loader2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Phase = "idle" | "starting" | "playing" | "verifying" | "done" | "failed";

const AD_DURATION = 15; // seconds of the rewarded ad

interface Props {
  userId: string;
  onBalanceChange?: (balance: number) => void;
}

/**
 * "شاهد واربح" — rewarded ad flow.
 * The client never grants the reward: it only starts a session and then waits
 * for the ad network's server-side verification (SSV) callback to credit the
 * wallet. The UI reflects the database state only.
 */
export function RewardedAdPanel({ userId, onBalanceChange }: Props) {
  const [balance, setBalance] = useState<number>(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [left, setLeft] = useState(AD_DURATION);
  const [rewarded, setRewarded] = useState<number | null>(null);
  const cancelRef = useRef(false);

  const loadBalance = useCallback(async () => {
    const { data } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", userId)
      .maybeSingle();
    const b = Number(data?.balance ?? 0);
    setBalance(b);
    onBalanceChange?.(b);
    return b;
  }, [userId, onBalanceChange]);

  useEffect(() => {
    void loadBalance();
    return () => { cancelRef.current = true; };
  }, [loadBalance]);

  // Countdown while the ad plays.
  useEffect(() => {
    if (phase !== "playing") return;
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, left]);

  /** Poll the transaction row until the server marks it credited. */
  const waitForVerification = useCallback(
    async (transactionId: string) => {
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
    },
    [],
  );

  const watch = async () => {
    if (phase === "starting" || phase === "playing" || phase === "verifying") return;
    setRewarded(null);
    setPhase("starting");
    try {
      const { data, error } = await supabase.functions.invoke("ad-reward-start");
      if (error || !data?.transaction_id) throw error ?? new Error("start_failed");

      setLeft(AD_DURATION);
      setPhase("playing");
      await new Promise((r) => setTimeout(r, AD_DURATION * 1000));

      setPhase("verifying");
      const reward = await waitForVerification(data.transaction_id as string);
      if (reward === null) {
        setPhase("failed");
        return;
      }
      setRewarded(reward);
      setPhase("done");
      await loadBalance();
      toast.success("تمت إضافة مكافأتك إلى محفظتك بنجاح.");
    } catch {
      setPhase("failed");
    }
  };

  const busy = phase === "starting" || phase === "playing" || phase === "verifying";

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="aspect-video rounded-lg bg-muted flex flex-col items-center justify-center gap-2">
          {phase === "playing" ? (
            <>
              <MonitorPlay className="h-10 w-10 text-primary animate-pulse" />
              <span className="text-2xl font-bold tabular-nums">{left}</span>
              <span className="text-xs text-muted-foreground">جارٍ عرض الإعلان…</span>
            </>
          ) : phase === "verifying" ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="text-xs text-muted-foreground">جارٍ التحقق من المشاهدة…</span>
            </>
          ) : (
            <MonitorPlay className="h-10 w-10 text-muted-foreground" />
          )}
        </div>

        <div className="font-semibold">شاهد إعلانًا واحصل على مكافأتك</div>
        <p className="text-sm text-muted-foreground">
          مشاهدة الإعلان اختيارية تمامًا. بعد اكتمال المشاهدة يتم التحقق من العملية عبر خادم شبكة
          الإعلانات، ثم تُضاف حصتك (25%) إلى محفظتك داخل التطبيق.
        </p>

        <Button
          className="w-full disabled:cursor-not-allowed disabled:opacity-70"
          onClick={watch}
          disabled={busy}
          aria-busy={busy}
          aria-disabled={busy}
        >
          {busy ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              {phase === "starting" ? "جارٍ التحضير…" : phase === "playing" ? `تبقّى ${left}ث` : "جارٍ التحقق…"}
            </span>
          ) : (
            "شاهد الآن"
          )}
        </Button>

        {phase === "done" && rewarded !== null && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 text-emerald-600 p-2 text-sm">
            <ShieldCheck className="h-4 w-4" />
            تمت إضافة مكافأتك إلى محفظتك بنجاح.
          </div>
        )}
        {phase === "failed" && (
          <div className="rounded-lg bg-destructive/10 text-destructive p-2 text-sm">
            لم يتم التحقق من المشاهدة، ولم تتم إضافة أي رصيد.
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-1">
        <div className="flex items-center gap-2 font-semibold">
          <Wallet className="h-4 w-4" /> رصيد محفظتك
        </div>
        <div className="text-3xl font-bold text-primary tabular-nums">{balance.toFixed(2)}</div>
        <p className="text-xs text-muted-foreground">
          الأرباح المعروضة تقديرية وقد تتغير بعد التسويات والتحقق من النشاط الصالح، وليست مبلغًا
          نهائيًا قابلًا للسحب.
        </p>
      </div>
    </div>
  );
}
