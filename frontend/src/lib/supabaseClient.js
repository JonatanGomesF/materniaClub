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

  const { data: loadedProfile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .maybeSingle();

  let profile = loadedProfile;

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
    avatarUrl: profile?.avatar_url || null,
    accountType: profile?.account_type || "user",
    role: profile?.role || "user",
    status: profile?.status || "active",
  };
}

export async function ensureUserProfile(user, fallback = {}) {
  if (!supabase || !user) return null;

  const fullName = fallback.full_name || user.user_metadata?.full_name || user.email?.split("@")[0] || "Usuaria";

  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  // Nunca substitua classificacao, permissao ou dados do perfil durante um
  // login comum. Atualizamos apenas os campos explicitamente fornecidos.
  if (existingProfile) {
    const updates = {};
    for (const field of ["full_name", "city", "motherhood_stage"]) {
      if (fallback[field] !== undefined) updates[field] = fallback[field];
    }

    if (Object.keys(updates).length === 0) return existingProfile;

    const { data, error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", user.id)
      .select()
      .maybeSingle();

    if (error) {
      console.warn("Nao foi possivel sincronizar o perfil:", error.message);
      return existingProfile;
    }

    return data;
  }

  const { data, error } = await supabase
    .from("profiles")
    .insert({
      id: user.id,
      full_name: fullName,
      city: fallback.city || null,
      motherhood_stage: fallback.motherhood_stage || "gestante",
      account_type: fallback.account_type || user.user_metadata?.account_type || "user",
      role: fallback.role || "user",
      status: "active",
    })
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
