// Guarded service worker registration with update prompt.
import { toast } from "sonner";

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
      // Check for updates periodically
      setInterval(() => { reg.update().catch(() => {}); }, 60 * 60 * 1000);

      const promptUpdate = (worker: ServiceWorker) => {
        toast("نسخة جديدة من التطبيق متاحة", {
          description: "اضغط للتحديث الآن",
          duration: Infinity,
          action: {
            label: "تحديث",
            onClick: () => {
              worker.postMessage({ type: "SKIP_WAITING" });
              setTimeout(() => window.location.reload(), 300);
            },
          },
        });
      };

      // Already waiting on load
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
