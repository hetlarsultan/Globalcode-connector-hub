import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowRight, Coins, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { Prefs, subscribePoints, type PointsEntry } from "@/lib/local-prefs";
import { toast } from "sonner";

const fmt = (ts: number) =>
  new Date(ts).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" });

export default function Points() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [balance, setBalance] = useState(0);
  const [history, setHistory] = useState<PointsEntry[]>([]);

  useEffect(() => {
    if (!loading && !user) navigate("/auth");
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!user) return;
    setBalance(Prefs.getPoints(user.id));
    setHistory(Prefs.getPointsHistory(user.id));
    return subscribePoints(user.id, (b) => {
      setBalance(b);
      setHistory(Prefs.getPointsHistory(user.id));
    });
  }, [user]);

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Helmet>
        <title>سجل النقاط — شاهد واربح</title>
        <meta name="description" content="اعرض رصيد نقاطك وسجل جميع عمليات كسب النقاط وتفاصيل احتسابها." />
      </Helmet>

      <header className="flex items-center gap-2 border-b bg-card/60 px-3 py-2 backdrop-blur-sm">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")} aria-label="رجوع">
          <ArrowRight className="h-5 w-5" />
        </Button>
        <h1 className="text-base font-semibold">سجل النقاط</h1>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 p-4">
        <section className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Coins className="h-4 w-4" /> رصيدك الحالي
          </div>
          <div className="mt-1 text-4xl font-bold text-primary">
            {balance} <span className="text-sm font-normal text-muted-foreground">نقطة</span>
          </div>
        </section>

        <section className="rounded-xl border bg-card p-4 text-sm space-y-1">
          <div className="font-semibold">كيف تُحتسب النقاط؟</div>
          <ul className="list-disc space-y-1 pr-5 text-muted-foreground">
            <li>مشاهدة إعلان كاملة حتى النهاية: +10 نقاط.</li>
            <li>إغلاق الإعلان قبل انتهائه: لا تُحتسب أي نقاط.</li>
            <li>مكافآت إضافية تُسجَّل باسم العملية الخاصة بها.</li>
            <li>الرصيد يُحدَّث لحظيًا بعد كل عملية ويظهر في شريط الإجراءات.</li>
          </ul>
        </section>

        <section className="rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b p-3">
            <div className="font-semibold">تفاصيل العمليات</div>
            {history.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  Prefs.clearPointsHistory(user.id);
                  setHistory([]);
                  toast.success("تم مسح سجل العمليات");
                }}
              >
                <Trash2 className="ml-1 h-4 w-4" /> مسح
              </Button>
            )}
          </div>
          {history.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">لا توجد عمليات بعد.</p>
          ) : (
            <ul className="divide-y">
              {history.map((h, i) => (
                <li key={`${h.at}-${i}`} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{h.reason}</div>
                    <div className="text-xs text-muted-foreground">{fmt(h.at)}</div>
                  </div>
                  <div className="text-left">
                    <div className={h.delta >= 0 ? "font-semibold text-emerald-500" : "font-semibold text-destructive"}>
                      {h.delta >= 0 ? `+${h.delta}` : h.delta}
                    </div>
                    <div className="text-xs text-muted-foreground">الرصيد: {h.balance}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
