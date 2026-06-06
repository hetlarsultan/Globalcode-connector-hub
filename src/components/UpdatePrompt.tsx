import { useEffect, useState } from "react";
import { subscribePendingUpdate, setPendingUpdate } from "@/lib/pwa-update";
import { UpdateDialog } from "./UpdateDialog";

export function UpdatePrompt() {
  const [data, setData] = useState<{ current: string; next: string; activate: () => void } | null>(null);

  useEffect(() => {
    const unsub = subscribePendingUpdate(setData);
    return () => { unsub(); };
  }, []);

  if (!data) return null;

  return (
    <UpdateDialog
      open
      currentVersion={data.current}
      newVersion={data.next}
      onConfirm={() => data.activate()}
      onLater={() => setPendingUpdate(null)}
    />
  );
}
