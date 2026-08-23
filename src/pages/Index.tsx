import { lazy, Suspense, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { RoomChat } from "@/components/RoomChat";
import { PrivateChat } from "@/components/PrivateChat";
import { UsersList } from "@/components/UsersList";
import { FriendsList } from "@/components/FriendsList";
import { ConversationsList } from "@/components/ConversationsList";
import { UserCard } from "@/components/UserCard";
import { IncomingCallListener } from "@/components/IncomingCallListener";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Menu, MessageCircle, Users, UserCog, Hash, Bell, UserPlus, RefreshCw, MonitorPlay } from "lucide-react";
import { cn } from "@/lib/utils";
import { checkForUpdate } from "@/lib/register-sw";
import { toast } from "sonner";

const ProfileEditor = lazy(() =>
  import("@/components/ProfileEditor").then((m) => ({ default: m.ProfileEditor })),
);

const ROOMS_CACHE_KEY = "cache:rooms:v1";

interface Room { id: string; name: string; description: string | null; icon: string | null; }

export default function Index() {
  const navigate = useNavigate();
  const { user, profile, loading } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [activePrivate, setActivePrivate] = useState<any | null>(null);
  const [openUserId, setOpenUserId] = useState<string | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [friendReqCount, setFriendReqCount] = useState(0);
  const [sidebarTab, setSidebarTab] = useState("rooms");
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [onlineCount, setOnlineCount] = useState(0);
  const [showOnline, setShowOnline] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [showAds, setShowAds] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate("/auth");
  }, [user, loading, navigate]);

  // Prefetch the ProfileEditor chunk when the browser is idle so opening the
  // dialog is instant, even on slow connections.
  useEffect(() => {
    if (!user) return;
    const idle = (cb: () => void) => {
      const w = window as any;
      if (typeof w.requestIdleCallback === "function") w.requestIdleCallback(cb, { timeout: 3000 });
      else setTimeout(cb, 1500);
    };
    idle(() => { import("@/components/ProfileEditor").catch(() => {}); });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    // instant paint from cache
    try {
      const cached = localStorage.getItem(ROOMS_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as Room[];
        if (Array.isArray(parsed) && parsed.length) {
          setRooms(parsed);
          if (!activeRoom) setActiveRoom(parsed[0]);
        }
      }
    } catch {}
    supabase.from("rooms").select("id,name,description,icon").order("created_at").then(({ data }) => {
      if (data) {
        setRooms(data as Room[]);
        if (!activeRoom && data.length) setActiveRoom(data[0] as Room);
        try { localStorage.setItem(ROOMS_CACHE_KEY, JSON.stringify(data)); } catch {}
      }
    });
    supabase.from("profiles").update({ is_online: true, last_seen: new Date().toISOString() }).eq("id", user.id).then();
    const offline = () => {
      supabase.from("profiles").update({ is_online: false }).eq("id", user.id).then();
    };
    window.addEventListener("beforeunload", offline);
    return () => { offline(); window.removeEventListener("beforeunload", offline); };
  }, [user]);

  // unread counters
  useEffect(() => {
    if (!user) return;
    const refresh = async () => {
      const [{ count: pm }, { count: fr }] = await Promise.all([
        supabase.from("private_messages").select("*", { count: "exact", head: true })
          .eq("recipient_id", user.id).eq("is_read", false),
        supabase.from("friendships").select("*", { count: "exact", head: true })
          .eq("addressee_id", user.id).eq("status", "pending"),
      ]);
      setUnreadTotal(pm || 0);
      setFriendReqCount(fr || 0);
    };
    refresh();
    const ch = supabase.channel(`unread-${user.id}-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "private_messages" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  // online members count — realtime + polling + refresh on dialog open
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const refresh = async () => {
      const { count, error } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("is_online", true);
      if (!cancelled && !error) setOnlineCount(count || 0);
    };
    refresh();
    const ch = supabase
      .channel(`online-count-${user.id}-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "profiles" }, refresh)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, refresh)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "profiles" }, refresh)
      .subscribe();
    const t = setInterval(refresh, 20000);
    const onVis = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [user, showOnline]);

  if (loading || !user || !profile) {
    return <div className="min-h-screen flex items-center justify-center gradient-hero"><div className="animate-pulse-dot text-primary">جارٍ التحميل...</div></div>;
  }

  const openTab = (tab: string) => {
    setSidebarTab(tab);
    setMobileSheetOpen(true);
  };

  const notifCount = unreadTotal + friendReqCount;

  const Sidebar = (
    <div className="h-full flex flex-col bg-card border-l">
      <div className="p-3 border-b flex items-center gap-3">
        <UserAvatar url={profile.avatar_url} name={profile.display_name} gender={profile.gender} size="md" online onClick={() => setShowProfile(true)} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">{profile.display_name}</div>
          <div className="text-xs text-muted-foreground">@{profile.username}{profile.age ? ` · ${profile.age}` : ""}</div>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setShowProfile(true)} aria-label="فتح الملف الشخصي"><UserCog className="h-4 w-4" /></Button>
      </div>

      <Tabs value={sidebarTab} onValueChange={setSidebarTab} className="flex-1 flex flex-col min-h-0">
        <TabsList className="grid grid-cols-4 mx-2 mt-2">
          <TabsTrigger value="rooms" aria-label="الغرف"><Hash className="h-4 w-4" /></TabsTrigger>
          <TabsTrigger value="users" aria-label="المستخدمون"><Users className="h-4 w-4" /></TabsTrigger>
          <TabsTrigger value="friends" className="relative" aria-label="الأصدقاء">
            <UserPlus className="h-4 w-4" />
            {friendReqCount > 0 && (
              <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center">
                {friendReqCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="pm" className="relative" aria-label="الرسائل الخاصة">
            <MessageCircle className="h-4 w-4" />
            {unreadTotal > 0 && (
              <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center">
                {unreadTotal}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rooms" className="flex-1 overflow-y-auto m-0 mt-2 scrollbar-thin">
          {rooms.map((r) => (
            <button key={r.id} onClick={() => { setActiveRoom(r); setActivePrivate(null); setMobileSheetOpen(false); }}
              className={cn("w-full px-3 py-3 flex items-center gap-3 hover:bg-accent/50 text-right border-b border-border/50",
                activeRoom?.id === r.id && "bg-accent")}>
              <span className="text-xl">{r.icon || "💬"}</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium">{r.name}</div>
                {r.description && <div className="text-xs text-muted-foreground truncate">{r.description}</div>}
              </div>
            </button>
          ))}
        </TabsContent>
        <TabsContent value="users" className="flex-1 m-0 mt-2 min-h-0">
          <UsersList onUserClick={(id) => { setOpenUserId(id); setMobileSheetOpen(false); }} />
        </TabsContent>
        <TabsContent value="friends" className="flex-1 m-0 mt-2 min-h-0">
          <FriendsList onOpenChat={(p) => { setActivePrivate(p); setActiveRoom(null); setMobileSheetOpen(false); }} />
        </TabsContent>
        <TabsContent value="pm" className="flex-1 m-0 mt-2 min-h-0">
          <ConversationsList onOpenChat={(p) => { setActivePrivate(p); setActiveRoom(null); setMobileSheetOpen(false); }} />
        </TabsContent>
      </Tabs>
    </div>
  );

  const QuickAction = ({
    icon,
    label,
    tip,
    shortcut,
    onClick,
    badge,
    badgeClass,
    active,
    loading,
  }: {
    icon: React.ReactNode;
    label: string;
    tip: string;
    shortcut?: string;
    onClick: () => void;
    badge?: number;
    badgeClass?: string;
    active?: boolean;
    loading?: boolean;
  }) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          aria-label={label}
          aria-pressed={!!active}
          aria-busy={!!loading}
          disabled={loading}
          onClick={onClick}
          className={cn(
            "h-auto flex-col gap-0.5 px-2 py-1 relative transition-all active:scale-95",
            active && "bg-accent text-accent-foreground ring-1 ring-primary/40",
            loading && "opacity-70",
          )}
        >
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : icon}
          <span className="text-[10px] leading-none">{label}</span>
          {typeof badge === "number" && badge > 0 && (
            <span className={cn(
              "absolute top-0 right-0 h-4 min-w-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center",
              badgeClass || "bg-destructive text-destructive-foreground",
            )}>
              {badge > 99 ? "99+" : badge}
            </span>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent className="flex items-center gap-2">
        <span>{tip}</span>
        {shortcut && (
          <kbd className="rounded border border-border/60 bg-muted px-1 py-0.5 text-[10px] font-mono">{shortcut}</kbd>
        )}
      </TooltipContent>
    </Tooltip>
  );

  // Top quick-action bar inside the main chat area
  const QuickBar = activeRoom && !activePrivate ? (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center justify-end gap-1 px-3 py-2 border-b bg-card/60 backdrop-blur-sm">
        <QuickAction
          icon={<RefreshCw className="h-5 w-5" />}
          label="تحديث"
          tip="التحقق من وجود إصدار جديد للتطبيق"
          shortcut="Alt+U"
          loading={checkingUpdate}
          onClick={runUpdateCheck}
        />
        <QuickAction
          icon={<MonitorPlay className="h-5 w-5" />}
          label="شاهد واربح"
          tip={`شاهد الإعلانات واكسب نقاطًا — رصيدك: ${points} نقطة`}
          shortcut="Alt+W"
          badge={points}
          badgeClass="bg-amber-500 text-white"
          active={showAds}
          onClick={() => setShowAds(true)}
        />
        <QuickAction
          icon={<Users className="h-5 w-5" />}
          label="المتصلون"
          tip="عرض الأعضاء المتصلين حاليًا والبحث عنهم"
          shortcut="Alt+O"
          badge={onlineCount}
          badgeClass="bg-emerald-500 text-white"
          active={showOnline}
          onClick={() => setShowOnline(true)}
        />
        <QuickAction
          icon={<MessageCircle className="h-5 w-5" />}
          label="الرسائل"
          tip="فتح المحادثات الخاصة والرسائل غير المقروءة"
          shortcut="Alt+M"
          badge={unreadTotal}
          active={mobileSheetOpen && sidebarTab === "pm"}
          onClick={() => openTab("pm")}
        />
        <QuickAction
          icon={<UserPlus className="h-5 w-5" />}
          label="الأصدقاء"
          tip="قائمة الأصدقاء وطلبات الصداقة"
          shortcut="Alt+F"
          badge={friendReqCount}
          active={mobileSheetOpen && sidebarTab === "friends"}
          onClick={() => openTab("friends")}
        />
        <QuickAction
          icon={<Bell className="h-5 w-5" />}
          label="الإشعارات"
          tip="كل الإشعارات: رسائل جديدة وطلبات صداقة"
          shortcut="Alt+N"
          badge={notifCount}
          onClick={() => openTab("friends")}
        />
      </div>
    </TooltipProvider>
  ) : null;


  return (
    <div className="h-screen flex bg-background overflow-hidden">
      <Helmet>
        <title>دردشة عربية — غرف ورسائل ومكالمات مباشرة</title>
        <meta name="description" content="انضم لمجتمع الدردشة العربي: غرف عامة، رسائل خاصة، ومكالمات صوت وفيديو مجانية." />
        <link rel="canonical" href="https://script-pair-spark.lovable.app/" />
        <meta property="og:title" content="دردشة عربية — غرف ورسائل ومكالمات مباشرة" />
        <meta property="og:description" content="غرف عامة، رسائل خاصة، ومكالمات صوت وفيديو مجانية." />
        <meta property="og:url" content="https://script-pair-spark.lovable.app/" />
      </Helmet>
      <h1 className="sr-only">دردشة عربية — مجتمع الدردشة العربي المباشر</h1>

      <aside className="hidden md:block w-80 shrink-0">{Sidebar}</aside>

      <div className="md:hidden absolute top-0 inset-x-0 z-30 h-14 bg-card/90 backdrop-blur-sm border-b flex items-center justify-between px-3">
        <Sheet open={mobileSheetOpen} onOpenChange={setMobileSheetOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="فتح القائمة" className="relative">
              <Menu className="h-5 w-5" />
              {notifCount > 0 && <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-destructive" />}
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="p-0 w-80">{Sidebar}</SheetContent>
        </Sheet>
        <div className="font-semibold">{activeRoom?.name || activePrivate?.display_name || "دردشة"}</div>
        <UserAvatar url={profile.avatar_url} name={profile.display_name} gender={profile.gender} size="sm" onClick={() => setShowProfile(true)} />
      </div>

      <main className="flex-1 min-w-0 pt-14 md:pt-0 flex flex-col">
        {QuickBar}
        <div className="flex-1 min-h-0">
          {activePrivate ? (
            <PrivateChat otherUser={activePrivate} onBack={() => setActivePrivate(null)} onAvatarClick={setOpenUserId} />
          ) : activeRoom ? (
            <RoomChat roomId={activeRoom.id} roomName={activeRoom.name} onAvatarClick={setOpenUserId} />
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground">اختر غرفة للبدء</div>
          )}
        </div>
      </main>

      <UserCard userId={openUserId} onClose={() => setOpenUserId(null)}
        onPrivateMessage={(_, p) => { setActivePrivate(p); setActiveRoom(null); }} />

      <Dialog open={showProfile} onOpenChange={setShowProfile}>
        <DialogContent>
          <DialogHeader><DialogTitle>الملف الشخصي</DialogTitle></DialogHeader>
          <Suspense fallback={<div className="py-8 text-center text-muted-foreground animate-pulse">...</div>}>
            <ProfileEditor onClose={() => setShowProfile(false)} />
          </Suspense>
        </DialogContent>
      </Dialog>

      <Dialog open={showOnline} onOpenChange={setShowOnline}>
        <DialogContent className="p-0 max-w-md h-[80vh] flex flex-col overflow-hidden">
          <DialogHeader className="p-3 border-b">
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-4 w-4" /> الأعضاء ({onlineCount} متصل)
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            <UsersList onUserClick={(id) => { setOpenUserId(id); setShowOnline(false); }} />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showAds} onOpenChange={setShowAds}>
        <DialogContent className="p-0 max-w-md h-[80vh] flex flex-col overflow-hidden">
          <DialogHeader className="p-3 border-b">
            <DialogTitle className="flex items-center gap-2">
              <MonitorPlay className="h-4 w-4" /> شاهد واربح
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <div className="aspect-video rounded-lg bg-muted flex items-center justify-center">
                <MonitorPlay className="h-10 w-10 text-muted-foreground" />
              </div>
              <div className="font-semibold">شاهد إعلانًا واكسب نقاطًا</div>
              <p className="text-sm text-muted-foreground">
                قريبًا: شاهد مقاطع مختارة واحصل على مكافآت داخل التطبيق.
              </p>
              <Button className="w-full" disabled>شاهد الآن</Button>
            </div>
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <div className="font-semibold">رصيدك الحالي</div>
              <div className="text-3xl font-bold text-primary">0 <span className="text-sm font-normal text-muted-foreground">نقطة</span></div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <IncomingCallListener />
    </div>
  );
}
