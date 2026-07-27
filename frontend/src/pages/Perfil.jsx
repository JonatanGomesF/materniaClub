import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ProfilePersonalDetails from "../components/ProfilePersonalDetails";
import { getCurrentSession, supabase, uploadMedia } from "../lib/supabaseClient";

function Perfil() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({ posts: 0, activeProducts: 0, soldProducts: 0 });
  const [form, setForm] = useState({
    avatar_url: "",
    bio: "",
    birth_date: "",
    city: "",
    full_name: "",
    hometown: "",
    motherhood_stage: "gestante",
    relationship_status: "",
  });
  const [avatarFile, setAvatarFile] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadedAt] = useState(() => Date.now());

  useEffect(() => {
    async function loadProfile() {
      const { profile: currentProfile } = await getCurrentSession();
      if (currentProfile?.account_type === "store") {
        navigate("/lojas", { replace: true });
        return;
      }

      setProfile(currentProfile);
      if (currentProfile) {
        setForm({
          avatar_url: currentProfile.avatar_url || "",
          bio: currentProfile.bio || "",
          birth_date: currentProfile.birth_date || "",
          city: currentProfile.city || "",
          full_name: currentProfile.full_name || "",
          hometown: currentProfile.hometown || "",
          motherhood_stage: currentProfile.motherhood_stage || "gestante",
          relationship_status: currentProfile.relationship_status || "",
        });

        if (supabase) {
          const [{ count: postsCount }, { count: activeProductsCount }, { count: soldProductsCount }] = await Promise.all([
            supabase.from("posts").select("*", { count: "exact", head: true }).eq("author_id", currentProfile.id).eq("status", "published"),
            supabase.from("products").select("*", { count: "exact", head: true }).eq("seller_id", currentProfile.id).eq("status", "active"),
            supabase.from("products").select("*", { count: "exact", head: true }).eq("seller_id", currentProfile.id).eq("status", "sold"),
          ]);

          setStats({
            posts: postsCount || 0,
            activeProducts: activeProductsCount || 0,
            soldProducts: soldProductsCount || 0,
          });
        }
      }
    }

    loadProfile();
  }, [navigate]);

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function saveProfile(event) {
    event.preventDefault();
    if (!supabase || !profile) return alert("Faca login para editar o perfil.");

    setSaving(true);
    try {
      const avatarUrl = avatarFile ? await uploadMedia(avatarFile, "avatars") : form.avatar_url;
      const payload = {
        ...form,
        avatar_url: avatarUrl,
        birth_date: form.birth_date || null,
        relationship_status: form.relationship_status || null,
      };

      const { data, error } = await supabase
        .from("profiles")
        .update(payload)
        .eq("id", profile.id)
        .select()
        .maybeSingle();

      if (error) throw error;
      setProfile(data);
      setForm({
        avatar_url: data.avatar_url || "",
        bio: data.bio || "",
        birth_date: data.birth_date || "",
        city: data.city || "",
        full_name: data.full_name || "",
        hometown: data.hometown || "",
        motherhood_stage: data.motherhood_stage || "gestante",
        relationship_status: data.relationship_status || "",
      });
      setAvatarFile(null);
      setIsEditing(false);
      window.dispatchEvent(new Event("maternia-profile-updated"));
    } catch (error) {
      alert(error.message);
    } finally {
      setSaving(false);
    }
  }

  function getTimeOnPlatform() {
    if (!profile?.created_at) return "Recem-chegada";

    const createdAt = new Date(profile.created_at);
    const diffDays = Math.max(1, Math.floor((loadedAt - createdAt.getTime()) / 86400000));

    if (diffDays < 30) return `${diffDays} dias`;

    const months = Math.floor(diffDays / 30);
    if (months < 12) return `${months} ${months === 1 ? "mes" : "meses"}`;

    const years = Math.floor(months / 12);
    return `${years} ${years === 1 ? "ano" : "anos"}`;
  }

  function openEditProfile() {
    if (!profile) return;

    setForm({
      avatar_url: profile.avatar_url || "",
      bio: profile.bio || "",
      birth_date: profile.birth_date || "",
      city: profile.city || "",
      full_name: profile.full_name || "",
      hometown: profile.hometown || "",
      motherhood_stage: profile.motherhood_stage || "gestante",
      relationship_status: profile.relationship_status || "",
    });
    setAvatarFile(null);
    setIsEditing(true);
  }

  if (!profile) {
    return (
      <div className="page-shell">
        <section className="notice">Perfil nao encontrado ou ainda carregando.</section>
      </div>
    );
  }

  return (
    <div className="page-shell public-profile own-profile">
      <section className="profile-hero-card own-profile-hero">
        <div className="profile-avatar-large">
          {profile.avatar_url ? <img src={profile.avatar_url} alt="Foto do perfil" /> : profile.full_name?.charAt(0) || "M"}
        </div>
        <div>
          <span className="eyebrow">Como outras maes veem voce</span>
          <h1>{profile.full_name}</h1>
          <p>{profile.bio || "Mae da comunidade materniaClub compartilhando ofertas, desapegos e experiencias."}</p>
          <button className="primary-button" onClick={openEditProfile}>Editar perfil</button>
        </div>
      </section>

      <section className="profile-stats-grid">
        <div>
          <span>Cidade</span>
          <strong>{profile.city || "Nao informada"}</strong>
        </div>
        <div>
          <span>Na plataforma ha</span>
          <strong>{getTimeOnPlatform()}</strong>
        </div>
        <div>
          <span>Vendas feitas</span>
          <strong>{stats.soldProducts}</strong>
        </div>
        <div>
          <span>Anuncios ativos</span>
          <strong>{stats.activeProducts}</strong>
        </div>
        <div>
          <span>Publicacoes</span>
          <strong>{stats.posts}</strong>
        </div>
      </section>

      <section className="profile-section profile-personal-public">
        <div className="section-title-row">
          <h2>Dados pessoais</h2>
          <button className="ghost-button small" onClick={openEditProfile}>Editar perfil</button>
        </div>
        <ProfilePersonalDetails profile={profile} />
      </section>

      <section className="profile-section profile-personal-public">
        <h2>Seguranca</h2>
        <p>Evite compartilhar documentos, endereco completo ou dados bancarios no feed e no marketplace.</p>
      </section>

      {isEditing && (
        <div className="profile-modal-backdrop" role="presentation" onClick={() => setIsEditing(false)}>
          <form className="profile-form profile-edit-modal" onClick={(event) => event.stopPropagation()} onSubmit={saveProfile}>
            <div className="section-title-row">
              <div>
                <span className="eyebrow">Editar perfil</span>
                <h2>Atualize como as maes veem voce</h2>
              </div>
              <button className="ghost-button small" type="button" onClick={() => setIsEditing(false)}>Fechar</button>
            </div>

            <div className="profile-photo-editor">
              <div className="profile-photo-preview">
                {form.avatar_url ? <img src={form.avatar_url} alt="Foto do perfil" /> : <span>{form.full_name?.charAt(0) || "M"}</span>}
              </div>
              <div>
                <h2>Foto do perfil</h2>
                <p>Escolha uma imagem clara para outras maes reconhecerem voce.</p>
                <label className="image-picker">
                  <input type="file" accept="image/*" onChange={(event) => setAvatarFile(event.target.files?.[0] || null)} />
                  <span>{avatarFile ? avatarFile.name : "Escolher foto da galeria"}</span>
                </label>
              </div>
            </div>

            <section className="profile-personal-card">
              <div className="section-title-row">
                <h2>Dados pessoais</h2>
                <span className="profile-pencil" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M4 20h4.6L19.3 9.3a2.1 2.1 0 0 0 0-3L17.7 4.7a2.1 2.1 0 0 0-3 0L4 15.4V20Z" />
                    <path d="m13.7 5.7 4.6 4.6" />
                  </svg>
                </span>
              </div>

              <ProfilePersonalDetails profile={form} showEmpty />

              <div className="profile-fields-grid">
                <label>
                  <span>Nome</span>
                  <input name="full_name" placeholder="Nome completo" value={form.full_name} onChange={updateField} />
                </label>
                <label>
                  <span>Mora em</span>
                  <input name="city" placeholder="Ex: Itu" value={form.city} onChange={updateField} />
                </label>
                <label>
                  <span>De</span>
                  <input name="hometown" placeholder="Ex: Itu" value={form.hometown} onChange={updateField} />
                </label>
                <label>
                  <span>Nascimento</span>
                  <input name="birth_date" type="date" value={form.birth_date} onChange={updateField} />
                </label>
                <label>
                  <span>Relacionamento</span>
                  <select name="relationship_status" value={form.relationship_status} onChange={updateField}>
                    <option value="">Nao informado</option>
                    <option value="relacionamento_serio">Em um relacionamento serio</option>
                    <option value="casada">Casada</option>
                    <option value="solteira">Solteira</option>
                    <option value="noiva">Noiva</option>
                    <option value="prefere_nao_dizer">Prefere nao dizer</option>
                  </select>
                </label>
                <label>
                  <span>Fase materna</span>
                  <select name="motherhood_stage" value={form.motherhood_stage} onChange={updateField}>
                    <option value="gestante">Gestante</option>
                    <option value="mae_primeira_viagem">Mae de primeira viagem</option>
                    <option value="mae_experiente">Mae experiente</option>
                    <option value="tentante">Tentante</option>
                  </select>
                </label>
              </div>

              <label className="profile-bio-field">
                <span>Sobre voce</span>
                <textarea name="bio" placeholder="Conte um pouco sobre sua jornada materna" value={form.bio} onChange={updateField} />
              </label>
            </section>

            <button className="primary-button" disabled={saving}>{saving ? "Atualizando..." : "Atualizar perfil"}</button>
          </form>
        </div>
      )}
    </div>
  );
}

export default Perfil;
