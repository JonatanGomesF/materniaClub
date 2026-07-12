import { useEffect, useState } from "react";
import { getCurrentSession, supabase, uploadMedia } from "../lib/supabaseClient";

function Perfil() {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({ full_name: "", city: "", bio: "", motherhood_stage: "gestante", avatar_url: "" });
  const [avatarFile, setAvatarFile] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getCurrentSession().then(({ profile: currentProfile }) => {
      setProfile(currentProfile);
      if (currentProfile) {
        setForm({
          full_name: currentProfile.full_name || "",
          city: currentProfile.city || "",
          bio: currentProfile.bio || "",
          motherhood_stage: currentProfile.motherhood_stage || "gestante",
          avatar_url: currentProfile.avatar_url || "",
        });
      }
    });
  }, []);

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function saveProfile(event) {
    event.preventDefault();
    if (!supabase || !profile) return alert("Faca login para editar o perfil.");

    setSaving(true);
    try {
      const avatarUrl = avatarFile ? await uploadMedia(avatarFile, "avatars") : form.avatar_url;
      const payload = { ...form, avatar_url: avatarUrl };

      const { data, error } = await supabase
        .from("profiles")
        .update(payload)
        .eq("id", profile.id)
        .select()
        .maybeSingle();

      if (error) throw error;
      setProfile(data);
      setForm({
        full_name: data.full_name || "",
        city: data.city || "",
        bio: data.bio || "",
        motherhood_stage: data.motherhood_stage || "gestante",
        avatar_url: data.avatar_url || "",
      });
      setAvatarFile(null);
      window.dispatchEvent(new Event("maternia-profile-updated"));
      alert("Perfil atualizado.");
    } catch (error) {
      alert(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-shell profile-layout">
      <section className="section-heading">
        <span className="eyebrow">Seu espaco</span>
        <h1>Perfil da usuaria</h1>
        <p>Dados que ajudam outras maes a reconhecerem voce na comunidade.</p>
      </section>

      <form className="profile-form" onSubmit={saveProfile}>
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
        <input name="full_name" placeholder="Nome completo" value={form.full_name} onChange={updateField} />
        <input name="city" placeholder="Cidade" value={form.city} onChange={updateField} />
        <select name="motherhood_stage" value={form.motherhood_stage} onChange={updateField}>
          <option value="gestante">Gestante</option>
          <option value="mae_primeira_viagem">Mae de primeira viagem</option>
          <option value="mae_experiente">Mae experiente</option>
          <option value="tentante">Tentante</option>
        </select>
        <textarea name="bio" placeholder="Conte um pouco sobre sua jornada materna" value={form.bio} onChange={updateField} />
        <button className="primary-button" disabled={saving}>{saving ? "Salvando..." : "Salvar perfil"}</button>
      </form>

      <aside className="side-panel">
        <h2>Seguranca</h2>
        <p>Evite compartilhar documentos, endereco completo ou dados bancarios no feed e no marketplace.</p>
      </aside>
    </div>
  );
}

export default Perfil;
