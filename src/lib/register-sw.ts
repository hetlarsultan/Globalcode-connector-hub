// Guarded service worker registration with version-aware update dialog.
import { setPendingUpdate } from "./pwa-update";

export const APP_VERSION: string =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";

async function fetchRemoteVersion(): Promise<string> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return "new";
    const json = await res.json();
    return json.version || "new";
  } catch {
    return "new";
  }
}

export function registerServiceWorker() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  const url = new URL(window.location.href);
  const host = window.location.hostname;
  const inIframe = window.self !== window.top;
  const isLovablePreview =
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "lovableproject.com" ||
    host.endsWith(".lovableproject.com") ||
    host === "lovableproject-dev.com" ||
    host.endsWith(".lovableproject-dev.com") ||
    host === "beta.lovable.dev" ||
    host.endsWith(".beta.lovable.dev");
  const swOff = url.searchParams.get("sw") === "off";

  const shouldSkip = !import.meta.env.PROD || inIframe || isLovablePreview || swOff;

  if (shouldSkip) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => {
        const scriptUrl = r.active?.scriptURL || "";
        if (scriptUrl.endsWith("/sw.js")) r.unregister();
      });
    }).catch(() => {});
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then((reg) => {
      // Check for updates every 5 minutes + on tab focus
      const doUpdate = () => reg.update().catch(() => {});
      setInterval(doUpdate, 5 * 60 * 1000);
      window.addEventListener("focus", doUpdate);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") doUpdate();
      });

      const activate = (worker: ServiceWorker) => {
        // Auto-activate silently — no dialog
        worker.postMessage({ type: "SKIP_WAITING" });
      };

      if (reg.waiting) activate(reg.waiting);

      reg.addEventListener("updatefound", () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener("statechange", () => {
          if (nw.state === "installed" && navigator.serviceWorker.controller) {
            activate(nw);
          }
        });
      });
    }).catch(() => {});


    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  });
}

// Manually triggered update check (from a UI button). Resolves true if a new
// version was found (the dialog will be shown), false if already up-to-date.
export async function checkForUpdate(): Promise<boolean> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
      // No SW (dev/preview). Compare remote version directly.
      const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return false;
      const json = await res.json();
      if (json.version && json.version !== APP_VERSION) {
        setPendingUpdate({
          current: APP_VERSION,
          next: json.version,
          activate: () => window.location.reload(),
        });
        return true;
      }
      return false;
    }
    await reg.update();
    if (reg.waiting) {
      const next = await fetchRemoteVersion();
      setPendingUpdate({
        current: APP_VERSION,
        next,
        activate: () => reg.waiting?.postMessage({ type: "SKIP_WAITING" }),
      });
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
