import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { UserAvatar } from "./UserAvatar";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { Check, X, UserPlus } from "lucide-react";

interface Friendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: string;
  profile?: any;
}

interface Props {
  onOpenChat: (profile: any) => void;
}

export function FriendsList({ onOpenChat }: Props) {
  const { user } = useAuth();
  const [items, setItems] = useState<Friendship[]>([]);

  const load = async () => {
    if (!user) return;
    const { data: fs } = await supabase
      .from("friendships")
      .select("*")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
    if (!fs) return;
    const otherIds = fs.map((f: any) => f.requester_id === user.id ? f.addressee_id : f.requester_id);
    const { data: profs } = await supabase.from("profiles").select("*").in("id", otherIds);
    const profMap = new Map(profs?.map((p: any) => [p.id, p]) || []);
    setItems(fs.map((f: any) => ({ ...f, profile: profMap.get(f.requester_id === user.id ? f.addressee_id : f.requester_id) })));
  };

  useEffect(() => {
    load();
    const ch = supabase.channel("friendships").on("postgres_changes",
      { event: "*", schema: "public", table: "friendships" }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  const accept = async (id: string) => {
    await supabase.from("friendships").update({ status: "accepted" }).eq("id", id);
    toast.success("تمت إضافة الصديق");
  };
  const reject = async (id: string) => {
    await supabase.from("friendships").delete().eq("id", id);
  };

  const requests = items.filter((i) => i.status === "pending" && i.addressee_id === user?.id);
  const friends = items.filter((i) => i.status === "accepted");
  const pending = items.filter((i) => i.status === "pending" && i.requester_id === user?.id);

  return (
    <div className="p-3 space-y-4 overflow-y-auto h-full scrollbar-thin">
      {requests.length > 0 && (
        <section>
          <h3 className="font-semibold mb-2 flex items-center gap-2"><UserPlus className="h-4 w-4" /> طلبات الصداقة ({requests.length})</h3>
          <div className="space-y-2">
            {requests.map((r) => (
              <div key={r.id} className="flex items-center gap-2 p-2 rounded-lg bg-card border">
                <UserAvatar url={r.profile?.avatar_url} name={r.profile?.display_name} gender={r.profile?.gender} size="sm" />
                <div className="flex-1 text-sm font-medium">{r.profile?.display_name}</div>
                <Button size="sm" onClick={() => accept(r.id)} className="h-8 w-8 p-0"><Check className="h-4 w-4" /></Button>
                <Button size="sm" variant="outline" onClick={() => reject(r.id)} className="h-8 w-8 p-0"><X className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="font-semibold mb-2">الأصدقاء ({friends.length})</h3>
        <div className="space-y-1">
          {friends.map((f) => (
            <button key={f.id} onClick={() => onOpenChat(f.profile)}
              className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 text-right">
              <UserAvatar url={f.profile?.avatar_url} name={f.profile?.display_name} gender={f.profile?.gender} size="sm" />
              <div className="text-sm font-medium">{f.profile?.display_name}</div>
            </button>
          ))}
          {friends.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">لا يوجد أصدقاء بعد</p>}
        </div>
      </section>

      {pending.length > 0 && (
        <section>
          <h3 className="font-semibold mb-2 text-muted-foreground">طلبات مرسلة</h3>
          <div className="space-y-1">
            {pending.map((p) => (
              <div key={p.id} className="flex items-center gap-3 p-2 text-sm text-muted-foreground">
                <UserAvatar url={p.profile?.avatar_url} name={p.profile?.display_name} gender={p.profile?.gender} size="sm" />
                {p.profile?.display_name} <span className="text-xs">(قيد الانتظار)</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
