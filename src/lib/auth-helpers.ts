import { supabase } from "@/integrations/supabase/client";

// Convert username to a deterministic email so users can sign in with username only
export const usernameToEmail = (username: string) =>
  `${username.trim().toLowerCase()}@chat.local`;

export async function signUpWithUsername(
  username: string,
  password: string,
  displayName: string,
  gender: "male" | "female" | "unspecified",
  age?: number,
) {
  const email = usernameToEmail(username);
  return supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${window.location.origin}/`,
      data: { username, display_name: displayName, gender, age: age ?? null },
    },
  });
}

export async function signInWithUsername(username: string, password: string) {
  return supabase.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  });
}
