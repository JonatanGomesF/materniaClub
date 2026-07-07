import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export async function getCurrentSession() {
  if (!supabase) return { session: null, profile: null };

  const { data } = await supabase.auth.getSession();
  const session = data.session;

  if (!session?.user) return { session: null, profile: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .maybeSingle();

  return { session, profile };
}

export function getDisplayUser(session, profile) {
  const user = session?.user;
  if (!user) return null;

  const emailName = user.email?.split("@")[0] || "usuaria";
  const fullName = profile?.full_name || user.user_metadata?.full_name || emailName;

  return {
    id: user.id,
    email: user.email,
    fullName,
    firstName: fullName.split(" ")[0],
    initial: fullName.trim().charAt(0).toUpperCase(),
    role: profile?.role || "user",
    status: profile?.status || "active",
  };
}

export async function ensureUserProfile(user, fallback = {}) {
  if (!supabase || !user) return null;

  const fullName = fallback.full_name || user.user_metadata?.full_name || user.email?.split("@")[0] || "Usuaria";

  const { data, error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        full_name: fullName,
        city: fallback.city || null,
        motherhood_stage: fallback.motherhood_stage || "gestante",
        role: fallback.role || "user",
        status: "active",
      },
      { onConflict: "id" },
    )
    .select()
    .maybeSingle();

  if (error) {
    console.warn("Nao foi possivel sincronizar o perfil:", error.message);
    return null;
  }

  return data;
}

export async function uploadMedia(file, folder) {
  if (!supabase || !file) return null;

  const ext = file.name.split(".").pop();
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from("maternia-media")
    .upload(path, file, { cacheControl: "3600", upsert: false });

  if (error) throw error;

  const { data } = supabase.storage.from("maternia-media").getPublicUrl(path);
  return data.publicUrl;
}
