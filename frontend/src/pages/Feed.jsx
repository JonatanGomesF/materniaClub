import { useCallback, useEffect, useState } from "react";
import PostCard from "../components/PostCard";
import { demoPosts } from "../data/demoData";
import { ensureUserProfile, getCurrentSession, isSupabaseConfigured, supabase, uploadMedia } from "../lib/supabaseClient";

function isMissingLikesTable(error) {
  return error?.code === "42P01" || error?.code === "PGRST205" || error?.message?.includes("public.likes");
}

function Feed() {
  const [posts, setPosts] = useState(demoPosts);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [body, setBody] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("promocao");
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchPosts = useCallback(async (currentSession = null) => {
    if (!supabase) return;

    const { data, error } = await supabase
      .from("posts")
      .select("*, profiles(full_name, city, status, avatar_url)")
      .eq("status", "published")
      .order("created_at", { ascending: false });

    if (error) return;

    const ids = (data || []).map((post) => post.id);
    if (ids.length === 0) {
      setPosts([]);
      return;
    }

    const { data: likes, error: likesError } = await supabase
      .from("likes")
      .select("post_id,user_id")
      .in("post_id", ids);

    if (likesError && !isMissingLikesTable(likesError)) return;

    const enriched = (data || []).map((post) => {
      const postLikes = likes?.filter((like) => like.post_id === post.id) || [];
      return {
        ...post,
        likes_count: postLikes.length,
        liked_by_me: postLikes.some((like) => like.user_id === currentSession?.user?.id),
      };
    });

    setPosts(enriched);
  }, []);

  useEffect(() => {
    getCurrentSession().then(({ session: currentSession, profile: currentProfile }) => {
      setSession(currentSession);
      setProfile(currentProfile);
      fetchPosts(currentSession);
    });
  }, [fetchPosts]);

  useEffect(() => {
    if (!supabase) return undefined;

    const channel = supabase
      .channel("feed-post-likes")
      .on("postgres_changes", { event: "*", schema: "public", table: "likes" }, () => {
        fetchPosts(session);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchPosts, session]);

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
      const payload = {
        author_id: session.user.id,
        body,
        category,
        image_url: imageUrl,
      };

      if (price) payload.price = Number(price);

      const { error } = await supabase.from("posts").insert(payload);

      if (error) throw error;
      setBody("");
      setPrice("");
      setFile(null);
      fetchPosts(session);
    } catch (error) {
      if (error.message?.includes("price")) {
        alert("Para salvar valor no Feed, rode o SQL feed-posts-update.sql no Supabase.");
      } else {
        alert(error.message);
      }
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

  async function toggleLike(post) {
    if (!supabase || !session?.user) {
      alert("Faca login para curtir publicacoes.");
      return;
    }

    if (post.liked_by_me) {
      const { error } = await supabase
        .from("likes")
        .delete()
        .eq("post_id", post.id)
        .eq("user_id", session.user.id);

      if (error) {
        if (isMissingLikesTable(error)) {
          alert("As curtidas do feed ainda precisam ser ativadas no Supabase.");
          return;
        }
        return alert(error.message);
      }
    } else {
      const { error } = await supabase.from("likes").insert({
        post_id: post.id,
        user_id: session.user.id,
      });

      if (error) {
        if (isMissingLikesTable(error)) {
          alert("As curtidas do feed ainda precisam ser ativadas no Supabase.");
          return;
        }
        return alert(error.message);
      }
    }

    setPosts((current) => current.map((item) => {
      if (item.id !== post.id) return item;
      const liked = !item.liked_by_me;
      return {
        ...item,
        liked_by_me: liked,
        likes_count: Math.max(0, (item.likes_count || 0) + (liked ? 1 : -1)),
      };
    }));
  }

  async function updatePost(post, updates, imageFile) {
    if (!supabase || !session?.user || post.author_id !== session.user.id) return;

    const createdAt = post.created_at ? new Date(post.created_at).getTime() : 0;
    const canEdit = createdAt && Date.now() - createdAt <= 5 * 60 * 1000;
    if (!canEdit) {
      alert("A edicao fica disponivel apenas nos primeiros 5 minutos. Voce ainda pode excluir a publicacao.");
      return;
    }

    try {
      const imageUrl = imageFile ? await uploadMedia(imageFile, "posts") : updates.image_url;
      const payload = {
        body: updates.body.trim(),
        category: updates.category,
        image_url: imageUrl,
      };

      if (updates.price || post.price || post.price === 0) {
        payload.price = updates.price ? Number(updates.price) : null;
      }

      const { error } = await supabase
        .from("posts")
        .update(payload)
        .eq("id", post.id)
        .eq("author_id", session.user.id);

      if (error) throw error;
      fetchPosts(session);
    } catch (error) {
      if (error.message?.includes("price")) {
        alert("Para editar valor no Feed, rode o SQL feed-posts-update.sql no Supabase.");
      } else {
        alert(error.message);
      }
    }
  }

  async function deletePost(post) {
    if (!supabase || !session?.user || post.author_id !== session.user.id) return;
    if (!window.confirm("Excluir esta publicacao do feed?")) return;

    const { error } = await supabase
      .from("posts")
      .update({ status: "removed" })
      .eq("id", post.id)
      .eq("author_id", session.user.id);

    if (error) return alert(error.message);
    setPosts((current) => current.filter((item) => item.id !== post.id));
  }

  return (
    <div className="page-shell feed-layout">
      <section className="content-column">
        <form className="composer" onSubmit={createPost}>
          <div className="composer-top">
            <div className="avatar">
              {profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : profile?.full_name?.charAt(0) || "m"}
            </div>
            <textarea
              placeholder="Compartilhe uma promocao, uma duvida ou uma foto..."
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </div>
          <div className="composer-price-row">
            <label>
              <span>Valor do produto</span>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Ex: 65,00"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
              />
            </label>
          </div>
          <div className="composer-actions">
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="promocao">Promocao</option>
              <option value="duvida">Duvida</option>
              <option value="desapego">Desapego</option>
              <option value="experiencia">Experiencia</option>
            </select>
            <label className="image-picker">
              <input type="file" accept="image/*" onChange={(event) => setFile(event.target.files?.[0] || null)} />
              <span>{file ? file.name : "Escolher imagem da galeria"}</span>
            </label>
            <button className="primary-button" disabled={loading}>{loading ? "Postando..." : "Publicar"}</button>
          </div>
          {!isSupabaseConfigured && <p className="hint">Modo demo: configure o Supabase para salvar publicacoes.</p>}
        </form>

        {posts.map((post) => (
          <PostCard
            currentUserId={session?.user?.id}
            key={post.id}
            post={post}
            onDelete={deletePost}
            onLike={toggleLike}
            onReport={reportPost}
            onUpdate={updatePost}
          />
        ))}
      </section>
    </div>
  );
}

export default Feed;
