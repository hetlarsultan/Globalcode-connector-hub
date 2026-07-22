import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { UserAvatar } from "./UserAvatar";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "./ui/alert-dialog";
import { Lock, LockOpen, Search, EyeOff, Eye, KeyRound } from "lucide-react";
import { Prefs, hashPassword } from "@/lib/local-prefs";
import { toast } from "sonner";

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
  const [search, setSearch] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [pwDialog, setPwDialog] = useState(false);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");

  const hasPassword = user ? !!Prefs.getHidePasswordHash(user.id) : false;

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
      const { data: profs } = await supabase.from("profiles").select("id,username,display_name,avatar_url,bio,gender,is_online,last_seen,created_at,updated_at,name_color,text_color,font_family").in("id", ids);
      profs?.forEach((p: any) => { const c = map.get(p.id); if (c) c.profile = p; });
    }
    setConvs([...map.values()].sort((a, b) => b.last_at.localeCompare(a.last_at)));
  };

  useEffect(() => {
    load();
    const ch = supabase.channel(`pm-list-${user?.id || "anon"}-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "private_messages" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Unlock hidden convs when the search text matches the stored password hash.
  useEffect(() => {
    if (!user || !hasPassword || !search) { setUnlocked(false); return; }
    let cancelled = false;
    (async () => {
      const h = await hashPassword(search);
      if (!cancelled) setUnlocked(h === Prefs.getHidePasswordHash(user.id));
    })();
    return () => { cancelled = true; };
  }, [search, user, hasPassword]);

  const toggleHidden = (otherId: string) => {
    if (!user) return;
    if (!hasPassword) {
      toast.error("عيّن كلمة السر أولاً لإخفاء المحادثات");
      setPwDialog(true);
      return;
    }
    const nowHidden = Prefs.toggleHiddenConv(user.id, otherId);
    toast.success(nowHidden ? "تم إخفاء المحادثة" : "تم إظهار المحادثة");
    setConvs((c) => [...c]);
  };

  const savePassword = async () => {
    if (!user) return;
    if (pw1.length < 4) return toast.error("كلمة السر قصيرة جداً (4 أحرف على الأقل)");
    if (pw1 !== pw2) return toast.error("كلمتا السر غير متطابقتين");
    const h = await hashPassword(pw1);
    Prefs.setHidePasswordHash(user.id, h);
    setPw1(""); setPw2(""); setPwDialog(false);
    toast.success("تم حفظ كلمة السر");
  };

  const clearPassword = () => {
    if (!user) return;
    Prefs.setHidePasswordHash(user.id, "");
    toast.success("تم حذف كلمة السر (المحادثات المخفية ستظهر)");
    setConvs((c) => [...c]);
  };

  const filtered = useMemo(() => {
    if (!user) return [] as Conv[];
    const hiddenSet = new Set(Prefs.getHiddenConvs(user.id));
    const q = search.trim().toLowerCase();
    return convs.filter((c) => {
      const isHidden = hiddenSet.has(c.user_id);
      if (isHidden && !unlocked) return false;
      if (!q) return true;
      // When the search text equals the password we show ALL hidden convs — don't
      // additionally filter by that string against names/content.
      if (unlocked) return isHidden ? true : matchesQuery(c, q);
      return matchesQuery(c, q);
    });
  }, [convs, search, unlocked, user]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b bg-card/60 backdrop-blur-sm flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
          <Input
            aria-label="ابحث في المحادثات"
            placeholder="ابحث... (اكتب كلمة السر لإظهار المخفية)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-8"
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          title={hasPassword ? "تغيير/حذف كلمة السر" : "تعيين كلمة السر للإخفاء"}
          aria-label="إعدادات كلمة السر"
          onClick={() => setPwDialog(true)}
        >
          {hasPassword ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
        </Button>
      </div>

      {unlocked && (
        <div className="px-3 py-1.5 text-[11px] bg-primary/10 text-primary flex items-center gap-1.5">
          <KeyRound className="h-3 w-3" /> تم فتح المحادثات المخفية
        </div>
      )}

      <div className="overflow-y-auto flex-1 scrollbar-thin">
        {filtered.length === 0 && (
          <p className="text-center text-sm text-muted-foreground p-6">لا توجد محادثات</p>
        )}
        {filtered.map((c) => {
          const isHidden = user ? Prefs.isHidden(user.id, c.user_id) : false;
          return (
            <div key={c.user_id} className="flex items-center border-b border-border/50 hover:bg-accent/50">
              <button onClick={() => onOpenChat(c.profile)}
                className="flex-1 px-3 py-3 flex items-center gap-3 text-right min-w-0">
                <UserAvatar url={c.profile?.avatar_url} name={c.profile?.display_name || "?"} gender={c.profile?.gender} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium truncate flex items-center gap-1.5">
                      {isHidden && <EyeOff className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                      <span className="truncate">{c.profile?.display_name}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">
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
              <Button
                variant="ghost" size="icon"
                title={isHidden ? "إظهار المحادثة" : "إخفاء المحادثة"}
                aria-label={isHidden ? "إظهار المحادثة" : "إخفاء المحادثة"}
                onClick={(e) => { e.stopPropagation(); toggleHidden(c.user_id); }}
                className="mx-1 shrink-0"
              >
                {isHidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </Button>
            </div>
          );
        })}
      </div>

      <AlertDialog open={pwDialog} onOpenChange={setPwDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>كلمة سر إخفاء المحادثات</AlertDialogTitle>
            <AlertDialogDescription>
              كلمة السر تُحفظ محلياً على جهازك فقط (مُشفّرة SHA-256). اكتبها في شريط البحث لإظهار المحادثات المخفية.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Input type="password" placeholder="كلمة السر الجديدة" value={pw1} onChange={(e) => setPw1(e.target.value)} />
            <Input type="password" placeholder="تأكيد كلمة السر" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </div>
          <AlertDialogFooter className="gap-2">
            {hasPassword && (
              <Button variant="destructive" onClick={() => { clearPassword(); setPwDialog(false); }}>
                حذف كلمة السر
              </Button>
            )}
            <AlertDialogCancel onClick={() => { setPw1(""); setPw2(""); }}>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={savePassword}>حفظ</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function matchesQuery(c: Conv, q: string): boolean {
  const name = (c.profile?.display_name || "").toLowerCase();
  const uname = (c.profile?.username || "").toLowerCase();
  const last = (c.last_content || "").toLowerCase();
  return name.includes(q) || uname.includes(q) || last.includes(q);
}
