import { useEffect, useState } from "react";
import PostCard from "../components/PostCard";
import { demoPosts } from "../data/demoData";
import { ensureUserProfile, getCurrentSession, isSupabaseConfigured, supabase, uploadMedia } from "../lib/supabaseClient";

function Feed() {
  const [posts, setPosts] = useState(demoPosts);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("promocao");
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  async function fetchPosts() {
    if (!supabase) return;

    const { data, error } = await supabase
      .from("posts")
      .select("*, profiles(full_name, city, status)")
      .eq("status", "published")
      .order("created_at", { ascending: false });

    if (!error) setPosts(data);
  }

  useEffect(() => {
    getCurrentSession().then(({ session: currentSession, profile: currentProfile }) => {
      setSession(currentSession);
      setProfile(currentProfile);
    });
    fetchPosts();
  }, []);

  async function createPost(event) {
    event.preventDefault();
    if (!body.trim()) return;
    if (!supabase || !session?.user) {
      alert("Conecte seu Supabase e faca login para postar de verdade.");
      return;
    }

    setLoading(true);
    try {
      const syncedProfile = profile || await ensureUserProfile(session.user);
      if (syncedProfile) setProfile(syncedProfile);

      const imageUrl = file ? await uploadMedia(file, "posts") : null;
      const { error } = await supabase.from("posts").insert({
        author_id: session.user.id,
        body,
        category,
        image_url: imageUrl,
      });

      if (error) throw error;
      setBody("");
      setFile(null);
      fetchPosts();
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function reportPost(post) {
    if (!supabase || !session?.user) {
      alert("Faca login para enviar denuncias.");
      return;
    }

    await supabase.from("reports").insert({
      reporter_id: session.user.id,
      target_type: "post",
      target_id: post.id,
      reason: "Conteudo fora da proposta do materniaClub",
    });
    alert("Denuncia enviada para o painel admin.");
  }

  return (
    <div className="page-shell feed-layout">
      <section className="hero-panel">
        <div>
          <span className="eyebrow">Comunidade para maes e gestantes</span>
          <h1>Ofertas, apoio e desapegos para uma maternidade mais leve.</h1>
          <p>
            No materniaClub as usuarias compartilham promocoes, fotos, dicas e produtos
            como fraldas, chupetas, mamadeiras, carrinhos e bebe conforto.
          </p>
        </div>
        <div className="hero-photo" aria-hidden="true" />
      </section>

      <section className="content-column">
        <form className="composer" onSubmit={createPost}>
          <div className="composer-top">
            <div className="avatar">{profile?.full_name?.charAt(0) || "m"}</div>
            <textarea
              placeholder="Compartilhe uma promocao, uma duvida ou uma foto..."
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </div>
          <div className="composer-actions">
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="promocao">Promocao</option>
              <option value="duvida">Duvida</option>
              <option value="desapego">Desapego</option>
              <option value="experiencia">Experiencia</option>
            </select>
            <input type="file" accept="image/*" onChange={(event) => setFile(event.target.files?.[0] || null)} />
            <button className="primary-button" disabled={loading}>{loading ? "Postando..." : "Publicar"}</button>
          </div>
          {!isSupabaseConfigured && <p className="hint">Modo demo: configure o Supabase para salvar publicacoes.</p>}
        </form>

        {posts.map((post) => (
          <PostCard key={post.id} post={post} onReport={reportPost} />
        ))}
      </section>
    </div>
  );
}

export default Feed;
