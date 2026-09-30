import { useCallback, useEffect, useState } from "react";
import PostCard from "../components/PostCard";
import { demoPosts } from "../data/demoData";
import { ensureUserProfile, getCurrentSession, isSupabaseConfigured, supabase, uploadMedia } from "../lib/supabaseClient";
import { useToast } from "../lib/toastContext";

function isMissingLikesTable(error) {
  return error?.code === "42P01" || error?.code === "PGRST205" || error?.message?.includes("public.likes");
}

function Feed() {
  const { toast, showConfirm } = useToast();
  const [posts, setPosts] = useState(demoPosts);
  const [activeCategory, setActiveCategory] = useState("todas");
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [body, setBody] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("promocao");
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fetchingPosts, setFetchingPosts] = useState(isSupabaseConfigured);

  const fetchPosts = useCallback(async (currentSession = null) => {
    if (!supabase) return;
    setFetchingPosts(true);

    try {
      const { data, error } = await supabase
        .from("posts")
        .select("*, profiles(full_name, city, status, avatar_url, account_type)")
        .in("status", ["published", "sold"])
        .order("created_at", { ascending: false });

      if (error) {
        console.warn("Erro ao buscar posts:", error.message);
        setFetchingPosts(false);
        return;
      }

      const { data: storeProducts, error: storeProductsError } = await supabase
        .from("store_products")
        .select("*, stores(name, city, logo_url, owner_id, status)")
        .in("status", ["active", "sold"])
        .order("created_at", { ascending: false });

      if (storeProductsError) {
        console.warn("Erro ao buscar produtos de lojas:", storeProductsError.message);
      }

      const ids = (data || []).map((post) => post.id);
      let likes = [];
      let likesError = null;
      if (ids.length > 0) {
        const result = await supabase.from("likes").select("post_id,user_id").in("post_id", ids);
        likes = result.data || [];
        likesError = result.error;
      }

      if (likesError && !isMissingLikesTable(likesError)) {
        console.warn("Erro ao buscar curtidas:", likesError.message);
      }

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
            full_name: product.stores?.name || "Loja Parceira",
            city: product.city || product.stores?.city,
            avatar_url: product.stores?.logo_url,
            account_type: "store",
          },
        }));

      setPosts([...enriched, ...commercialPosts].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
    } finally {
      setFetchingPosts(false);
    }
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
      .channel("feed-realtime-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "likes" }, () => fetchPosts(session))
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, () => fetchPosts(session))
      .on("postgres_changes", { event: "*", schema: "public", table: "store_products" }, () => fetchPosts(session))
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchPosts, session]);

  async function createPost(event) {
    event.preventDefault();
    if (!body.trim()) {
      toast.warning("Escreva uma mensagem para publicar.");
      return;
    }

    if (!supabase || !session?.user) {
      toast.info("Faça login para publicar no feed comunitário.");
      return;
    }

    setLoading(true);
    try {
      const syncedProfile = profile || await ensureUserProfile(session.user);
      if (syncedProfile) setProfile(syncedProfile);

      const imageUrl = file ? await uploadMedia(file, "posts") : null;
      const payload = {
        author_id: session.user.id,
        body: body.trim(),
        category,
        image_url: imageUrl,
      };

      if (price) payload.price = Number(price);

      const { error } = await supabase.from("posts").insert(payload);

      if (error) throw error;

      toast.success("Publicação compartilhada com o clube!");
      setBody("");
      setPrice("");
      setFile(null);
      fetchPosts(session);
    } catch (error) {
      toast.error(error.message || "Erro ao criar publicação");
    } finally {
      setLoading(false);
    }
  }

  async function reportPost(post) {
    if (!supabase || !session?.user) {
      toast.info("Faça login para enviar denúncias.");
      return;
    }

    const confirmed = await showConfirm(
      "Denunciar publicação",
      "Deseja denunciar esta publicação para análise da equipe de moderação?",
      "Denunciar",
      "Cancelar",
      true
    );

    if (!confirmed) return;

    const { error } = await supabase.from("reports").insert({
      reporter_id: session.user.id,
      target_type: "post",
      target_id: post.id,
      reason: "Conteúdo fora das diretrizes do materniaClub",
    });

    if (error) {
      toast.error("Erro ao enviar denúncia: " + error.message);
    } else {
      toast.success("Denúncia enviada aos administradores. Obrigada por proteger o clube!");
    }
  }

  async function reportStoreProduct(post) {
    if (!supabase || !session?.user) {
      toast.info("Faça login para denunciar ofertas.");
      return;
    }

    const confirmed = await showConfirm(
      "Denunciar oferta de loja",
      "Deseja denunciar esta oferta comercial para análise?",
      "Denunciar",
      "Cancelar",
      true
    );

    if (!confirmed) return;

    const { error } = await supabase.from("reports").insert({
      reporter_id: session.user.id,
      target_type: "store_product",
      target_id: post.store_product_id,
      reason: "Oferta de loja suspeita ou fora da proposta do materniaClub",
    });

    if (error) {
      toast.error("Erro ao enviar denúncia: " + error.message);
    } else {
      toast.success("Denúncia da oferta enviada com sucesso.");
    }
  }

  async function startStoreConversation(post) {
    if (!supabase || !session?.user) {
      toast.info("Faça login para comprar produtos das lojas.");
      return;
    }

    if (post.author_id === session.user.id) {
      toast.warning("Você está administrando esta loja.");
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
        body: `Olá! Tenho interesse na oferta da loja: ${post.title || post.body}`,
      });

      toast.success("Conversa com a loja iniciada!");
      window.location.href = `/chat?conversation=${conversation.id}`;
    } catch (error) {
      toast.error(error.message || "Erro ao conectar com a loja");
    }
  }

  async function toggleLike(post) {
    if (!supabase || !session?.user) {
      toast.info("Faça login para curtir publicações.");
      return;
    }

    if (post.liked_by_me) {
      const { error } = await supabase
        .from("likes")
        .delete()
        .eq("post_id", post.id)
        .eq("user_id", session.user.id);

      if (error) {
        toast.error("Não foi possível descurtir: " + error.message);
        return;
      }
    } else {
      const { error } = await supabase.from("likes").insert({
        post_id: post.id,
        user_id: session.user.id,
      });

      if (error) {
        toast.error("Não foi possível curtir: " + error.message);
        return;
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
      toast.warning("A edição fica disponível apenas nos primeiros 5 minutos.");
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
      toast.success("Publicação atualizada com sucesso!");
      fetchPosts(session);
    } catch (error) {
      toast.error(error.message || "Erro ao atualizar publicação");
    }
  }

  async function deletePost(post) {
    if (!supabase || !session?.user || post.author_id !== session.user.id) return;

    const confirmed = await showConfirm(
      "Excluir publicação",
      "Tem certeza que deseja excluir esta publicação do feed?",
      "Excluir",
      "Cancelar",
      true
    );

    if (!confirmed) return;

    const { error } = await supabase
      .from("posts")
      .update({ status: "removed" })
      .eq("id", post.id)
      .eq("author_id", session.user.id);

    if (error) {
      toast.error("Erro ao excluir: " + error.message);
      return;
    }

    toast.success("Publicação excluída com sucesso.");
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
      toast.error(error.message || "Erro ao atualizar status");
      return;
    }

    toast.success(status === "sold" ? "Item marcado como vendido!" : "Status atualizado!");
    setPosts((current) => current.map((item) => (item.id === post.id ? { ...item, status } : item)));
  }

  async function updateStoreProductStatus(post, status) {
    if (!supabase || !session?.user || post.author_id !== session.user.id || !post.store_product_id) return;

    const { error } = await supabase
      .from("store_products")
      .update({ status })
      .eq("id", post.store_product_id);

    if (error) {
      toast.error(error.message || "Erro ao atualizar produto");
      return;
    }

    toast.success("Status do produto atualizado!");
    setPosts((current) => current.map((item) => (item.id === post.id ? { ...item, status } : item)));
  }

  const filteredPosts = activeCategory === "todas"
    ? posts
    : posts.filter((p) => p.category?.toLowerCase() === activeCategory.toLowerCase());

  return (
    <div className="page-shell feed-layout">
      <section className="content-column">
        {/* COMPOSER */}
        <form className="composer" onSubmit={createPost}>
          <div className="composer-top">
            <div className="avatar">
              {profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : profile?.full_name?.charAt(0) || "M"}
            </div>
            <textarea
              placeholder="Compartilhe uma dica, promoção que encontrou, dúvida ou foto com outras mães..."
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </div>
          <div className="composer-price-row">
            <label>
              <span>Preço encontrado / Oferta (opcional)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Ex: 59.90"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
              />
            </label>
          </div>
          <div className="composer-actions">
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="promocao">Promoção</option>
              <option value="duvida">Dúvida / Conselho</option>
              <option value="desapego">Desapego</option>
              <option value="experiencia">Experiência</option>
            </select>
            <label className="image-picker">
              <input type="file" accept="image/*" onChange={(event) => setFile(event.target.files?.[0] || null)} />
              <span>{file ? file.name : "Adicionar Foto"}</span>
            </label>
            <button className="primary-button" disabled={loading}>{loading ? "Publicando..." : "Publicar no Feed"}</button>
          </div>
          {!isSupabaseConfigured && <p className="hint">Modo demonstração: configure o Supabase para persistir suas publicações.</p>}
        </form>

        {/* CATEGORY FILTER PILLS */}
        <div className="feed-filter-bar">
          <button
            type="button"
            className={`filter-pill ${activeCategory === "todas" ? "active" : ""}`}
            onClick={() => setActiveCategory("todas")}
          >
            Todas as Publicações
          </button>
          <button
            type="button"
            className={`filter-pill ${activeCategory === "promocao" ? "active" : ""}`}
            onClick={() => setActiveCategory("promocao")}
          >
            Promoções
          </button>
          <button
            type="button"
            className={`filter-pill ${activeCategory === "duvida" ? "active" : ""}`}
            onClick={() => setActiveCategory("duvida")}
          >
            Dúvidas & Dicas
          </button>
          <button
            type="button"
            className={`filter-pill ${activeCategory === "desapego" ? "active" : ""}`}
            onClick={() => setActiveCategory("desapego")}
          >
            Desapegos
          </button>
          <button
            type="button"
            className={`filter-pill ${activeCategory === "experiencia" ? "active" : ""}`}
            onClick={() => setActiveCategory("experiencia")}
          >
            Experiências
          </button>
        </div>

        {/* FEED LIST */}
        {fetchingPosts ? (
          <div className="page-loader feed-skeleton">
            <div className="loader-spinner"></div>
            <p>Carregando publicações do feed...</p>
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="empty-state-card">
            <h3>Nenhuma publicação encontrada nesta categoria.</h3>
            <p>Seja a primeira a compartilhar uma dica ou oferta com a comunidade!</p>
          </div>
        ) : (
          filteredPosts.map((post) => (
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
          ))
        )}
      </section>
    </div>
  );
}

export default Feed;
