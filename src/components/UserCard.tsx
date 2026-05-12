import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "./UserAvatar";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { MessageSquare, UserPlus, User as UserIcon, Check } from "lucide-react";
import { toast } from "sonner";

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

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data: p } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
      if (p) setProfile(p as Profile);
      const { data: r } = await supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
      if (r) setRole(r.role);
      if (user && userId !== user.id) {
        const { data: f } = await supabase
          .from("friendships")
          .select("status,requester_id")
          .or(`and(requester_id.eq.${user.id},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${user.id})`)
          .maybeSingle();
        if (f) setFriendStatus(f.status === "accepted" ? "accepted" : "pending");
      }
    })();
  }, [userId, user]);

  const sendFriendRequest = async () => {
    if (!user || !userId) return;
    const { error } = await supabase.from("friendships").insert({ requester_id: user.id, addressee_id: userId });
    if (error) toast.error("لم نستطع إرسال الطلب");
    else { setFriendStatus("pending"); toast.success("تم إرسال طلب الصداقة"); }
  };

  if (!profile) return null;
  const isMe = user?.id === profile.id;

  return (
    <Dialog open={!!userId} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-center">الملف الشخصي</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3 pt-2">
          <UserAvatar url={profile.avatar_url} name={profile.display_name} gender={profile.gender} size="xl" />
          <div className="text-center">
            <h3 className="text-lg font-bold">{profile.display_name}</h3>
            <p className="text-sm text-muted-foreground">@{profile.username}</p>
            <div className="flex gap-2 justify-center mt-2">
              <span className="text-xs px-2 py-0.5 rounded-full bg-accent text-accent-foreground">
                {role === "admin" ? "مدير" : role === "moderator" ? "مراقب" : role === "visitor" ? "زائر" : "عضو"}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-secondary">
                {profile.gender === "male" ? "ذكر" : profile.gender === "female" ? "أنثى" : "غير محدد"}
              </span>
            </div>
            {profile.bio && <p className="mt-3 text-sm text-muted-foreground">{profile.bio}</p>}
          </div>

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
            </div>
          )}
          {isMe && (
            <Button variant="outline" className="w-full gap-2" onClick={() => { window.location.hash = "#profile"; onClose(); }}>
              <UserIcon className="h-4 w-4" /> تعديل الملف
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
