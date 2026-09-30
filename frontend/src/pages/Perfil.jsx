import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ProfilePersonalDetails from "../components/ProfilePersonalDetails";
import { getCurrentSession, supabase, uploadMedia } from "../lib/supabaseClient";
import { useToast } from "../lib/toastContext";

function Perfil() {
  const navigate = useNavigate();
  const { toast } = useToast();
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
          const [{ count: postsCount }, { count: activeProductsCount }, { count: soldProductsCount }] =
            await Promise.all([
              supabase
                .from("posts")
                .select("*", { count: "exact", head: true })
                .eq("author_id", currentProfile.id)
                .eq("status", "published"),
              supabase
                .from("products")
                .select("*", { count: "exact", head: true })
                .eq("seller_id", currentProfile.id)
                .eq("status", "active"),
              supabase
                .from("products")
                .select("*", { count: "exact", head: true })
                .eq("seller_id", currentProfile.id)
                .eq("status", "sold"),
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
    if (!supabase || !profile) {
      toast.info("Faça login para editar o perfil.");
      return;
    }

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

      toast.success("Perfil atualizado com sucesso!");
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
      toast.error(error.message || "Erro ao atualizar perfil");
    } finally {
      setSaving(false);
    }
  }

  function getTimeOnPlatform() {
    if (!profile?.created_at) return "Recém-chegada";

    const createdAt = new Date(profile.created_at);
    const diffDays = Math.max(1, Math.floor((loadedAt - createdAt.getTime()) / 86400000));

    if (diffDays < 30) return `${diffDays} dias`;

    const months = Math.floor(diffDays / 30);
    if (months < 12) return `${months} ${months === 1 ? "mês" : "meses"}`;

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
        <section className="empty-state-card">
          <p>Carregando perfil ou faça login para acessar...</p>
        </section>
      </div>
    );
  }

  return (
    <div className="page-shell public-profile own-profile">
      <section className="profile-hero-card own-profile-hero">
        <div className="profile-avatar-large">
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt="Foto do perfil" />
          ) : (
            profile.full_name?.charAt(0) || "M"
          )}
        </div>
        <div>
          <span className="eyebrow">Como as outras mães veem você</span>
          <h1>{profile.full_name}</h1>
          <p>
            {profile.bio || "Mãe da comunidade materniaClub compartilhando ofertas, desapegos e experiências reais."}
          </p>
          <button className="primary-button" onClick={openEditProfile}>
            ✎ Editar Meu Perfil
          </button>
        </div>
      </section>

      <section className="profile-stats-grid">
        <div className="metric-card">
          <span>Cidade</span>
          <strong>{profile.city || "Não informada"}</strong>
        </div>
        <div className="metric-card">
          <span>No clube há</span>
          <strong>{getTimeOnPlatform()}</strong>
        </div>
        <div className="metric-card">
          <span>Vendas Feitas</span>
          <strong>{stats.soldProducts}</strong>
        </div>
        <div className="metric-card">
          <span>Anúncios Ativos</span>
          <strong>{stats.activeProducts}</strong>
        </div>
        <div className="metric-card">
          <span>Publicações no Feed</span>
          <strong>{stats.posts}</strong>
        </div>
      </section>

      <section className="profile-section profile-personal-public">
        <div className="section-title-row">
          <h2>Informações Pessoais</h2>
          <button className="ghost-button small" onClick={openEditProfile}>
            Editar
          </button>
        </div>
        <ProfilePersonalDetails profile={profile} />
      </section>

      <section className="profile-section profile-personal-public">
        <h2>Dicas de Segurança</h2>
        <p className="hint">
          Nunca compartilhe dados bancários, senhas ou documentos no feed público ou nas conversas. Negocie com
          segurança!
        </p>
      </section>

      {isEditing && (
        <div className="profile-modal-backdrop" role="presentation" onClick={() => setIsEditing(false)}>
          <form
            className="profile-form profile-edit-modal"
            onClick={(event) => event.stopPropagation()}
            onSubmit={saveProfile}
          >
            <div className="section-title-row">
              <div>
                <span className="eyebrow">Editar Perfil</span>
                <h2>Atualize seus dados maternos</h2>
              </div>
              <button className="ghost-button small" type="button" onClick={() => setIsEditing(false)}>
                ✕
              </button>
            </div>

            <div className="profile-photo-editor">
              <div className="profile-photo-preview">
                {form.avatar_url ? (
                  <img src={form.avatar_url} alt="Foto do perfil" />
                ) : (
                  <span>{form.full_name?.charAt(0) || "M"}</span>
                )}
              </div>
              <div>
                <h2>Foto do perfil</h2>
                <p>Escolha uma foto para outras mães reconhecerem você.</p>
                <label className="image-picker">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => setAvatarFile(event.target.files?.[0] || null)}
                  />
                  <span>{avatarFile ? avatarFile.name : "Escolher foto da galeria"}</span>
                </label>
              </div>
            </div>

            <section className="profile-personal-card">
              <ProfilePersonalDetails profile={form} showEmpty />

              <div className="profile-fields-grid">
                <label>
                  <span>Nome Completo</span>
                  <input name="full_name" placeholder="Nome completo" value={form.full_name} onChange={updateField} />
                </label>
                <label>
                  <span>Mora em</span>
                  <input name="city" placeholder="Ex: São Paulo" value={form.city} onChange={updateField} />
                </label>
                <label>
                  <span>Natural de</span>
                  <input name="hometown" placeholder="Ex: Campinas" value={form.hometown} onChange={updateField} />
                </label>
                <label>
                  <span>Data de Nascimento</span>
                  <input name="birth_date" type="date" value={form.birth_date} onChange={updateField} />
                </label>
                <label>
                  <span>Status de Relacionamento</span>
                  <select name="relationship_status" value={form.relationship_status} onChange={updateField}>
                    <option value="">Não informado</option>
                    <option value="relacionamento_serio">Em um relacionamento sério</option>
                    <option value="casada">Casada</option>
                    <option value="solteira">Solteira</option>
                    <option value="noiva">Noiva</option>
                    <option value="prefere_nao_dizer">Prefere não dizer</option>
                  </select>
                </label>
                <label>
                  <span>Fase da Maternidade</span>
                  <select name="motherhood_stage" value={form.motherhood_stage} onChange={updateField}>
                    <option value="gestante">Gestante</option>
                    <option value="mae_primeira_viagem">Mãe de primeira viagem</option>
                    <option value="mae_experiente">Mãe experiente</option>
                    <option value="tentante">Tentante</option>
                  </select>
                </label>
              </div>

              <label className="profile-bio-field">
                <span>Sobre você</span>
                <textarea
                  name="bio"
                  rows={3}
                  placeholder="Conte um pouco sobre sua jornada na maternidade..."
                  value={form.bio}
                  onChange={updateField}
                />
              </label>
            </section>

            <button className="primary-button" disabled={saving}>
              {saving ? "Salvando alterações..." : "Salvar Alterações do Perfil"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default Perfil;
