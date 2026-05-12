import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { UserAvatar } from "./UserAvatar";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { toast } from "sonner";
import { Camera, LogOut } from "lucide-react";

export function ProfileEditor({ onClose }: { onClose: () => void }) {
  const { profile, refreshProfile, signOut } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name);
      setBio(profile.bio || "");
      setAvatarUrl(profile.avatar_url || "");
    }
  }, [profile]);

  const upload = async (file: File) => {
    if (!profile) return;
    const path = `${profile.id}/avatar-${Date.now()}.${file.name.split(".").pop()}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (error) return toast.error("فشل رفع الصورة");
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    setAvatarUrl(data.publicUrl);
    await supabase.from("profiles").update({ avatar_url: data.publicUrl }).eq("id", profile.id);
    await refreshProfile();
    toast.success("تم تحديث الصورة");
  };

  const save = async () => {
    if (!profile) return;
    setSaving(true);
    await supabase.from("profiles").update({ display_name: displayName, bio }).eq("id", profile.id);
    await refreshProfile();
    setSaving(false);
    toast.success("تم الحفظ");
    onClose();
  };

  if (!profile) return null;

  return (
    <div className="p-4 space-y-4 max-w-md mx-auto">
      <div className="flex flex-col items-center gap-3">
        <div className="relative">
          <UserAvatar url={avatarUrl || profile.avatar_url} name={displayName} gender={profile.gender} size="xl" />
          <button onClick={() => fileRef.current?.click()}
            className="absolute -bottom-1 -left-1 h-9 w-9 rounded-full gradient-primary shadow-glow flex items-center justify-center text-primary-foreground">
            <Camera className="h-4 w-4" />
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>الاسم المعروض</Label>
        <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>النبذة</Label>
        <Textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} />
      </div>
      <div className="flex gap-2">
        <Button onClick={save} disabled={saving} className="flex-1 gradient-primary border-0">حفظ</Button>
        <Button variant="outline" onClick={onClose}>إلغاء</Button>
      </div>
      <Button variant="outline" onClick={signOut} className="w-full text-destructive gap-2">
        <LogOut className="h-4 w-4" /> تسجيل الخروج
      </Button>
    </div>
  );
}
