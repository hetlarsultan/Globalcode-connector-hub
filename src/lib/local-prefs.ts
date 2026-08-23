// Local-only preferences (no DB changes). Keyed by current user id.

const K = {
  sound: (uid: string) => `pref:sound:${uid}`,
  nameColor: (uid: string) => `pref:nameColor:${uid}`,
  textColor: (uid: string) => `pref:textColor:${uid}`,
  fontFamily: (uid: string) => `pref:fontFamily:${uid}`,
  blocks: (uid: string) => `pref:blocks:${uid}`,
  likes: (targetId: string) => `pref:likes:${targetId}`,
  likedBy: (uid: string) => `pref:likedBy:${uid}`,
  age: (uid: string) => `pref:age:${uid}`,
  hideConvs: (uid: string) => `pref:hideConvs:${uid}`,
  hidePass: (uid: string) => `pref:hidePass:${uid}`,
  points: (uid: string) => `pref:points:${uid}`,
};

// SHA-256 hex hash for the private-chat unlock password (never store plaintext).
export async function hashPassword(pw: string): Promise<string> {
  const buf = new TextEncoder().encode(pw);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}


export const Prefs = {
  getSound: (uid: string) => localStorage.getItem(K.sound(uid)) !== "off",
  setSound: (uid: string, on: boolean) => localStorage.setItem(K.sound(uid), on ? "on" : "off"),

  getNameColor: (uid: string) => localStorage.getItem(K.nameColor(uid)) || "",
  setNameColor: (uid: string, v: string) => localStorage.setItem(K.nameColor(uid), v),

  getTextColor: (uid: string) => localStorage.getItem(K.textColor(uid)) || "",
  setTextColor: (uid: string, v: string) => localStorage.setItem(K.textColor(uid), v),

  getFontFamily: (uid: string) => localStorage.getItem(K.fontFamily(uid)) || "",
  setFontFamily: (uid: string, v: string) => localStorage.setItem(K.fontFamily(uid), v),

  getBlocks: (uid: string): string[] => {
    try { return JSON.parse(localStorage.getItem(K.blocks(uid)) || "[]"); } catch { return []; }
  },
  toggleBlock: (uid: string, target: string) => {
    const list = Prefs.getBlocks(uid);
    const next = list.includes(target) ? list.filter((x) => x !== target) : [...list, target];
    localStorage.setItem(K.blocks(uid), JSON.stringify(next));
    return next.includes(target);
  },

  hasLiked: (myId: string, targetId: string) =>
    (JSON.parse(localStorage.getItem(K.likedBy(myId)) || "[]") as string[]).includes(targetId),
  toggleLike: (myId: string, targetId: string) => {
    const mine = new Set<string>(JSON.parse(localStorage.getItem(K.likedBy(myId)) || "[]"));
    const count = parseInt(localStorage.getItem(K.likes(targetId)) || "0", 10);
    let nextCount = count;
    if (mine.has(targetId)) { mine.delete(targetId); nextCount = Math.max(0, count - 1); }
    else { mine.add(targetId); nextCount = count + 1; }
    localStorage.setItem(K.likedBy(myId), JSON.stringify([...mine]));
    localStorage.setItem(K.likes(targetId), String(nextCount));
    return { liked: mine.has(targetId), count: nextCount };
  },
  getLikes: (targetId: string) => parseInt(localStorage.getItem(K.likes(targetId)) || "0", 10),

  getAge: (uid: string) => {
    const v = parseInt(localStorage.getItem(K.age(uid)) || "0", 10);
    return Number.isFinite(v) && v > 0 ? v : 0;
  },
  setAge: (uid: string, age: number) => localStorage.setItem(K.age(uid), String(age)),

  // Hidden private-chat threads unlocked only when the search bar matches the password.
  getHiddenConvs: (uid: string): string[] => {
    try { return JSON.parse(localStorage.getItem(K.hideConvs(uid)) || "[]"); } catch { return []; }
  },
  isHidden: (uid: string, other: string) => Prefs.getHiddenConvs(uid).includes(other),
  toggleHiddenConv: (uid: string, other: string) => {
    const list = Prefs.getHiddenConvs(uid);
    const next = list.includes(other) ? list.filter((x) => x !== other) : [...list, other];
    localStorage.setItem(K.hideConvs(uid), JSON.stringify(next));
    return next.includes(other);
  },
  getHidePasswordHash: (uid: string) => localStorage.getItem(K.hidePass(uid)) || "",
  setHidePasswordHash: (uid: string, hash: string) => {
    if (hash) localStorage.setItem(K.hidePass(uid), hash);
    else localStorage.removeItem(K.hidePass(uid));
  },
};

export function tierFromLikes(n: number): { label: string; emoji: string; color: string } {
  if (n >= 100) return { label: "أسطورة", emoji: "👑", color: "hsl(45 90% 55%)" };
  if (n >= 50) return { label: "نخبة", emoji: "💎", color: "hsl(280 80% 60%)" };
  if (n >= 20) return { label: "متميز", emoji: "⭐", color: "hsl(210 90% 55%)" };
  if (n >= 5) return { label: "نشط", emoji: "🔥", color: "hsl(20 90% 55%)" };
  return { label: "جديد", emoji: "🌱", color: "hsl(142 60% 45%)" };
}

export const FONT_CHOICES = [
  { label: "افتراضي", value: "" },
  { label: "Cairo", value: "'Cairo', sans-serif" },
  { label: "Tajawal", value: "'Tajawal', sans-serif" },
  { label: "Amiri", value: "'Amiri', serif" },
  { label: "Reem Kufi", value: "'Reem Kufi', sans-serif" },
];

export const COLOR_CHOICES = [
  "", "#7c3aed", "#ec4899", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#a855f7",
];

// Plays a short blip sound using WebAudio (no asset needed)
let _ctx: AudioContext | null = null;
export function playPing() {
  try {
    _ctx = _ctx || new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = _ctx.createOscillator();
    const g = _ctx.createGain();
    o.type = "sine"; o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, _ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.15, _ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, _ctx.currentTime + 0.25);
    o.connect(g).connect(_ctx.destination);
    o.start(); o.stop(_ctx.currentTime + 0.26);
  } catch {}
}
