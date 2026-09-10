import { Capacitor } from "@capacitor/core";

/** Default rewarded video ad unit (AdMob console). */
export const REWARDED_AD_UNIT_ID = "ca-app-pub-8449241346087567/9406482611";

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

let initialized = false;

async function admob() {
  const mod = await import("@capacitor-community/admob");
  if (!initialized) {
    await mod.AdMob.initialize({ initializeForTesting: false });
    initialized = true;
  }
  return mod;
}

export interface RewardedRequest {
  /** Supabase user id — sent to AdMob as the SSV user id. */
  userId: string;
  /** Our transaction id — sent to AdMob as SSV custom data. */
  transactionId: string;
  adUnitId?: string;
}

/**
 * Shows a real AdMob rewarded ad on the native app.
 * Resolves true when the user earned the reward. The reward itself is never
 * granted here: AdMob calls our SSV endpoint, which credits the wallet.
 */
export async function showRewardedAd(req: RewardedRequest): Promise<boolean> {
  const { AdMob } = await admob();
  const adId = req.adUnitId || REWARDED_AD_UNIT_ID;

  await AdMob.prepareRewardVideoAd({
    adId,
    ssv: {
      userId: req.userId,
      customData: req.transactionId,
    },
  });

  const reward = await AdMob.showRewardVideoAd();
  return !!reward;
}
