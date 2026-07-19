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
      .select("*, profiles(full_name, city, status, avatar_url, account_type)")
      .in("status", ["published", "sold"])
      .order("created_at", { ascending: false });

    if (error) return;

    const { data: storeProducts, error: storeProductsError } = await supabase
      .from("store_products")
      .select("*, stores(name, city, logo_url, owner_id, status)")
      .in("status", ["active", "sold"])
      .order("created_at", { ascending: false });

    if (storeProductsError) return;

    const ids = (data || []).map((post) => post.id);
    let likes = [];
    let likesError = null;
    if (ids.length > 0) {
      const result = await supabase.from("likes").select("post_id,user_id").in("post_id", ids);
      likes = result.data || [];
      likesError = result.error;
    }

    if (likesError && !isMissingLikesTable(likesError)) return;

    const enriched = (data || []).map((post) => {
      const postLikes = likes?.filter((like) => like.post_id === post.id) || [];
      return {
        ...post,
        likes_count: postLikes.length,
        liked_by_me: postLikes.some((like) => like.user_id === currentSession?.user?.id),
      };
    });

    const commercialPosts = (storeProducts || [])
      .filter((product) => product.stores?.status === "verified")
      .map((product) => ({
      id: `store-product-${product.id}`,
      store_product_id: product.id,
      store_id: product.store_id,
      author_id: product.stores?.owner_id,
      body: product.description || product.title,
      title: product.title,
      price: product.price,
      category: product.category || "oferta",
      image_url: product.image_url,
      status: product.status,
      created_at: product.created_at,
      is_store_publication: true,
      is_verified_store: product.stores?.status === "verified",
      profiles: {
        full_name: product.stores?.name || "Loja parceira",
        city: product.city || product.stores?.city,
        avatar_url: product.stores?.logo_url,
        account_type: "store",
      },
    }));

    setPosts([...enriched, ...commercialPosts].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
  }, []);

  useEffect(() => {
    getCurrentSession().then(({ session: currentSession, profile: currentProfile }) => {
      if (currentProfile?.account_type === "store") {
        window.location.href = "/lojas?view=manage";
        return;
      }
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
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, () => fetchPosts(session))
      .on("postgres_changes", { event: "*", schema: "public", table: "store_products" }, () => fetchPosts(session))
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

  async function reportStoreProduct(post) {
    if (!supabase || !session?.user) {
      alert("Faca login para denunciar ofertas.");
      return;
    }

    await supabase.from("reports").insert({
      reporter_id: session.user.id,
      target_type: "store_product",
      target_id: post.store_product_id,
      reason: "Oferta de loja suspeita ou fora da proposta do materniaClub",
    });
    alert("Denuncia enviada para o painel admin.");
  }

  async function startStoreConversation(post) {
    if (!supabase || !session?.user) {
      alert("Faca login para comprar produtos das lojas.");
      return;
    }

    if (post.author_id === session.user.id) {
      alert("Voce esta administrando esta loja.");
      return;
    }

    try {
      await ensureUserProfile(session.user);

      const { data: existingConversation, error: existingError } = await supabase
        .from("conversations")
        .select("*")
        .eq("store_product_id", post.store_product_id)
        .eq("buyer_id", session.user.id)
        .eq("seller_id", post.author_id)
        .maybeSingle();

      if (existingError) throw existingError;

      let conversation = existingConversation;

      if (!conversation) {
        const { data: createdConversation, error } = await supabase
          .from("conversations")
          .insert({
            store_product_id: post.store_product_id,
            buyer_id: session.user.id,
            seller_id: post.author_id,
          })
          .select()
          .maybeSingle();

        if (error) throw error;
        conversation = createdConversation;
      }

      await supabase.from("messages").insert({
        conversation_id: conversation.id,
        sender_id: session.user.id,
        body: `Quero comprar na loja: ${post.title || post.body}`,
      });

      window.location.href = `/chat?conversation=${conversation.id}`;
    } catch (error) {
      alert(error.message);
    }
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

  async function updatePostStatus(post, status) {
    if (!supabase || !session?.user || post.author_id !== session.user.id) return;

    const { error } = await supabase
      .from("posts")
      .update({ status })
      .eq("id", post.id)
      .eq("author_id", session.user.id);

    if (error) {
      if (error.message?.includes("status")) {
        alert("Para marcar publicacoes do Feed como vendidas, rode o SQL feed-sold-update.sql no Supabase.");
        return;
      }
      return alert(error.message);
    }

    setPosts((current) => current.map((item) => (item.id === post.id ? { ...item, status } : item)));
  }

  async function updateStoreProductStatus(post, status) {
    if (!supabase || !session?.user || post.author_id !== session.user.id || !post.store_product_id) return;

    const { error } = await supabase
      .from("store_products")
      .update({ status })
      .eq("id", post.store_product_id);

    if (error) return alert(error.message);
    setPosts((current) => current.map((item) => (item.id === post.id ? { ...item, status } : item)));
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
            onDelete={post.is_store_publication ? null : deletePost}
            onLike={post.is_store_publication ? null : toggleLike}
            onInterest={post.is_store_publication ? startStoreConversation : null}
            onReport={post.is_store_publication ? reportStoreProduct : reportPost}
            onUpdate={post.is_store_publication ? null : updatePost}
            onStatusChange={post.is_store_publication ? updateStoreProductStatus : updatePostStatus}
          />
        ))}
      </section>
    </div>
  );
}

export default Feed;
