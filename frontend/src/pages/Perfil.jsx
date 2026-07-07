import { useEffect, useState } from "react";
import { getCurrentSession, supabase } from "../lib/supabaseClient";

function Perfil() {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({ full_name: "", city: "", bio: "", motherhood_stage: "gestante" });

  useEffect(() => {
    getCurrentSession().then(({ profile: currentProfile }) => {
      setProfile(currentProfile);
      if (currentProfile) {
        setForm({
          full_name: currentProfile.full_name || "",
          city: currentProfile.city || "",
          bio: currentProfile.bio || "",
          motherhood_stage: currentProfile.motherhood_stage || "gestante",
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

    const { error } = await supabase.from("profiles").update(form).eq("id", profile.id);
    if (error) return alert(error.message);
    alert("Perfil atualizado.");
  }

  return (
    <div className="page-shell profile-layout">
      <section className="section-heading">
        <span className="eyebrow">Seu espaco</span>
        <h1>Perfil da usuaria</h1>
        <p>Dados que ajudam outras maes a reconhecerem voce na comunidade.</p>
      </section>

      <form className="profile-form" onSubmit={saveProfile}>
        <input name="full_name" placeholder="Nome completo" value={form.full_name} onChange={updateField} />
        <input name="city" placeholder="Cidade" value={form.city} onChange={updateField} />
        <select name="motherhood_stage" value={form.motherhood_stage} onChange={updateField}>
          <option value="gestante">Gestante</option>
          <option value="mae_primeira_viagem">Mae de primeira viagem</option>
          <option value="mae_experiente">Mae experiente</option>
          <option value="tentante">Tentante</option>
        </select>
        <textarea name="bio" placeholder="Conte um pouco sobre sua jornada materna" value={form.bio} onChange={updateField} />
        <button className="primary-button">Salvar perfil</button>
      </form>

      <aside className="side-panel">
        <h2>Seguranca</h2>
        <p>Evite compartilhar documentos, endereco completo ou dados bancarios no feed e no marketplace.</p>
      </aside>
    </div>
  );
}

export default Perfil;
