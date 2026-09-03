import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { sign } from "../_shared/hmac.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SECRET = Deno.env.get("AD_SSV_SECRET") ?? "";

const canRun = !!SUPABASE_URL && !!SERVICE_KEY && !!SECRET;

Deno.test({
  name: "SSV: replaying the same transaction_id credits the wallet only once",
  ignore: !canRun,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
    const userId = users?.users?.[0]?.id as string;

    const transactionId = `test-${crypto.randomUUID()}`;
    const rewardAmount = "1";
    const nonce = await sign(SECRET, `${userId}:${transactionId}`);
    const signature = await sign(SECRET, `${userId}:${transactionId}:${nonce}:${rewardAmount}`);

    const call = async () => {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ad-reward-ssv`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          transaction_id: transactionId,
          nonce,
          reward_amount: rewardAmount,
          signature,
        }),
      });
      return await res.json();
    };

    const readBalance = async () => {
      const { data } = await admin.from("wallets").select("balance").eq("user_id", userId).maybeSingle();
      return Number(data?.balance ?? 0);
    };

    const before = await readBalance();
    const first = await call();
    const afterFirst = await readBalance();
    const second = await call();
    const afterSecond = await readBalance();

    assertEquals(first.verified, true);
    assertEquals(first.credited, true);
    // Replay must be rejected as already-credited.
    assertEquals(second.credited, false);
    assertEquals(afterFirst - before, 0.25);
    assertEquals(afterSecond, afterFirst);

    // cleanup
    await admin.from("wallets").update({ balance: before }).eq("user_id", userId);
    await admin.from("ad_reward_transactions").delete().eq("transaction_id", transactionId);
  },
});

Deno.test({
  name: "SSV: an invalid signature never credits anything",
  ignore: !canRun,
  async fn() {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/ad-reward-ssv`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: crypto.randomUUID(),
        transaction_id: `bad-${crypto.randomUUID()}`,
        nonce: "deadbeef",
        reward_amount: "1",
        signature: "deadbeef",
      }),
    });
    const body = await res.json();
    assertEquals(res.status, 403);
    assertEquals(body.verified, false);
  },
});
