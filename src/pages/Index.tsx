import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { RoomChat } from "@/components/RoomChat";
import { PrivateChat } from "@/components/PrivateChat";
import { UsersList } from "@/components/UsersList";
import { FriendsList } from "@/components/FriendsList";
import { ConversationsList } from "@/components/ConversationsList";
import { UserCard } from "@/components/UserCard";
import { ProfileEditor } from "@/components/ProfileEditor";
import { IncomingCallListener } from "@/components/IncomingCallListener";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Menu, MessageCircle, Users, UserCog, Hash, Bell } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const [sidebarTab, setSidebarTab] = useState("rooms");

  useEffect(() => {
    if (!loading && !user) navigate("/auth");
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!user) return;
    supabase.from("rooms").select("*").order("created_at").then(({ data }) => {
      if (data) {
        setRooms(data as Room[]);
        if (!activeRoom && data.length) setActiveRoom(data[0] as Room);
      }
    });
    // mark presence online
    supabase.from("profiles").update({ is_online: true, last_seen: new Date().toISOString() }).eq("id", user.id).then();
    const offline = () => {
      supabase.from("profiles").update({ is_online: false }).eq("id", user.id).then();
    };
    window.addEventListener("beforeunload", offline);
    return () => { offline(); window.removeEventListener("beforeunload", offline); };
  }, [user]);

  // unread counter for private messages
  useEffect(() => {
    if (!user) return;
    const refresh = async () => {
      const { count } = await supabase.from("private_messages").select("*", { count: "exact", head: true })
        .eq("recipient_id", user.id).eq("is_read", false);
      setUnreadTotal(count || 0);
    };
    refresh();
    const ch = supabase.channel("unread")
      .on("postgres_changes", { event: "*", schema: "public", table: "private_messages" }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  if (loading || !user || !profile) {
    return <div className="min-h-screen flex items-center justify-center gradient-hero"><div className="animate-pulse-dot text-primary">جارٍ التحميل...</div></div>;
  }

  const Sidebar = (
    <div className="h-full flex flex-col bg-card border-l">
      <div className="p-3 border-b flex items-center gap-3">
        <UserAvatar url={profile.avatar_url} name={profile.display_name} gender={profile.gender} size="md" online onClick={() => setShowProfile(true)} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">{profile.display_name}</div>
          <div className="text-xs text-muted-foreground">@{profile.username}</div>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setShowProfile(true)}><UserCog className="h-4 w-4" /></Button>
      </div>

      <Tabs value={sidebarTab} onValueChange={setSidebarTab} className="flex-1 flex flex-col min-h-0">
        <TabsList className="grid grid-cols-4 mx-2 mt-2">
          <TabsTrigger value="rooms"><Hash className="h-4 w-4" /></TabsTrigger>
          <TabsTrigger value="users"><Users className="h-4 w-4" /></TabsTrigger>
          <TabsTrigger value="friends"><UserCog className="h-4 w-4" /></TabsTrigger>
          <TabsTrigger value="pm" className="relative">
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
            <button key={r.id} onClick={() => { setActiveRoom(r); setActivePrivate(null); }}
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
          <UsersList onUserClick={setOpenUserId} />
        </TabsContent>
        <TabsContent value="friends" className="flex-1 m-0 mt-2 min-h-0">
          <FriendsList onOpenChat={(p) => { setActivePrivate(p); setActiveRoom(null); }} />
        </TabsContent>
        <TabsContent value="pm" className="flex-1 m-0 mt-2 min-h-0">
          <ConversationsList onOpenChat={(p) => { setActivePrivate(p); setActiveRoom(null); }} />
        </TabsContent>
      </Tabs>
    </div>
  );

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:block w-80 shrink-0">{Sidebar}</aside>

      {/* Mobile header */}
      <div className="md:hidden absolute top-0 inset-x-0 z-30 h-14 bg-card/90 backdrop-blur-sm border-b flex items-center justify-between px-3">
        <Sheet>
          <SheetTrigger asChild><Button variant="ghost" size="icon"><Menu className="h-5 w-5" />{unreadTotal > 0 && <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-destructive" />}</Button></SheetTrigger>
          <SheetContent side="right" className="p-0 w-80">{Sidebar}</SheetContent>
        </Sheet>
        <div className="font-semibold">{activeRoom?.name || activePrivate?.display_name || "دردشة"}</div>
        <UserAvatar url={profile.avatar_url} name={profile.display_name} gender={profile.gender} size="sm" onClick={() => setShowProfile(true)} />
      </div>

      <main className="flex-1 min-w-0 pt-14 md:pt-0">
        {activePrivate ? (
          <PrivateChat otherUser={activePrivate} onBack={() => setActivePrivate(null)} onAvatarClick={setOpenUserId} />
        ) : activeRoom ? (
          <RoomChat roomId={activeRoom.id} roomName={activeRoom.name} onAvatarClick={setOpenUserId} />
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground">اختر غرفة للبدء</div>
        )}
      </main>

      <UserCard userId={openUserId} onClose={() => setOpenUserId(null)}
        onPrivateMessage={(_, p) => { setActivePrivate(p); setActiveRoom(null); }} />

      <Dialog open={showProfile} onOpenChange={setShowProfile}>
        <DialogContent>
          <DialogHeader><DialogTitle>الملف الشخصي</DialogTitle></DialogHeader>
          <ProfileEditor onClose={() => setShowProfile(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
