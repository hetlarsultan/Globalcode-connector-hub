import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "./ui/button";
import { Dialog, DialogContent } from "./ui/dialog";
import { Mic, MicOff, Video, VideoOff, PhoneOff, PhoneCall } from "lucide-react";
import { toast } from "sonner";

type Mode = "audio" | "video";
type Role = "caller" | "callee";

interface Props {
  open: boolean;
  onClose: () => void;
  selfId: string;
  peerId: string;
  peerName: string;
  mode: Mode;
  role: Role;
  // for callee: initial offer payload
  initialOffer?: RTCSessionDescriptionInit;
}

const ICE = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export function CallDialog({ open, onClose, selfId, peerId, peerName, mode, role, initialOffer }: Props) {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const [status, setStatus] = useState<string>(role === "caller" ? "جارٍ الاتصال..." : "اتصال وارد");
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [connected, setConnected] = useState(false);

  const cleanup = () => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    pcRef.current?.close();
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    pcRef.current = null;
    localStreamRef.current = null;
    channelRef.current = null;
  };

  const hangup = (notify = true) => {
    if (notify && channelRef.current) {
      channelRef.current.send({ type: "broadcast", event: "call-end", payload: { from: selfId } });
    }
    cleanup();
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: mode === "video",
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        localStreamRef.current = stream;
        if (localVideoRef.current && mode === "video") localVideoRef.current.srcObject = stream;

        const pc = new RTCPeerConnection(ICE);
        pcRef.current = pc;
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));

        pc.ontrack = (e) => {
          const [remote] = e.streams;
          if (mode === "video" && remoteVideoRef.current) remoteVideoRef.current.srcObject = remote;
          if (remoteAudioRef.current) remoteAudioRef.current.srcObject = remote;
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "connected") { setConnected(true); setStatus("متصل"); }
          if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
            toast.error("انقطع الاتصال");
            hangup(false);
          }
        };

        // Signaling channel — shared name regardless of direction
        const channelName = `call-${[selfId, peerId].sort().join("-")}`;
        const ch = supabase.channel(channelName, { config: { broadcast: { self: false } } });
        channelRef.current = ch;

        pc.onicecandidate = (e) => {
          if (e.candidate) {
            ch.send({ type: "broadcast", event: "ice", payload: { from: selfId, candidate: e.candidate } });
          }
        };

        ch.on("broadcast", { event: "answer" }, async ({ payload }) => {
          if (payload.from === peerId && pc.signalingState !== "stable") {
            await pc.setRemoteDescription(payload.sdp);
          }
        });
        ch.on("broadcast", { event: "ice" }, async ({ payload }) => {
          if (payload.from === peerId && payload.candidate) {
            try { await pc.addIceCandidate(payload.candidate); } catch {}
          }
        });
        ch.on("broadcast", { event: "call-end" }, ({ payload }) => {
          if (payload.from === peerId) { toast.info("أنهى الطرف الآخر المكالمة"); hangup(false); }
        });

        await new Promise<void>((res) => ch.subscribe((s) => { if (s === "SUBSCRIBED") res(); }));

        if (role === "caller") {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          // Send offer via private_messages-driven event or direct invite channel
          const invite = supabase.channel(`invite-${peerId}`);
          await new Promise<void>((res) => invite.subscribe((s) => { if (s === "SUBSCRIBED") res(); }));
          await invite.send({
            type: "broadcast", event: "call-offer",
            payload: { from: selfId, mode, sdp: offer },
          });
          supabase.removeChannel(invite);
        } else if (initialOffer) {
          await pc.setRemoteDescription(initialOffer);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          ch.send({ type: "broadcast", event: "answer", payload: { from: selfId, sdp: answer } });
        }
      } catch (e: any) {
        toast.error(e?.message || "تعذّر الوصول إلى الكاميرا/الميكروفون");
        hangup(false);
      }
    })();

    return () => { cancelled = true; cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggleMute = () => {
    const t = localStreamRef.current?.getAudioTracks()[0];
    if (t) { t.enabled = !t.enabled; setMuted(!t.enabled); }
  };
  const toggleCam = () => {
    const t = localStreamRef.current?.getVideoTracks()[0];
    if (t) { t.enabled = !t.enabled; setCamOff(!t.enabled); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && hangup()}>
      <DialogContent className="max-w-md p-0 overflow-hidden bg-card">
        <div className="bg-gradient-to-br from-primary/20 to-secondary/30 p-6 text-center">
          <div className="text-lg font-semibold">{peerName}</div>
          <div className="text-sm text-muted-foreground mt-1">{status}</div>
        </div>

        {mode === "video" ? (
          <div className="relative bg-black aspect-[3/4]">
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
            <video ref={localVideoRef} autoPlay playsInline muted
              className="absolute bottom-3 right-3 w-24 h-32 rounded-lg border-2 border-background object-cover" />
          </div>
        ) : (
          <div className="py-12 flex items-center justify-center">
            <div className="w-28 h-28 rounded-full bg-primary/20 flex items-center justify-center animate-pulse">
              <PhoneCall className="h-12 w-12 text-primary" />
            </div>
          </div>
        )}
        <audio ref={remoteAudioRef} autoPlay />

        <div className="p-4 flex justify-center gap-3 bg-card">
          <Button size="icon" variant={muted ? "default" : "outline"} onClick={toggleMute} className="rounded-full h-12 w-12">
            {muted ? <MicOff /> : <Mic />}
          </Button>
          {mode === "video" && (
            <Button size="icon" variant={camOff ? "default" : "outline"} onClick={toggleCam} className="rounded-full h-12 w-12">
              {camOff ? <VideoOff /> : <Video />}
            </Button>
          )}
          <Button size="icon" variant="destructive" onClick={() => hangup()} className="rounded-full h-12 w-12">
            <PhoneOff />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
