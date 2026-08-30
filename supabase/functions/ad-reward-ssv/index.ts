import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { verify } from "../_shared/hmac.ts";

// Server-side verification (SSV) callback, called by the ad network only.
// Never called by the app client. Credits 25% of the network-reported value
// to the user's in-app wallet, exactly once per transaction_id.
//
// Expected query params (GET) or JSON body (POST):
//   user_id, transaction_id, nonce, reward_amount, signature
// signature = HMAC_SHA256(AD_SSV_SECRET, `${user_id}:${transaction_id}:${nonce}:${reward_amount}`)
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    let params: Record<string, string> = {};
    if (req.method === "GET") {
      params = Object.fromEntries(new URL(req.url).searchParams.entries());
    } else {
      const body = await req.json().catch(() => ({}));
      params = Object.fromEntries(
        Object.entries(body ?? {}).map(([k, v]) => [k, String(v ?? "")]),
      );
    }

    const userId = params.user_id ?? "";
    const transactionId = params.transaction_id ?? "";
    const nonce = params.nonce ?? "";
    const rewardAmountRaw = params.reward_amount ?? "";
    const signature = params.signature ?? "";
    const network = params.ad_network || "rewarded";

    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const grossValue = Number(rewardAmountRaw);
    if (
      !uuidRe.test(userId) ||
      !transactionId ||
      transactionId.length > 128 ||
      !nonce ||
      !signature ||
      !Number.isFinite(grossValue) ||
      grossValue < 0
    ) {
      return json({ error: "invalid_request", verified: false }, 400);
    }

    const secret = Deno.env.get("AD_SSV_SECRET")!;

    // The nonce must be the one this backend issued for this user+transaction.
    const nonceOk = await verify(secret, `${userId}:${transactionId}`, nonce);
    const sigOk = await verify(
      secret,
      `${userId}:${transactionId}:${nonce}:${rewardAmountRaw}`,
      signature,
    );
    if (!nonceOk || !sigOk) {
      console.warn("ad-reward-ssv verification failed", { transactionId });
      return json({ error: "verification_failed", verified: false }, 403);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await admin.rpc("credit_ad_reward", {
      p_user_id: userId,
      p_transaction_id: transactionId,
      p_gross_value: grossValue,
      p_ad_network: network,
    });

    if (error) {
      console.error("credit_ad_reward failed", error);
      return json({ error: "credit_failed", verified: true }, 500);
    }

    const row = Array.isArray(data) ? data[0] : data;
    return json({ verified: true, credited: !!row?.credited });
  } catch (e) {
    console.error("ad-reward-ssv error", e);
    return json({ error: "internal_error" }, 500);
  }
});
