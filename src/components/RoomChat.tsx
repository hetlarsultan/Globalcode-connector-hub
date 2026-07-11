import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { UserAvatar } from "./UserAvatar";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "./ui/sheet";
import { Send, Image as ImageIcon, X, Users, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Prefs, playPing } from "@/lib/local-prefs";

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
    nameColor?: string;
    textColor?: string;
    fontFamily?: string;
  };
}

interface Props {
  roomId: string;
  roomName: string;
  onAvatarClick: (userId: string) => void;
}

interface PresenceUser {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  gender: "male" | "female" | "unspecified";
}

export function RoomChat({ roomId, roomName, onAvatarClick }: Props) {
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [sending, setSending] = useState(false);
  const [members, setMembers] = useState<PresenceUser[]>([]);
  const [blocks, setBlocks] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const profilesCache = useRef<Map<string, any>>(new Map());

  useEffect(() => {
    if (!user) return;
    const refresh = () => setBlocks(Prefs.getBlocks(user.id));
    refresh();
    window.addEventListener("blocks-changed", refresh);
    return () => window.removeEventListener("blocks-changed", refresh);
  }, [user]);

  const enrich = async (msgs: Message[]) => {
    const ids = [...new Set(msgs.map((m) => m.user_id).filter((id) => !profilesCache.current.has(id)))];
    if (ids.length) {
      const { data } = await supabase.from("profiles")
        .select("id,username,display_name,avatar_url,gender,name_color,text_color,font_family")
        .in("id", ids);
      data?.forEach((p) => profilesCache.current.set(p.id, p));
    }
    return msgs.map((m) => {
      const p = profilesCache.current.get(m.user_id);
      return {
        ...m,
        profile: p ? {
          ...p,
          nameColor: p.name_color || undefined,
          textColor: p.text_color || undefined,
          fontFamily: p.font_family || undefined,
        } : undefined,
      };
    });
  };

  useEffect(() => {
    setMessages([]);
    setMembers([]);
    // Load last 50 from cache first (instant paint)
    try {
      const cached = localStorage.getItem(`room-msgs-${roomId}`);
      if (cached) {
        const parsed = JSON.parse(cached) as Message[];
        if (Array.isArray(parsed) && parsed.length) setMessages(parsed);
      }
    } catch {}
    (async () => {
      const { data } = await supabase
        .from("messages").select("*").eq("room_id", roomId)
        .order("created_at", { ascending: true }).limit(100);
      if (data) {
        const enriched = await enrich(data as Message[]);
        setMessages(enriched);
      }
    })();


    const ch = supabase
      .channel(`room-${roomId}`, { config: { presence: { key: user?.id || "anon" } } })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `room_id=eq.${roomId}` },
        async (payload) => {
          const enriched = await enrich([payload.new as Message]);
          setMessages((prev) => [...prev, ...enriched]);
          if (user && payload.new.user_id !== user.id && Prefs.getSound(user.id)) playPing();
        })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `room_id=eq.${roomId}` },
        (payload) => {
          const upd = payload.new as Message;
          setMessages((prev) => prev.map((m) => m.id === upd.id ? { ...m, image_url: upd.image_url, content: upd.content } : m));
        })
      .on("presence", { event: "sync" }, () => {
        const state = ch.presenceState() as Record<string, any[]>;
        const list: PresenceUser[] = [];
        Object.values(state).forEach((arr) => arr.forEach((m) => list.push(m as PresenceUser)));
        const uniq = new Map(list.map((u) => [u.id, u]));
        setMembers([...uniq.values()]);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED" && user && profile) {
          await ch.track({
            id: user.id,
            display_name: profile.display_name,
            username: profile.username,
            avatar_url: profile.avatar_url,
            gender: profile.gender,
          });
        }
      });
    return () => { supabase.removeChannel(ch); };
  }, [roomId, user, profile]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    // Persist last 50 messages for instant reload
    if (messages.length) {
      try {
        const last = messages.slice(-50);
        localStorage.setItem(`room-msgs-${roomId}`, JSON.stringify(last));
      } catch {}
    }
  }, [messages, roomId]);


  const send = async (imageUrl?: string) => {
    if (!user || (!input.trim() && !imageUrl)) return;
    setSending(true);
    const { error } = await supabase.from("messages").insert({
      room_id: roomId, user_id: user.id,
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

  const insertMention = (username: string) => setInput((p) => `@${username} ${p}`);

  const visible = messages.filter((m) => !blocks.includes(m.user_id));

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-background to-secondary/30">
      <div className="px-4 py-3 border-b bg-card/80 backdrop-blur-sm flex items-center justify-between">
        <div>
          <h2 className="font-semibold flex items-center gap-2">{roomName}</h2>
          <p className="text-xs text-muted-foreground">{visible.length} رسالة · {members.length} متصل</p>
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5"><Users className="h-4 w-4" /> {members.length}</Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72">
            <SheetHeader><SheetTitle>أعضاء الغرفة ({members.length})</SheetTitle></SheetHeader>
            <div className="mt-4 space-y-1 overflow-y-auto max-h-[80vh] scrollbar-thin">
              {members.map((m) => (
                <button key={m.id} onClick={() => onAvatarClick(m.id)}
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 text-right">
                  <UserAvatar url={m.avatar_url} name={m.display_name} gender={m.gender} size="sm" online />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate text-sm">{m.display_name}</div>
                    <div className="text-xs text-muted-foreground truncate">@{m.username}</div>
                  </div>
                </button>
              ))}
              {members.length === 0 && <p className="text-center text-sm text-muted-foreground p-4">لا يوجد متصلون</p>}
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-2 scrollbar-thin">
        <div className="flex items-center justify-center gap-2 my-2 px-4 py-3 rounded-xl bg-accent/40 border border-accent text-sm animate-in-fade">
          <Sparkles className="h-4 w-4 text-primary" />
          <span>مرحباً بك في <strong>{roomName}</strong> — استمتع بدردشتك!</span>
        </div>

        {visible.map((m) => {
          const mine = m.user_id === user?.id;
          const nameStyle = m.profile?.nameColor ? { color: m.profile.nameColor } : undefined;
          const bubbleStyle = !mine && m.profile?.fontFamily
            ? { fontFamily: m.profile.fontFamily, color: m.profile.textColor || undefined }
            : !mine && m.profile?.textColor ? { color: m.profile.textColor } : undefined;
          return (
            <div key={m.id} className={cn("flex gap-2 items-end animate-in-fade", mine && "flex-row-reverse")}>
              <UserAvatar
                url={m.profile?.avatar_url} name={m.profile?.display_name || "?"}
                gender={m.profile?.gender} size="sm"
                onClick={() => onAvatarClick(m.user_id)}
              />
              <div className={cn("max-w-[75%] flex flex-col gap-0.5", mine && "items-end")}>
                {!mine && (
                  <button onClick={() => setReplyTo(m)}
                    className="text-xs font-semibold hover:underline px-1"
                    style={nameStyle}
                    title="اضغط للرد على هذا المستخدم">
                    {m.profile?.display_name}
                  </button>
                )}
                <div
                  onDoubleClick={() => setReplyTo(m)}
                  style={bubbleStyle}
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
                    <img src={m.image_url} alt="" className="rounded-lg max-h-64 mb-1 cursor-pointer" onClick={() => window.open(m.image_url!, "_blank")} />
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
          <button onClick={() => setReplyTo(null)} aria-label="إلغاء الرد"><X className="h-4 w-4" /></button>
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="p-3 border-t bg-card/80 backdrop-blur-sm flex gap-2">
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])} />
        <Button type="button" variant="ghost" size="icon" onClick={() => fileRef.current?.click()} aria-label="رفع صورة">
          <ImageIcon className="h-5 w-5" />
        </Button>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="اكتب رسالة... (انقر مرتين لأي رسالة للرد عليها)"
          className="flex-1"
          style={profile?.font_family ? { fontFamily: profile.font_family } : undefined}
        />
        <Button type="submit" size="icon" disabled={sending || !input.trim()} className="gradient-primary border-0" aria-label="إرسال الرسالة">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
