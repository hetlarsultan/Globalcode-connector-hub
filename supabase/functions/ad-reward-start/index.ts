import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { sign } from "../_shared/hmac.ts";

// Starts a rewarded-ad session for the signed-in user.
// Returns a unique transaction_id + a signed nonce that must be echoed by the
// ad network in its server-side verification (SSV) callback.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);

    const userId = userData.user.id;

    // The approved operation value/type is configured by the app owner.
    const requested = new URL(req.url).searchParams.get("ad_type");
    const { data: placement } = await supabase
      .from("ad_placements")
      .select("ad_type,label")
      .eq("is_active", true)
      .eq(requested ? "ad_type" : "is_active", requested ?? true)
      .limit(1)
      .maybeSingle();
    if (!placement) return json({ error: "no_active_placement" }, 400);
    const transactionId = crypto.randomUUID();
    const secret = Deno.env.get("AD_SSV_SECRET")!;
    const nonce = await sign(secret, `${userId}:${transactionId}`);

    return json({
      user_id: userId,
      transaction_id: transactionId,
      nonce,
      ad_type: placement.ad_type,
      ad_label: placement.label,
    });
  } catch (e) {
    console.error("ad-reward-start error", e);
    return json({ error: "internal_error" }, 500);
  }
});
