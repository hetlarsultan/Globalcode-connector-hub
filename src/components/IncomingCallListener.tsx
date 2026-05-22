import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CallDialog } from "./CallDialog";
import { Dialog, DialogContent } from "./ui/dialog";
import { Button } from "./ui/button";
import { Phone, PhoneOff, Video } from "lucide-react";
import { playPing, Prefs } from "@/lib/local-prefs";

interface Incoming {
  from: string;
  fromName: string;
  fromAvatar: string | null;
  mode: "audio" | "video";
  sdp: RTCSessionDescriptionInit;
}

export function IncomingCallListener() {
  const { user } = useAuth();
  const [incoming, setIncoming] = useState<Incoming | null>(null);
  const [accepted, setAccepted] = useState<Incoming | null>(null);

  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`invite-${user.id}`, { config: { broadcast: { self: false } } });
    ch.on("broadcast", { event: "call-offer" }, async ({ payload }) => {
      const { data } = await supabase.from("profiles")
        .select("display_name,avatar_url").eq("id", payload.from).maybeSingle();
      setIncoming({
        from: payload.from,
        fromName: data?.display_name || "مستخدم",
        fromAvatar: data?.avatar_url || null,
        mode: payload.mode,
        sdp: payload.sdp,
      });
      if (Prefs.getSound(user.id)) playPing();
    });
    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  if (!user) return null;

  return (
    <>
      <Dialog open={!!incoming && !accepted} onOpenChange={(o) => !o && setIncoming(null)}>
        <DialogContent className="max-w-sm text-center">
          <div className="py-4">
            <div className="w-20 h-20 mx-auto rounded-full bg-primary/20 flex items-center justify-center mb-3 animate-pulse">
              {incoming?.mode === "video" ? <Video className="h-9 w-9 text-primary" /> : <Phone className="h-9 w-9 text-primary" />}
            </div>
            <div className="font-semibold text-lg">{incoming?.fromName}</div>
            <div className="text-sm text-muted-foreground">
              مكالمة {incoming?.mode === "video" ? "فيديو" : "صوتية"} واردة
            </div>
          </div>
          <div className="flex justify-center gap-4 pb-2">
            <Button variant="destructive" className="rounded-full h-14 w-14 p-0" onClick={() => setIncoming(null)}>
              <PhoneOff />
            </Button>
            <Button className="rounded-full h-14 w-14 p-0 bg-green-600 hover:bg-green-700" onClick={() => { setAccepted(incoming); }}>
              <Phone />
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {accepted && (
        <CallDialog
          open={true}
          onClose={() => { setAccepted(null); setIncoming(null); }}
          selfId={user.id}
          peerId={accepted.from}
          peerName={accepted.fromName}
          mode={accepted.mode}
          role="callee"
          initialOffer={accepted.sdp}
        />
      )}
    </>
  );
}
