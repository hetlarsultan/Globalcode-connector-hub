import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { UserAvatar } from "./UserAvatar";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Send, Image as ImageIcon, Reply, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  room_id: string;
  user_id: string;
  content: string;
  image_url: string | null;
  reply_to_id: string | null;
  reply_to_username: string | null;
  created_at: string;
  profile?: {
    username: string;
    display_name: string;
    avatar_url: string | null;
    gender: "male" | "female" | "unspecified";
  };
}

interface Props {
  roomId: string;
  roomName: string;
  onAvatarClick: (userId: string) => void;
}

export function RoomChat({ roomId, roomName, onAvatarClick }: Props) {
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const profilesCache = useRef<Map<string, any>>(new Map());

  const enrich = async (msgs: Message[]) => {
    const ids = [...new Set(msgs.map((m) => m.user_id).filter((id) => !profilesCache.current.has(id)))];
    if (ids.length) {
      const { data } = await supabase.from("profiles").select("id,username,display_name,avatar_url,gender").in("id", ids);
      data?.forEach((p) => profilesCache.current.set(p.id, p));
    }
    return msgs.map((m) => ({ ...m, profile: profilesCache.current.get(m.user_id) }));
  };

  useEffect(() => {
    setMessages([]);
    (async () => {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true })
        .limit(100);
      if (data) setMessages(await enrich(data as Message[]));
    })();

    const ch = supabase
      .channel(`room-${roomId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `room_id=eq.${roomId}` },
        async (payload) => {
          const enriched = await enrich([payload.new as Message]);
          setMessages((prev) => [...prev, ...enriched]);
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [roomId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async (imageUrl?: string) => {
    if (!user || (!input.trim() && !imageUrl)) return;
    setSending(true);
    const { error } = await supabase.from("messages").insert({
      room_id: roomId,
      user_id: user.id,
      content: input.trim() || (imageUrl ? "📷 صورة" : ""),
      image_url: imageUrl ?? null,
      reply_to_id: replyTo?.id ?? null,
      reply_to_username: replyTo?.profile?.display_name ?? null,
    });
    setSending(false);
    if (error) toast.error(error.message.includes("محظور") ? "رسالتك تحتوي على كلمات محظورة" : "تعذّر الإرسال");
    else { setInput(""); setReplyTo(null); }
  };

  const uploadImage = async (file: File) => {
    if (!user) return;
    const path = `${user.id}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("chat-images").upload(path, file);
    if (error) return toast.error("فشل رفع الصورة");
    const { data } = supabase.storage.from("chat-images").getPublicUrl(path);
    await send(data.publicUrl);
  };

  const insertMention = (username: string) => {
    setInput((prev) => `@${username} ${prev}`);
  };

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-background to-secondary/30">
      <div className="px-4 py-3 border-b bg-card/80 backdrop-blur-sm">
        <h2 className="font-semibold">{roomName}</h2>
        <p className="text-xs text-muted-foreground">{messages.length} رسالة</p>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-2 scrollbar-thin">
        {messages.map((m) => {
          const mine = m.user_id === user?.id;
          return (
            <div key={m.id} className={cn("flex gap-2 items-end animate-in-fade", mine && "flex-row-reverse")}>
              <UserAvatar
                url={m.profile?.avatar_url}
                name={m.profile?.display_name || "?"}
                gender={m.profile?.gender}
                size="sm"
                onClick={() => onAvatarClick(m.user_id)}
              />
              <div className={cn("max-w-[75%] flex flex-col gap-0.5", mine && "items-end")}>
                {!mine && (
                  <button
                    onClick={() => insertMention(m.profile?.username || "")}
                    className="text-xs text-muted-foreground hover:text-primary px-1"
                  >
                    {m.profile?.display_name}
                  </button>
                )}
                <div
                  onDoubleClick={() => setReplyTo(m)}
                  className={cn(
                    "rounded-2xl px-3.5 py-2 text-sm shadow-sm break-words",
                    mine ? "gradient-bubble-me text-primary-foreground rounded-br-md" : "bg-card border rounded-bl-md",
                  )}
                >
                  {m.reply_to_username && (
                    <div className={cn("text-xs mb-1 pb-1 border-b opacity-80", mine ? "border-primary-foreground/30" : "border-border")}>
                      ↪ {m.reply_to_username}
                    </div>
                  )}
                  {m.image_url && (
                    <img src={m.image_url} alt="" className="rounded-lg max-h-64 mb-1" />
                  )}
                  {m.content}
                </div>
                <span className="text-[10px] text-muted-foreground px-1">
                  {new Date(m.created_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {replyTo && (
        <div className="px-3 py-2 bg-accent/50 border-t flex items-center justify-between text-xs">
          <span>الرد على <strong>{replyTo.profile?.display_name}</strong>: {replyTo.content.slice(0, 40)}</span>
          <button onClick={() => setReplyTo(null)}><X className="h-4 w-4" /></button>
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="p-3 border-t bg-card/80 backdrop-blur-sm flex gap-2">
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])} />
        <Button type="button" variant="ghost" size="icon" onClick={() => fileRef.current?.click()}>
          <ImageIcon className="h-5 w-5" />
        </Button>
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="اكتب رسالة..." className="flex-1" />
        <Button type="submit" size="icon" disabled={sending || !input.trim()} className="gradient-primary border-0">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
