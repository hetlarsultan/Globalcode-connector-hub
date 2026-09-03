import { useEffect, useRef } from "react";
import { MonitorPlay } from "lucide-react";

const AD_CLIENT = import.meta.env.VITE_ADSENSE_CLIENT as string | undefined;
const AD_SLOT = import.meta.env.VITE_ADSENSE_SLOT as string | undefined;

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

/**
 * Renders the real ad unit when the app owner's ad account is configured
 * (VITE_ADSENSE_CLIENT + VITE_ADSENSE_SLOT). Falls back to a neutral
 * placeholder so the reward flow can still be exercised without an account.
 */
export function AdSlot({ playing, children }: { playing: boolean; children?: React.ReactNode }) {
  const pushed = useRef(false);
  const configured = Boolean(AD_CLIENT && AD_SLOT);

  useEffect(() => {
    if (!configured || !playing || pushed.current) return;
    pushed.current = true;
    const src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${AD_CLIENT}`;
    if (!document.querySelector(`script[src="${src}"]`)) {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.crossOrigin = "anonymous";
      document.head.appendChild(s);
    }
    const t = setTimeout(() => {
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch {
        /* ad blocked or not ready */
      }
    }, 300);
    return () => clearTimeout(t);
  }, [configured, playing]);

  if (!configured) {
    return (
      <div className="aspect-video rounded-lg bg-muted flex flex-col items-center justify-center gap-2">
        {children ?? <MonitorPlay className="h-10 w-10 text-muted-foreground" />}
      </div>
    );
  }

  return (
    <div className="aspect-video rounded-lg bg-muted overflow-hidden relative">
      <ins
        className="adsbygoogle block w-full h-full"
        style={{ display: "block" }}
        data-ad-client={AD_CLIENT}
        data-ad-slot={AD_SLOT}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
      {children && (
        <div className="absolute inset-x-0 bottom-0 flex justify-center bg-background/70 py-1">
          {children}
        </div>
      )}
    </div>
  );
}
