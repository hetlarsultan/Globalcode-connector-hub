import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface TxRow {
  id: string;
  reward_value: number | string;
  verification_status: string;
  credit_status: string;
}

/**
 * Listens for real SSV-credited reward transactions of the signed-in user and
 * shows an in-app notification with the reward value and verification status.
 */
export function RewardNotifier() {
  const { user } = useAuth();
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    const notify = (row: TxRow) => {
      if (row.verification_status !== "verified" || row.credit_status !== "credited") return;
      if (seen.current.has(row.id)) return;
      seen.current.add(row.id);
      toast.success("تمت إضافة مكافأتك إلى محفظتك بنجاح.", {
        description: `قيمة المكافأة: ${Number(row.reward_value ?? 0).toFixed(4)} · حالة التحقق: موثّقة`,
      });
    };

    const channel = supabase
      .channel(`ad-rewards-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ad_reward_transactions",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => notify(payload.new as unknown as TxRow),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user]);

  return null;
}
