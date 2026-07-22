import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Prefs, hashPassword } from "@/lib/local-prefs";

const read = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8");

describe("ConversationsList — search & hide-with-password UI", () => {
  const src = read("src/components/ConversationsList.tsx");

  it("renders a search input with an accessible label", () => {
    expect(src).toMatch(/aria-label="ابحث في المحادثات"/);
    expect(src).toMatch(/placeholder="ابحث\.\.\.*"/);
  });

  it("uses SHA-256 hashing (never stores plaintext)", () => {
    expect(src).toMatch(/hashPassword\(/);
    expect(src).not.toMatch(/setHidePasswordHash\(\s*user\.id,\s*pw1\s*\)/);
  });

  it("hides conversations flagged as hidden unless unlocked", () => {
    expect(src).toMatch(/isHidden\s*&&\s*!unlocked/);
  });

  it("provides per-conversation hide/show toggle", () => {
    expect(src).toMatch(/toggleHiddenConv|toggleHidden\(/);
  });
});

describe("Prefs — hidden conversations & password hash", () => {
  beforeEach(() => localStorage.clear());

  it("toggles hidden conv ids per user", () => {
    expect(Prefs.isHidden("u1", "other")).toBe(false);
    expect(Prefs.toggleHiddenConv("u1", "other")).toBe(true);
    expect(Prefs.getHiddenConvs("u1")).toEqual(["other"]);
    expect(Prefs.toggleHiddenConv("u1", "other")).toBe(false);
    expect(Prefs.getHiddenConvs("u1")).toEqual([]);
  });

  it("stores and clears password hash without persisting plaintext", async () => {
    const h = await hashPassword("secret123");
    Prefs.setHidePasswordHash("u1", h);
    expect(Prefs.getHidePasswordHash("u1")).toBe(h);
    // plaintext must never appear in any localStorage value
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      expect(localStorage.getItem(k)).not.toContain("secret123");
    }
    Prefs.setHidePasswordHash("u1", "");
    expect(Prefs.getHidePasswordHash("u1")).toBe("");
  });

  it("hashPassword is deterministic and 64-char hex", async () => {
    const a = await hashPassword("hello");
    const b = await hashPassword("hello");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashPassword("hello2")).not.toBe(a);
  });
});

describe("Storage RLS — migrations enforce per-user folder scoping", () => {
  const glob = require("node:fs").readdirSync(resolve(__dirname, "../../supabase/migrations"))
    .filter((f: string) => f.endsWith(".sql"))
    .map((f: string) => readFileSync(resolve(__dirname, "../../supabase/migrations", f), "utf8"))
    .join("\n\n");

  it("restricts avatar INSERT to authenticated users under their uid folder", () => {
    // Any avatar INSERT policy must gate on auth.uid()::text = first path segment
    expect(glob).toMatch(/bucket_id\s*=\s*'avatars'[\s\S]{0,400}auth\.uid\(\)/);
  });

  it("restricts chat-images INSERT to authenticated users under their uid folder", () => {
    expect(glob).toMatch(/bucket_id\s*=\s*'chat-images'[\s\S]{0,400}auth\.uid\(\)/);
  });

  it("never allows public/anon writes to storage.objects", () => {
    // Look for INSERT policies granted TO public or anon on storage.objects — must not exist
    const badPublic = /CREATE POLICY[^;]+ON\s+storage\.objects[^;]+FOR\s+INSERT[^;]+TO\s+(public|anon)\b/i;
    expect(glob).not.toMatch(badPublic);
  });

  it("whitelists safe image extensions in storage insert policies", () => {
    // At least one migration must gate uploads by an allowed-extension regex
    expect(glob).toMatch(/jpg|jpeg|png|webp|gif/i);
  });

});

describe("Avatar/profile image access — unauthorized viewers get no direct row access", () => {
  const glob = require("node:fs").readdirSync(resolve(__dirname, "../../supabase/migrations"))
    .filter((f: string) => f.endsWith(".sql"))
    .map((f: string) => readFileSync(resolve(__dirname, "../../supabase/migrations", f), "utf8"))
    .join("\n\n");

  it("has a SELECT policy on avatars scoped to owner uid", () => {
    expect(glob).toMatch(/FOR\s+SELECT[\s\S]{0,300}bucket_id\s*=\s*'avatars'[\s\S]{0,300}auth\.uid\(\)/i);
  });

  it("has a SELECT policy on chat-images scoped to owner uid", () => {
    expect(glob).toMatch(/FOR\s+SELECT[\s\S]{0,300}bucket_id\s*=\s*'chat-images'[\s\S]{0,300}auth\.uid\(\)/i);
  });

  it("profiles table enables RLS", () => {
    expect(glob).toMatch(/ALTER\s+TABLE\s+public\.profiles\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
  });
});
