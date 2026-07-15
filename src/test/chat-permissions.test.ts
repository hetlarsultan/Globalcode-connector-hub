import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8");

describe("RoomChat — image sending is fully disabled", () => {
  const src = read("src/components/RoomChat.tsx");

  it("does not import the ImageIcon from lucide-react", () => {
    expect(src).not.toMatch(/Image as ImageIcon|\bImageIcon\b/);
  });

  it("does not render a file input for images", () => {
    expect(src).not.toMatch(/type=["']file["']/);
    expect(src).not.toMatch(/accept=["']image\//);
  });

  it("does not upload to the chat-images storage bucket", () => {
    expect(src).not.toMatch(/storage\s*\.\s*from\(["']chat-images["']\)/);
    expect(src).not.toMatch(/uploadImage\s*\(/);
  });

  it("send() never accepts a URL argument from an upload flow", () => {
    // send may still receive optional imageUrl param but no caller passes one
    expect(src).not.toMatch(/send\(\s*[^)]*publicUrl/);
  });
});

describe("PrivateChat — images are allowed with proper flow", () => {
  const src = read("src/components/PrivateChat.tsx");

  it("renders a hidden file input restricted to images", () => {
    expect(src).toMatch(/type=["']file["']/);
    expect(src).toMatch(/accept=["']image\/\*["']/);
  });

  it("uploads to the chat-images bucket scoped under the user's uid folder", () => {
    expect(src).toMatch(/storage\.from\(["']chat-images["']\)\.upload/);
    expect(src).toMatch(/\$\{user\.id\}\//);
  });

  it("rejects unsupported mime types (svg + non-image)", () => {
    expect(src).toMatch(/image\/svg\+xml/);
    expect(src).toMatch(/startsWith\(["']image\/["']\)/);
  });

  it("consumes the image on the recipient side (self-destruct)", () => {
    expect(src).toMatch(/consume_pm_image/);
  });
});

describe("Auth login — clear, actionable mismatch messages", () => {
  const src = read("src/pages/Auth.tsx");

  it("validates username length before hitting the server", () => {
    expect(src).toMatch(/اسم المستخدم غير صحيح/);
    expect(src).toMatch(/uname\.length\s*<\s*3/);
  });

  it("validates password length before hitting the server", () => {
    expect(src).toMatch(/كلمة المرور غير صحيحة/);
    expect(src).toMatch(/loginPass\.length\s*<\s*6/);
  });

  it("shows a specific mismatch message with guidance", () => {
    expect(src).toMatch(/بيانات الدخول غير متطابقة/);
    expect(src).toMatch(/تأكد من اسم المستخدم وكلمة المرور/);
  });

  it("differentiates unconfirmed-account and network errors", () => {
    expect(src).toMatch(/الحساب غير مُفعّل/);
    expect(src).toMatch(/تعذّر الاتصال بالخادم/);
  });

  it("removed the age field from the login form", () => {
    // signup form still has age; login form must not
    const login = src.split('TabsContent value="login"')[1]?.split('TabsContent value="signup"')[0] || "";
    expect(login).not.toMatch(/loginAge|العمر/);
  });
});

describe("auth-helpers — username → email mapping is deterministic", () => {
  it("lowercases and trims usernames", async () => {
    const { usernameToEmail } = await import("@/lib/auth-helpers");
    expect(usernameToEmail("  Ali_01 ")).toBe("ali_01@chat.local");
    expect(usernameToEmail("USER")).toBe("user@chat.local");
  });
});

describe("ProfileEditor — avatar upload guards", () => {
  const src = read("src/components/ProfileEditor.tsx");

  it("restricts avatar file input to safe image types", () => {
    expect(src).toMatch(/accept=["']image\/jpeg,image\/png,image\/webp,image\/gif["']/);
    expect(src).toMatch(/ALLOWED_IMAGE_TYPES\s*=\s*\[[^\]]*image\/jpeg/);
  });

  it("enforces a 5MB avatar size limit", () => {
    expect(src).toMatch(/MAX_AVATAR_SIZE\s*=\s*5\s*\*\s*1024\s*\*\s*1024/);
  });

  it("uploads under the user's uid folder in the avatars bucket", () => {
    expect(src).toMatch(/storage\.from\(["']avatars["']\)\.upload/);
    expect(src).toMatch(/\$\{user\.id\}\/avatar-/);
  });

  it("surfaces clear RLS/permission errors to the user", () => {
    expect(src).toMatch(/لا توجد صلاحيات للتخزين/);
    expect(src).toMatch(/violates row-level/);
  });

  it("limits retry attempts", () => {
    expect(src).toMatch(/MAX_UPLOAD_RETRIES\s*=\s*3/);
  });
});
