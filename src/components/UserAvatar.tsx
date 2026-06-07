import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface Props {
  url?: string | null;
  name: string;
  gender?: "male" | "female" | "unspecified" | null;
  size?: "sm" | "md" | "lg" | "xl";
  online?: boolean;
  className?: string;
  onClick?: () => void;
}

export function UserAvatar({ url, name, gender, size = "md", online, className, onClick }: Props) {
  const sizes = { sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-14 w-14 text-base", xl: "h-24 w-24 text-2xl" };
  const ring = gender === "male" ? "ring-male" : gender === "female" ? "ring-female" : "ring-primary";
  return (
    <div className={cn("relative inline-block", onClick && "cursor-pointer", className)} onClick={onClick}>
      <Avatar className={cn(sizes[size], "ring-2 ring-offset-2 ring-offset-background", ring)}>
        {url && (
          <AvatarImage
            src={url}
            alt={name}
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        )}
        <AvatarFallback className="gradient-primary text-primary-foreground font-semibold">
          {name?.slice(0, 2).toUpperCase() || "؟"}
        </AvatarFallback>
      </Avatar>
      {online && (
        <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-success ring-2 ring-background" />
      )}
    </div>
  );
}
