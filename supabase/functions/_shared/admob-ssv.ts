// Verification of Google AdMob server-side verification (SSV) callbacks.
// Google signs the callback query string with ECDSA P-256; public keys are
// published at the URL below and rotate rarely, so they are cached in memory.
//
// Docs: the signed content is the query string from the first parameter up to
// (but excluding) "&signature=".

const KEYS_URL = "https://gstatic.com/admob/reward/verifier-keys.json";

interface VerifierKey {
  keyId: number;
  pem: string;
  base64: string;
}

let cache: { at: number; keys: VerifierKey[] } | null = null;

async function getKeys(): Promise<VerifierKey[]> {
  if (cache && Date.now() - cache.at < 24 * 60 * 60 * 1000) return cache.keys;
  const res = await fetch(KEYS_URL);
  if (!res.ok) throw new Error("verifier_keys_unavailable");
  const body = await res.json();
  const keys: VerifierKey[] = (body.keys ?? []).map((k: Record<string, unknown>) => ({
    keyId: Number(k.keyId),
    pem: String(k.pem ?? ""),
    base64: String(k.base64 ?? ""),
  }));
  cache = { at: Date.now(), keys };
  return keys;
}

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** DER (SEQUENCE of two INTEGERs) -> raw r|s (64 bytes) for WebCrypto. */
function derToRaw(der: Uint8Array): Uint8Array {
  let i = 0;
  if (der[i++] !== 0x30) throw new Error("bad_der");
  if (der[i] & 0x80) i += 1 + (der[i] & 0x7f); else i += 1;
  const readInt = () => {
    if (der[i++] !== 0x02) throw new Error("bad_der");
    let len = der[i++];
    let v = der.slice(i, i + len);
    i += len;
    while (v.length > 32 && v[0] === 0) v = v.slice(1);
    const out = new Uint8Array(32);
    out.set(v, 32 - v.length);
    return out;
  };
  const r = readInt();
  const s = readInt();
  const raw = new Uint8Array(64);
  raw.set(r, 0);
  raw.set(s, 32);
  return raw;
}

/**
 * Verifies an AdMob SSV callback URL.
 * @param rawUrl the full callback URL as received (query order matters).
 */
export async function verifyAdMobCallback(rawUrl: string): Promise<boolean> {
  const url = new URL(rawUrl);
  const query = url.search.startsWith("?") ? url.search.slice(1) : url.search;
  const sigIndex = query.indexOf("&signature=");
  if (sigIndex < 0) return false;
  const signedContent = query.slice(0, sigIndex);

  const params = new URLSearchParams(query);
  const signature = params.get("signature") ?? "";
  const keyId = Number(params.get("key_id") ?? NaN);
  if (!signature || !Number.isFinite(keyId)) return false;

  const keys = await getKeys();
  const key = keys.find((k) => k.keyId === keyId);
  if (!key) return false;

  const spki = b64urlToBytes(key.base64.replace(/\s+/g, ""));
  const cryptoKey = await crypto.subtle.importKey(
    "spki",
    spki,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );

  let raw: Uint8Array;
  try {
    raw = derToRaw(b64urlToBytes(signature));
  } catch {
    return false;
  }

  return await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    raw,
    new TextEncoder().encode(signedContent),
  );
}
