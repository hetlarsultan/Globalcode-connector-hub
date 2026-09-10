import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.p466d61a2a82049a9b20ea5b0090c25e5",
  appName: "script-pair-spark",
  webDir: "dist",
  server: {
    url: "https://466d61a2-a820-49a9-b20e-a5b0090c25e5.lovableproject.com?forceHideBadge=true",
    cleartext: true,
  },
  plugins: {
    AdMob: {
      // AdMob App ID (Android/iOS app-level id from the AdMob console)
      appId: "ca-app-pub-8449241346087567~3470418204",
      initializeForTesting: false,
    },
  },
};

export default config;
