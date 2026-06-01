import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { UserAvatar } from "./UserAvatar";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";
import { toast } from "sonner";
import { Camera, LogOut, Trash2, Heart, Volume2 } from "lucide-react";
import { COLOR_CHOICES, FONT_CHOICES, Prefs, tierFromLikes } from "@/lib/local-prefs";
import { cn } from "@/lib/utils";

export function ProfileEditor({ onClose }: { onClose: () => void }) {
  const { profile, refreshProfile, signOut, user } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>("");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const uid = user?.id || "anon";
  const [sound, setSound] = useState(true);
  const [nameColor, setNameColor] = useState("");
  const [textColor, setTextColor] = useState("");
  const [fontFamily, setFontFamily] = useState("");
  const [likes, setLikes] = useState(0);
  const [age, setAge] = useState<string>("");

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name);
      setBio(profile.bio || "");
      setAvatarUrl(profile.avatar_url || "");
    }
    if (user) {
      setSound(Prefs.getSound(user.id));
      setNameColor(Prefs.getNameColor(user.id));
      setTextColor(Prefs.getTextColor(user.id));
      setFontFamily(Prefs.getFontFamily(user.id));
      setLikes(Prefs.getLikes(user.id));
      const metaAge = (user.user_metadata as any)?.age;
      const local = Prefs.getAge(user.id);
      const val = metaAge || local || 0;
      setAge(val ? String(val) : "");
    }
  }, [profile, user]);

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

  const removeAvatar = async () => {
    if (!profile) return;
    await supabase.from("profiles").update({ avatar_url: null }).eq("id", profile.id);
    setAvatarUrl(null);
    await refreshProfile();
    toast.success("تم حذف الصورة");
  };

  const save = async () => {
    if (!profile || !user) return;
    setSaving(true);
    await supabase.from("profiles").update({ display_name: displayName, bio }).eq("id", profile.id);
    Prefs.setSound(user.id, sound);
    Prefs.setNameColor(user.id, nameColor);
    Prefs.setTextColor(user.id, textColor);
    Prefs.setFontFamily(user.id, fontFamily);
    await refreshProfile();
    setSaving(false);
    toast.success("تم الحفظ");
    onClose();
  };

  if (!profile) return null;
  const tier = tierFromLikes(likes);

  return (
    <div className="p-1 space-y-5 max-w-md mx-auto max-h-[80vh] overflow-y-auto scrollbar-thin">
      <div className="flex flex-col items-center gap-3">
        <div className="relative">
          <UserAvatar url={avatarUrl || undefined} name={displayName} gender={profile.gender} size="xl" />
          <button onClick={() => fileRef.current?.click()}
            className="absolute -bottom-1 -left-1 h-9 w-9 rounded-full gradient-primary shadow-glow flex items-center justify-center text-primary-foreground hover:scale-105 transition">
            <Camera className="h-4 w-4" />
          </button>
          {avatarUrl && (
            <button onClick={removeAvatar}
              className="absolute -bottom-1 -right-1 h-9 w-9 rounded-full bg-destructive shadow flex items-center justify-center text-destructive-foreground hover:scale-105 transition">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </div>
        <div className="flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold" style={{ background: `${tier.color}22`, color: tier.color }}>
          <span>{tier.emoji}</span> {tier.label}
          <span className="opacity-70 flex items-center gap-0.5"><Heart className="h-3 w-3 fill-current" /> {likes}</span>
        </div>
      </div>

      <div className="space-y-2">
        <Label>الاسم المعروض</Label>
        <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)}
          style={nameColor ? { color: nameColor, fontWeight: 600 } : undefined} />
      </div>
      <div className="space-y-2">
        <Label>النبذة</Label>
        <Textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} />
      </div>

      <div className="space-y-2">
        <Label className="flex items-center gap-2"><span>لون الاسم</span></Label>
        <div className="flex flex-wrap gap-2">
          {COLOR_CHOICES.map((c) => (
            <button key={c || "default"} type="button" onClick={() => setNameColor(c)}
              className={cn("h-7 w-7 rounded-full border-2 transition", nameColor === c ? "border-primary scale-110" : "border-border")}
              style={{ background: c || "transparent" }}>
              {!c && <span className="text-[10px]">×</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>لون الخط في رسائلك</Label>
        <div className="flex flex-wrap gap-2">
          {COLOR_CHOICES.map((c) => (
            <button key={c || "default"} type="button" onClick={() => setTextColor(c)}
              className={cn("h-7 w-7 rounded-full border-2 transition", textColor === c ? "border-primary scale-110" : "border-border")}
              style={{ background: c || "transparent" }}>
              {!c && <span className="text-[10px]">×</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>نوع الخط</Label>
        <div className="grid grid-cols-2 gap-2">
          {FONT_CHOICES.map((f) => (
            <button key={f.value || "default"} type="button" onClick={() => setFontFamily(f.value)}
              className={cn("px-3 py-2 rounded-lg border text-sm transition", fontFamily === f.value ? "border-primary bg-accent" : "border-border")}
              style={{ fontFamily: f.value || undefined }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
        <Label className="flex items-center gap-2 cursor-pointer"><Volume2 className="h-4 w-4" /> إشعارات صوتية</Label>
        <Switch checked={sound} onCheckedChange={setSound} />
      </div>

      <div className="flex gap-2 pt-2">
        <Button onClick={save} disabled={saving} className="flex-1 gradient-primary border-0 shadow-glow">حفظ</Button>
        <Button variant="outline" onClick={onClose}>إلغاء</Button>
      </div>
      <Button variant="outline" onClick={signOut} className="w-full text-destructive gap-2 border-destructive/30">
        <LogOut className="h-4 w-4" /> تسجيل الخروج
      </Button>
    </div>
  );
}
