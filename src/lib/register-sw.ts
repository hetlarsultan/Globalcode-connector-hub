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
      setInterval(() => { reg.update().catch(() => {}); }, 60 * 60 * 1000);

      const promptUpdate = async (worker: ServiceWorker) => {
        const next = await fetchRemoteVersion();
        setPendingUpdate({
          current: APP_VERSION,
          next,
          activate: () => {
            worker.postMessage({ type: "SKIP_WAITING" });
            // controllerchange listener below will reload.
          },
        });
      };

      if (reg.waiting) promptUpdate(reg.waiting);

      reg.addEventListener("updatefound", () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener("statechange", () => {
          if (nw.state === "installed" && navigator.serviceWorker.controller) {
            promptUpdate(nw);
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
