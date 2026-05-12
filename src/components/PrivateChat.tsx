import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { UserAvatar } from "./UserAvatar";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Send, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface PM {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  image_url: string | null;
  is_read: boolean;
  created_at: string;
}

interface Props {
  otherUser: { id: string; username: string; display_name: string; avatar_url: string | null; gender: "male"|"female"|"unspecified" };
  onBack: () => void;
}

export function PrivateChat({ otherUser, onBack }: Props) {
  const { user } = useAuth();
  const [msgs, setMsgs] = useState<PM[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("private_messages")
        .select("*")
        .or(`and(sender_id.eq.${user.id},recipient_id.eq.${otherUser.id}),and(sender_id.eq.${otherUser.id},recipient_id.eq.${user.id})`)
        .order("created_at", { ascending: true });
      if (data) setMsgs(data as PM[]);
      // mark received as read
      await supabase.from("private_messages").update({ is_read: true })
        .eq("recipient_id", user.id).eq("sender_id", otherUser.id).eq("is_read", false);
    })();

    const ch = supabase
      .channel(`pm-${user.id}-${otherUser.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "private_messages" }, (payload) => {
        const m = payload.new as PM;
        if ((m.sender_id === user.id && m.recipient_id === otherUser.id) ||
            (m.sender_id === otherUser.id && m.recipient_id === user.id)) {
          setMsgs((p) => [...p, m]);
          if (m.recipient_id === user.id) {
            supabase.from("private_messages").update({ is_read: true }).eq("id", m.id).then();
          }
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, otherUser.id]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [msgs]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !input.trim()) return;
    const { error } = await supabase.from("private_messages").insert({
      sender_id: user.id, recipient_id: otherUser.id, content: input.trim(),
    });
    if (error) toast.error(error.message.includes("محظور") ? "رسالة محظورة" : "تعذّر الإرسال");
    else setInput("");
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-3 border-b bg-card flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}><ArrowRight className="h-5 w-5" /></Button>
        <UserAvatar url={otherUser.avatar_url} name={otherUser.display_name} gender={otherUser.gender} size="sm" />
        <div>
          <div className="font-semibold">{otherUser.display_name}</div>
          <div className="text-xs text-muted-foreground">@{otherUser.username}</div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-thin bg-gradient-to-b from-background to-secondary/30">
        {msgs.map((m) => {
          const mine = m.sender_id === user?.id;
          return (
            <div key={m.id} className={cn("flex animate-in-fade", mine ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                mine ? "gradient-bubble-me text-primary-foreground rounded-br-md" : "bg-card border rounded-bl-md"
              )}>
                {m.content}
                <div className={cn("text-[10px] mt-1 opacity-70")}>
                  {new Date(m.created_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}
                  {mine && (m.is_read ? " ✓✓" : " ✓")}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={send} className="p-3 border-t bg-card flex gap-2">
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="رسالة خاصة..." />
        <Button type="submit" size="icon" disabled={!input.trim()} className="gradient-primary border-0">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
