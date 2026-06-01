import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { UserAvatar } from "./UserAvatar";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { MessageSquare, UserPlus, User as UserIcon, Check, Ban, Heart } from "lucide-react";
import { toast } from "sonner";
import { Prefs, tierFromLikes } from "@/lib/local-prefs";
import { cn } from "@/lib/utils";

interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  gender: "male" | "female" | "unspecified";
}

interface Props {
  userId: string | null;
  onClose: () => void;
  onPrivateMessage: (userId: string, profile: Profile) => void;
}

export function UserCard({ userId, onClose, onPrivateMessage }: Props) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [friendStatus, setFriendStatus] = useState<"none" | "pending" | "accepted">("none");
  const [role, setRole] = useState<string>("member");
  const [blocked, setBlocked] = useState(false);
  const [likes, setLikes] = useState(0);
  const [liked, setLiked] = useState(false);

  useEffect(() => {
    if (!userId) { setProfile(null); return; }
    (async () => {
      const { data: p } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
      if (p) setProfile(p as Profile);
      const { data: r } = await supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
      if (r) setRole(r.role);
      if (user && userId !== user.id) {
        const { data: f } = await supabase.from("friendships").select("status,requester_id")
          .or(`and(requester_id.eq.${user.id},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${user.id})`)
          .maybeSingle();
        if (f) setFriendStatus(f.status === "accepted" ? "accepted" : "pending");
        setBlocked(Prefs.getBlocks(user.id).includes(userId));
        setLiked(Prefs.hasLiked(user.id, userId));
      }
      setLikes(Prefs.getLikes(userId));
    })();
  }, [userId, user]);

  const sendFriendRequest = async () => {
    if (!user || !userId) return;
    const { error } = await supabase.from("friendships").insert({ requester_id: user.id, addressee_id: userId });
    if (error) toast.error("لم نستطع إرسال الطلب");
    else { setFriendStatus("pending"); toast.success("تم إرسال طلب الصداقة"); }
  };

  const toggleBlock = () => {
    if (!user || !userId) return;
    const now = Prefs.toggleBlock(user.id, userId);
    setBlocked(now);
    toast.success(now ? "تم حظر المستخدم" : "تم إلغاء الحظر");
    window.dispatchEvent(new Event("blocks-changed"));
  };

  const toggleLike = () => {
    if (!user || !userId) return;
    const r = Prefs.toggleLike(user.id, userId);
    setLiked(r.liked);
    setLikes(r.count);
  };

  if (!profile) return null;
  const isMe = user?.id === profile.id;
  const tier = tierFromLikes(likes);
  const age = isMe
    ? ((user?.user_metadata as any)?.age || Prefs.getAge(profile.id) || 0)
    : (Prefs.getAge(profile.id) || 0);

  return (
    <Dialog open={!!userId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-center">الملف الشخصي</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3 pt-2">
          <UserAvatar url={profile.avatar_url} name={profile.display_name} gender={profile.gender} size="xl" />
          <div className="text-center">
            <h3 className="text-lg font-bold">{profile.display_name}</h3>
            <p className="text-sm text-muted-foreground">@{profile.username}</p>
            <div className="flex gap-2 justify-center mt-2 flex-wrap">
              <span className="text-xs px-2 py-0.5 rounded-full bg-accent text-accent-foreground">
                {role === "admin" ? "مدير" : role === "moderator" ? "مراقب" : role === "visitor" ? "زائر" : "عضو"}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-secondary">
                {profile.gender === "male" ? "ذكر" : profile.gender === "female" ? "أنثى" : "غير محدد"}
              </span>
              {age > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
                  {age} سنة
                </span>
              )}
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: `${tier.color}22`, color: tier.color }}>
                {tier.emoji} {tier.label}
              </span>
            </div>
            {profile.bio && <p className="mt-3 text-sm text-muted-foreground">{profile.bio}</p>}
          </div>

          <button onClick={toggleLike} disabled={isMe}
            className={cn("flex items-center gap-2 px-4 py-2 rounded-full border transition",
              liked ? "bg-destructive/10 border-destructive text-destructive" : "border-border hover:bg-accent",
              isMe && "opacity-60 cursor-default")}>
            <Heart className={cn("h-4 w-4", liked && "fill-current")} />
            <span className="font-semibold">{likes}</span>
            <span className="text-xs text-muted-foreground">{isMe ? "إعجاباتك" : liked ? "أعجبني" : "إعجاب"}</span>
          </button>

          {!isMe && (
            <div className="grid grid-cols-2 gap-2 w-full mt-2">
              <Button onClick={() => { onPrivateMessage(profile.id, profile); onClose(); }} className="gap-2">
                <MessageSquare className="h-4 w-4" /> رسالة خاصة
              </Button>
              <Button
                variant={friendStatus === "none" ? "outline" : "secondary"}
                onClick={sendFriendRequest}
                disabled={friendStatus !== "none"}
                className="gap-2"
              >
                {friendStatus === "accepted" ? <><Check className="h-4 w-4" /> صديق</> :
                 friendStatus === "pending" ? <>قيد الانتظار</> :
                 <><UserPlus className="h-4 w-4" /> إضافة صديق</>}
              </Button>
              <Button variant="outline" onClick={toggleBlock}
                className={cn("col-span-2 gap-2", blocked && "border-destructive text-destructive")}>
                <Ban className="h-4 w-4" /> {blocked ? "إلغاء الحظر" : "حظر المستخدم"}
              </Button>
            </div>
          )}
          {isMe && (
            <Button variant="outline" className="w-full gap-2" onClick={onClose}>
              <UserIcon className="h-4 w-4" /> إغلاق
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
