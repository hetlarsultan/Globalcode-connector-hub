import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AdSlot } from "@/components/AdSlot";

interface Placement {
  id: string;
  ad_type: string;
  label: string;
  reward_rate: number;
  is_active: boolean;
  ad_client: string | null;
  ad_unit_id: string | null;
}

interface AdView {
  id: string;
  ad_type: string;
  ad_unit_id: string | null;
  ad_network: string;
  completed: boolean;
  started_at: string;
}

/** Non-rewarded ad placements (banner / interstitial) plus the view log. */
export default function AdsPage() {
  const [items, setItems] = useState<Placement[]>([]);
  const [views, setViews] = useState<AdView[]>([]);

  useEffect(() => {
    void (async () => {
      const [{ data }, { data: v }] = await Promise.all([
        supabase
          .from("ad_placements")
          .select("id,ad_type,label,reward_rate,is_active,ad_client,ad_unit_id")
          .eq("is_active", true)
          .order("ad_type"),
        supabase
          .from("ad_views")
          .select("id,ad_type,ad_unit_id,ad_network,completed,started_at")
          .order("started_at", { ascending: false })
          .limit(50),
      ]);
      setItems(
        ((data ?? []) as unknown as Placement[]).filter((p) => !p.ad_type.startsWith("rewarded")),
      );
      setViews((v ?? []) as unknown as AdView[]);
    })();
  }, []);

  return (
    <main dir="rtl" className="mx-auto w-full max-w-3xl space-y-6 p-4 pb-16">
      <header className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <Link to="/" aria-label="رجوع">
            <ArrowRight className="h-5 w-5" />
          </Link>
        </Button>
        <h1 className="text-xl font-bold">الإعلانات غير المكافئة</h1>
      </header>

      <p className="flex items-start gap-2 rounded-xl border bg-card p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        هذه الإعلانات للعرض فقط ولا تُضاف عنها أي مكافأة. المكافآت تُمنح فقط من إعلانات المشاهدة
        المكافئة بعد التحقق الخادمي.
      </p>

      {items.length === 0 && (
        <p className="text-sm text-muted-foreground">لا توجد إعلانات مفعّلة من هذا النوع حاليًا.</p>
      )}

      {items.map((p) => (
        <section key={p.id} className="space-y-2 rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold">{p.label}</span>
            <span className="text-xs text-muted-foreground">
              نسبة المضافة للمستخدم: {(Number(p.reward_rate) * 100).toFixed(0)}%
            </span>
          </div>
          <AdSlot playing adClient={p.ad_client} adUnitId={p.ad_unit_id} />
        </section>
      ))}
    </main>
  );
}
