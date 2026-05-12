import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { UserAvatar } from "./UserAvatar";

interface Conv {
  user_id: string;
  unread: number;
  last_at: string;
  last_content: string;
  profile?: any;
}

interface Props {
  onOpenChat: (profile: any) => void;
}

export function ConversationsList({ onOpenChat }: Props) {
  const { user } = useAuth();
  const [convs, setConvs] = useState<Conv[]>([]);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("private_messages")
      .select("*")
      .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .order("created_at", { ascending: false })
      .limit(500);
    if (!data) return;
    const map = new Map<string, Conv>();
    for (const m of data as any[]) {
      const other = m.sender_id === user.id ? m.recipient_id : m.sender_id;
      const existing = map.get(other);
      const isUnread = m.recipient_id === user.id && !m.is_read;
      if (!existing) {
        map.set(other, { user_id: other, unread: isUnread ? 1 : 0, last_at: m.created_at, last_content: m.content });
      } else if (isUnread) {
        existing.unread++;
      }
    }
    const ids = [...map.keys()];
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("*").in("id", ids);
      profs?.forEach((p: any) => { const c = map.get(p.id); if (c) c.profile = p; });
    }
    setConvs([...map.values()].sort((a, b) => b.last_at.localeCompare(a.last_at)));
  };

  useEffect(() => {
    load();
    const ch = supabase.channel("pm-list").on("postgres_changes",
      { event: "*", schema: "public", table: "private_messages" }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  return (
    <div className="overflow-y-auto h-full scrollbar-thin">
      {convs.length === 0 && <p className="text-center text-sm text-muted-foreground p-6">لا توجد محادثات</p>}
      {convs.map((c) => (
        <button key={c.user_id} onClick={() => onOpenChat(c.profile)}
          className="w-full px-3 py-3 flex items-center gap-3 hover:bg-accent/50 text-right border-b border-border/50">
          <UserAvatar url={c.profile?.avatar_url} name={c.profile?.display_name || "?"} gender={c.profile?.gender} size="md" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <div className="font-medium truncate">{c.profile?.display_name}</div>
              <span className="text-[10px] text-muted-foreground">
                {new Date(c.last_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground truncate">{c.last_content}</p>
              {c.unread > 0 && (
                <span className="h-5 min-w-5 px-1.5 rounded-full gradient-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                  {c.unread}
                </span>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
