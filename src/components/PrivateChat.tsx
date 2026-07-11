import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { UserAvatar } from "./UserAvatar";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Send, ArrowRight, Image as ImageIcon, Phone, Video } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Prefs, playPing } from "@/lib/local-prefs";
import { CallDialog } from "./CallDialog";

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
  onAvatarClick?: (id: string) => void;
}

export function PrivateChat({ otherUser, onBack, onAvatarClick }: Props) {
  const { user } = useAuth();
  const [msgs, setMsgs] = useState<PM[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [callMode, setCallMode] = useState<"audio" | "video" | null>(null);

  useEffect(() => {
    if (!user) return;
    const cacheKey = `pm-msgs-${user.id}-${otherUser.id}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as PM[];
        if (Array.isArray(parsed) && parsed.length) setMsgs(parsed);
      }
    } catch {}
    (async () => {
      const { data } = await supabase
        .from("private_messages").select("*")
        .or(`and(sender_id.eq.${user.id},recipient_id.eq.${otherUser.id}),and(sender_id.eq.${otherUser.id},recipient_id.eq.${user.id})`)
        .order("created_at", { ascending: true });
      if (data) setMsgs(data as PM[]);
      await supabase.rpc("mark_pm_thread_read" as any, { p_sender: otherUser.id });
    })();


    const ch = supabase
      .channel(`pm-${user.id}-${otherUser.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "private_messages" }, (payload) => {
        const m = payload.new as PM;
        if ((m.sender_id === user.id && m.recipient_id === otherUser.id) ||
            (m.sender_id === otherUser.id && m.recipient_id === user.id)) {
          setMsgs((p) => [...p, m]);
          if (m.recipient_id === user.id) {
            supabase.rpc("mark_pm_read" as any, { p_id: m.id }).then();
            if (Prefs.getSound(user.id)) playPing();
          }
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "private_messages" }, (payload) => {
        const m = payload.new as PM;
        setMsgs((p) => p.map((x) => x.id === m.id ? { ...x, image_url: m.image_url, is_read: m.is_read } : x));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, otherUser.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    if (user && msgs.length) {
      try {
        localStorage.setItem(`pm-msgs-${user.id}-${otherUser.id}`, JSON.stringify(msgs.slice(-50)));
      } catch {}
    }
  }, [msgs, user, otherUser.id]);


  const send = async (imageUrl?: string) => {
    if (!user || (!input.trim() && !imageUrl)) return;
    const { error } = await supabase.from("private_messages").insert({
      sender_id: user.id, recipient_id: otherUser.id,
      content: input.trim() || (imageUrl ? "📷 صورة" : ""),
      image_url: imageUrl ?? null,
    });
    if (error) toast.error(error.message.includes("محظور") ? "رسالة محظورة" : "تعذّر الإرسال");
    else setInput("");
  };

  const uploadImage = async (file: File) => {
    if (!user) return;
    if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
      return toast.error("نوع الصورة غير مدعوم");
    }
    const map: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif" };
    const ext = map[file.type] || "jpg";
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("chat-images").upload(path, file, { contentType: file.type });
    if (error) return toast.error("فشل رفع الصورة");
    const { data } = supabase.storage.from("chat-images").getPublicUrl(path);
    await send(data.publicUrl);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-3 border-b bg-card flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}><ArrowRight className="h-5 w-5" /></Button>
        <UserAvatar url={otherUser.avatar_url} name={otherUser.display_name} gender={otherUser.gender} size="sm"
          onClick={() => onAvatarClick?.(otherUser.id)} />
        <button onClick={() => onAvatarClick?.(otherUser.id)} className="text-right flex-1 min-w-0">
          <div className="font-semibold truncate">{otherUser.display_name}</div>
          <div className="text-xs text-muted-foreground truncate">@{otherUser.username}</div>
        </button>
        <Button variant="ghost" size="icon" title="مكالمة صوتية" onClick={() => setCallMode("audio")}>
          <Phone className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" title="مكالمة فيديو" onClick={() => setCallMode("video")}>
          <Video className="h-5 w-5" />
        </Button>
      </div>

      {callMode && user && (
        <CallDialog
          open={true}
          onClose={() => setCallMode(null)}
          selfId={user.id}
          peerId={otherUser.id}
          peerName={otherUser.display_name}
          mode={callMode}
          role="caller"
        />
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-thin bg-gradient-to-b from-background to-secondary/30">
        {msgs.map((m) => {
          const mine = m.sender_id === user?.id;
          return (
            <div key={m.id} className={cn("flex animate-in-fade", mine ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                mine ? "gradient-bubble-me text-primary-foreground rounded-br-md" : "bg-card border rounded-bl-md"
              )}>
                {m.image_url && <img src={m.image_url} alt="" className="rounded-lg max-h-64 mb-1 cursor-pointer" onClick={() => window.open(m.image_url!, "_blank")} />}
                {m.content}
                <div className="text-[10px] mt-1 opacity-70">
                  {new Date(m.created_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}
                  {mine && (m.is_read ? " ✓✓" : " ✓")}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="p-3 border-t bg-card flex gap-2">
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])} />
        <Button type="button" variant="ghost" size="icon" onClick={() => fileRef.current?.click()}>
          <ImageIcon className="h-5 w-5" />
        </Button>
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="رسالة خاصة..." />
        <Button type="submit" size="icon" disabled={!input.trim()} className="gradient-primary border-0">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
