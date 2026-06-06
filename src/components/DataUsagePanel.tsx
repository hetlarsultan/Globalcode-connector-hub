import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { formatBytes, subscribeDataUsage } from "@/lib/data-usage";

export function DataUsagePanel() {
  const [stats, setStats] = useState<{ count: number; bytes: number; byType: Record<string, { count: number; bytes: number }> }>({
    count: 0,
    bytes: 0,
    byType: {},
  });

  useEffect(() => {
    const unsub = subscribeDataUsage(setStats);
    return () => { unsub(); };
  }, []);

  const types = Object.entries(stats.byType).sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 5);
  const efficiency = stats.bytes < 500_000 ? "ممتاز" : stats.bytes < 2_000_000 ? "جيد" : "مرتفع";
  const efficiencyColor = stats.bytes < 500_000 ? "text-success" : stats.bytes < 2_000_000 ? "text-primary" : "text-destructive";

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-semibold flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> استهلاك الإنترنت</span>
        <span className={`text-xs font-bold ${efficiencyColor}`}>{efficiency}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md bg-muted/40 p-2">
          <div className="text-muted-foreground">إجمالي البيانات</div>
          <div className="font-bold text-base">{formatBytes(stats.bytes)}</div>
        </div>
        <div className="rounded-md bg-muted/40 p-2">
          <div className="text-muted-foreground">عدد الطلبات</div>
          <div className="font-bold text-base">{stats.count}</div>
        </div>
      </div>
      {types.length > 0 && (
        <div className="space-y-1 pt-1">
          {types.map(([t, v]) => (
            <div key={t} className="flex justify-between text-xs text-muted-foreground">
              <span>{t}</span>
              <span>{v.count} · {formatBytes(v.bytes)}</span>
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-muted-foreground pt-1">
        نصيحة: الصور والمحتوى المحفوظ يُعرض من الذاكرة بدون استهلاك إنترنت.
      </p>
    </div>
  );
}
