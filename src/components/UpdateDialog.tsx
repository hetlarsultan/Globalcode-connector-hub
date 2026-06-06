import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { RefreshCw, Sparkles } from "lucide-react";

interface Props {
  open: boolean;
  currentVersion: string;
  newVersion: string;
  onConfirm: () => void;
  onLater: () => void;
}

export function UpdateDialog({ open, currentVersion, newVersion, onConfirm, onLater }: Props) {
  const [updating, setUpdating] = useState(false);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onLater()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            تحديث جديد متوفر
          </DialogTitle>
          <DialogDescription>
            هناك نسخة محدّثة من التطبيق. سيتم الحفاظ على بياناتك وحالة دخولك.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">النسخة الحالية</span>
            <code className="font-mono text-xs">{currentVersion}</code>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
            <span className="text-primary font-medium">النسخة الجديدة</span>
            <code className="font-mono text-xs">{newVersion}</code>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onLater} disabled={updating}>لاحقاً</Button>
          <Button
            onClick={() => { setUpdating(true); onConfirm(); }}
            disabled={updating}
            className="gradient-primary border-0 gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${updating ? "animate-spin" : ""}`} />
            {updating ? "جارٍ التحديث..." : "تحديث الآن"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
