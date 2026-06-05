import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { UserAvatar } from "./UserAvatar";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Search } from "lucide-react";

interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  gender: "male" | "female" | "unspecified";
  is_online: boolean;
}

interface Props {
  onUserClick: (id: string) => void;
}

export function UsersList({ onUserClick }: Props) {
  const { user } = useAuth();
  const [users, setUsers] = useState<(Profile & { role: string })[]>([]);
  const [search, setSearch] = useState("");
  const [genderFilter, setGenderFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  useEffect(() => {
    (async () => {
      const { data: profiles } = await supabase.from("profiles").select("*").order("display_name");
      const { data: roles } = await supabase.from("user_roles").select("user_id,role");
      const roleMap = new Map(roles?.map((r) => [r.user_id, r.role]) || []);
      const merged = (profiles || []).map((p) => ({ ...p, role: roleMap.get(p.id) || "member" }));
      setUsers(merged as any);
    })();

    const ch = supabase.channel(`profiles-list-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
        supabase.from("profiles").select("*").then(({ data }) => {
          if (data) setUsers((prev) => prev.map((u) => {
            const fresh = data.find((d: any) => d.id === u.id);
            return fresh ? { ...u, ...fresh } : u;
          }));
        });
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const filtered = users.filter((u) => {
    if (search && !u.display_name.includes(search) && !u.username.includes(search.toLowerCase())) return false;
    if (genderFilter !== "all" && u.gender !== genderFilter) return false;
    if (roleFilter === "visitor" && u.role !== "visitor") return false;
    if (roleFilter === "member" && u.role === "visitor") return false;
    return true;
  });

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b space-y-2">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث..." className="pr-9" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Select value={genderFilter} onValueChange={setGenderFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="male">ذكر</SelectItem>
              <SelectItem value="female">أنثى</SelectItem>
            </SelectContent>
          </Select>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="member">عضو</SelectItem>
              <SelectItem value="visitor">زائر</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {filtered.map((u) => (
          <button key={u.id} onClick={() => onUserClick(u.id)}
            className="w-full px-3 py-2.5 flex items-center gap-3 hover:bg-accent/50 transition-colors text-right border-b border-border/50">
            <UserAvatar url={u.avatar_url} name={u.display_name} gender={u.gender} size="sm" online={u.is_online} />
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate flex items-center gap-1.5">
                {u.display_name}
                {u.id === user?.id && <span className="text-[10px] text-primary">(أنت)</span>}
              </div>
              <div className="text-xs text-muted-foreground truncate">@{u.username} · {u.role === "admin" ? "مدير" : u.role === "moderator" ? "مراقب" : u.role === "visitor" ? "زائر" : "عضو"}</div>
            </div>
          </button>
        ))}
        {filtered.length === 0 && <p className="text-center text-sm text-muted-foreground p-6">لا يوجد مستخدمون</p>}
      </div>
    </div>
  );
}
