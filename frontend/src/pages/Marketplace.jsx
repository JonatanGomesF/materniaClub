import { useCallback, useEffect, useMemo, useState } from "react";
import ProdutoCard from "../components/ProdutoCard";
import { demoProducts } from "../data/demoData";
import { ensureUserProfile, getCurrentSession, isSupabaseConfigured, supabase, uploadMedia } from "../lib/supabaseClient";
import { useToast } from "../lib/toastContext";

const marketplaceHighlights = [
  {
    id: "baby-diaper",
    title: "Fraldas e Cuidados",
    image_url: "https://images.unsplash.com/photo-1546015720-b8b30df5aa27?auto=format&fit=crop&w=1200&q=90",
  },
  {
    id: "mother-child",
    title: "Maternidade e Apoio",
    image_url: "https://images.unsplash.com/photo-1492725764893-90b379c2b6e7?auto=format&fit=crop&w=1200&q=90",
  },
  {
    id: "baby-items",
    title: "Carrinhos e Utensílios",
    image_url: "https://images.unsplash.com/photo-1519689680058-324335c77eba?auto=format&fit=crop&w=1200&q=90",
  },
];

function isMissingProductLikesTable(error) {
  return error?.code === "42P01" || error?.code === "PGRST205" || error?.message?.includes("product_likes");
}

function Marketplace() {
  const { toast, showConfirm } = useToast();
  const [products, setProducts] = useState(isSupabaseConfigured ? [] : demoProducts);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [fetchingProducts, setFetchingProducts] = useState(isSupabaseConfigured);
  const [showForm, setShowForm] = useState(false);
  const [selectedProductDetails, setSelectedProductDetails] = useState(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("todas");
  const [selectedCondition, setSelectedCondition] = useState("todas");
  const [sortBy, setSortBy] = useState("recentes");

  const [userLocation, setUserLocation] = useState(() => {
    const saved = localStorage.getItem("materniaClubLocation");
    return saved ? JSON.parse(saved) : null;
  });

  const [form, setForm] = useState({
    title: "",
    price: "",
    city: "",
    category: "fraldas",
    condition: "seminovo",
    description: "",
  });
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const requestLocation = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        toast.warning("Seu navegador não suporta geolocalização.");
        reject(new Error("Não suportado"));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          localStorage.setItem("materniaClubLocation", JSON.stringify(location));
          setUserLocation(location);
          toast.success("Localização salva para cálculo de distância!");
          resolve(location);
        },
        () => {
          toast.info("Permita o acesso à localização para ver a distância dos anúncios.");
          reject(new Error("Permissão negada"));
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 300000 }
      );
    });
  }, [toast]);

  const fetchProducts = useCallback(async () => {
    if (!supabase) return;
    setFetchingProducts(true);

    try {
      const { data, error } = await supabase
        .from("products")
        .select("*, profiles(full_name, city, avatar_url)")
        .in("status", ["active", "sold"])
        .order("created_at", { ascending: false });

      if (error) {
        console.warn("Erro ao buscar produtos:", error.message);
        setFetchingProducts(false);
        return;
      }

      const ids = (data || []).map((product) => product.id);
      if (ids.length === 0) {
        setProducts([]);
        setFetchingProducts(false);
        return;
      }

      const { data: likes, error: likesError } = await supabase
        .from("product_likes")
        .select("product_id,user_id")
        .in("product_id", ids);

      if (likesError && !isMissingProductLikesTable(likesError)) {
        console.warn("Erro ao buscar curtidas de produtos:", likesError.message);
      }

      const enriched = data.map((product) => {
        const productLikes = likes?.filter((like) => like.product_id === product.id) || [];
        return {
          ...product,
          likes_count: productLikes.length,
          liked_by_me: productLikes.some((like) => like.user_id === session?.user?.id),
        };
      });

      setProducts(enriched);
    } finally {
      setFetchingProducts(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    getCurrentSession().then(({ session: currentSession, profile: currentProfile }) => {
      if (currentProfile?.account_type === "store") {
        window.location.href = "/lojas?view=manage";
        return;
      }
      setSession(currentSession);
      setProfile(currentProfile);
    });
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    if (!supabase) return undefined;

    const channel = supabase
      .channel("marketplace-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "product_likes" }, () => fetchProducts())
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => fetchProducts())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchProducts]);

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function createProduct(event) {
    event.preventDefault();
    if (!form.title.trim() || !form.price) {
      toast.warning("Preencha título e preço do anúncio.");
      return;
    }

    if (!supabase || !session?.user) {
      toast.info("Faça login para publicar desapegos.");
      return;
    }

    setLoading(true);
    try {
      const syncedProfile = profile || (await ensureUserProfile(session.user));
      if (syncedProfile) setProfile(syncedProfile);

      const location = userLocation || null;
      const imageUrl = file ? await uploadMedia(file, "products") : null;

      const { error } = await supabase.from("products").insert({
        seller_id: session.user.id,
        title: form.title.trim(),
        price: Number(form.price),
        city: form.city.trim() || profile?.city || "Brasil",
        category: form.category,
        condition: form.condition,
        description: form.description.trim(),
        image_url: imageUrl,
        latitude: location?.latitude || null,
        longitude: location?.longitude || null,
      });

      if (error) throw error;

      toast.success("Desapego anunciado no marketplace com sucesso!");
      setForm({ title: "", price: "", city: "", category: "fraldas", condition: "seminovo", description: "" });
      setFile(null);
      setShowForm(false);
      fetchProducts();
    } catch (error) {
      toast.error(error.message || "Erro ao publicar anúncio");
    } finally {
      setLoading(false);
    }
  }

  async function toggleLike(product) {
    if (!supabase || !session?.user) {
      toast.info("Faça login para curtir anúncios.");
      return;
    }

    if (product.liked_by_me) {
      const { error } = await supabase
        .from("product_likes")
        .delete()
        .eq("product_id", product.id)
        .eq("user_id", session.user.id);

      if (error) {
        toast.error("Erro ao descurtir: " + error.message);
        return;
      }
    } else {
      const { error } = await supabase.from("product_likes").insert({
        product_id: product.id,
        user_id: session.user.id,
      });

      if (error) {
        toast.error("Erro ao curtir: " + error.message);
        return;
      }
    }

    setProducts((current) =>
      current.map((item) => {
        if (item.id !== product.id) return item;
        const liked = !item.liked_by_me;
        return {
          ...item,
          liked_by_me: liked,
          likes_count: Math.max(0, (item.likes_count || 0) + (liked ? 1 : -1)),
        };
      })
    );
  }

  async function startConversation(product) {
    if (!supabase || !session?.user) {
      toast.info("Faça login para conversar com a anunciante.");
      return;
    }

    if (product.seller_id === session.user.id) {
      toast.warning("Este anúncio pertence a você.");
      return;
    }

    try {
      const syncedProfile = profile || (await ensureUserProfile(session.user));
      if (syncedProfile) setProfile(syncedProfile);

      const { data: existingConversation, error: existingError } = await supabase
        .from("conversations")
        .select("*")
        .eq("product_id", product.id)
        .eq("buyer_id", session.user.id)
        .eq("seller_id", product.seller_id)
        .maybeSingle();

      if (existingError) throw existingError;

      let conversation = existingConversation;

      if (!conversation) {
        const { data: createdConversation, error } = await supabase
          .from("conversations")
          .insert({
            product_id: product.id,
            buyer_id: session.user.id,
            seller_id: product.seller_id,
          })
          .select()
          .maybeSingle();

        if (error) throw error;
        conversation = createdConversation;
      }

      await supabase.from("messages").insert({
        conversation_id: conversation.id,
        sender_id: session.user.id,
        body: `Olá! Tenho interesse no desapego: ${product.title}`,
      });

      toast.success("Conversa iniciada!");
      window.location.href = `/chat?conversation=${conversation.id}`;
    } catch (error) {
      toast.error(error.message || "Erro ao abrir chat");
    }
  }

  async function deleteProduct(product) {
    if (!supabase || !session?.user || product.seller_id !== session.user.id) return;

    const confirmed = await showConfirm(
      "Excluir anúncio",
      "Deseja remover definitivamente este anúncio do marketplace?",
      "Excluir",
      "Cancelar",
      true
    );

    if (!confirmed) return;

    const { error } = await supabase.from("products").delete().eq("id", product.id).eq("seller_id", session.user.id);

    if (error) {
      toast.error("Erro ao excluir: " + error.message);
      return;
    }

    toast.success("Anúncio removido.");
    setProducts((current) => current.filter((item) => item.id !== product.id));
    if (selectedProductDetails?.id === product.id) setSelectedProductDetails(null);
  }

  async function updateProductStatus(product, status) {
    if (!supabase || !session?.user || product.seller_id !== session.user.id) return;

    const { error } = await supabase
      .from("products")
      .update({ status })
      .eq("id", product.id)
      .eq("seller_id", session.user.id);

    if (error) {
      toast.error(error.message || "Erro ao atualizar status");
      return;
    }

    toast.success(status === "sold" ? "Marcado como vendido!" : "Anúncio reativado!");
    setProducts((current) => current.map((item) => (item.id === product.id ? { ...item, status } : item)));
  }

  async function reportProduct(product) {
    if (!supabase || !session?.user) {
      toast.info("Faça login para denunciar anúncios.");
      return;
    }

    const confirmed = await showConfirm(
      "Denunciar anúncio",
      "Deseja enviar este anúncio para análise da equipe de moderação?",
      "Denunciar",
      "Cancelar",
      true
    );

    if (!confirmed) return;

    const { error } = await supabase.from("reports").insert({
      reporter_id: session.user.id,
      target_type: "product",
      target_id: product.id,
      reason: "Anúncio suspeito ou fora das diretrizes da comunidade",
    });

    if (error) {
      toast.error("Erro ao denunciar: " + error.message);
    } else {
      toast.success("Denúncia enviada aos administradores.");
    }
  }

  // Filtered & Sorted products
  const filteredProducts = useMemo(() => {
    return products
      .filter((p) => {
        const matchesQuery =
          !searchQuery.trim() ||
          p.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.city?.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesCategory =
          selectedCategory === "todas" || p.category?.toLowerCase() === selectedCategory.toLowerCase();

        const matchesCondition =
          selectedCondition === "todas" || p.condition?.toLowerCase() === selectedCondition.toLowerCase();

        return matchesQuery && matchesCategory && matchesCondition;
      })
      .sort((a, b) => {
        if (sortBy === "menor-preco") return Number(a.price) - Number(b.price);
        if (sortBy === "maior-preco") return Number(b.price) - Number(a.price);
        return new Date(b.created_at) - new Date(a.created_at);
      });
  }, [products, searchQuery, selectedCategory, selectedCondition, sortBy]);

  return (
    <div className="page-shell marketplace-layout">
      {/* HEADER HERO */}
      <section className="section-heading marketplace-heading">
        <div>
          <span className="eyebrow">Marketplace Materno</span>
          <h1>Compre, desapegue e economize com segurança.</h1>
          <p>
            O espaço ideal entre mães para desapegos de fraldas, carrinhos, mamadeiras, roupinhas, bebê conforto e
            artigos infantis com economia real.
          </p>
        </div>
        <div className="marketplace-heading-actions">
          <button
            className="primary-button announce-button"
            onClick={() => setShowForm((current) => !current)}
          >
            {showForm ? "✕ Fechar Formulário" : "+ Anunciar Desapego"}
          </button>
        </div>
      </section>

      {/* HIGHLIGHT BANNERS */}
      <section className="marketplace-feature-panel">
        <div className="marketplace-highlight-grid">
          {marketplaceHighlights.map((item) => (
            <article className="marketplace-highlight-card" key={item.id}>
              <img src={item.image_url} alt={item.title} />
              <div className="highlight-card-caption">
                <h3>{item.title}</h3>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* PUBLISH FORM DRAWER */}
      {showForm && (
        <form className="listing-form listing-drawer" onSubmit={createProduct}>
          <div className="drawer-header">
            <h2>Publicar Novo Desapego</h2>
            <button type="button" className="ghost-button small" onClick={() => setShowForm(false)}>
              ✕
            </button>
          </div>

          <div className="form-group">
            <label className="form-label">Título do Anúncio</label>
            <input
              name="title"
              required
              placeholder="Ex: Pacote de Fraldas Pampers Premium G (fechado)"
              value={form.title}
              onChange={updateField}
            />
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Preço (R$)</label>
              <input
                name="price"
                type="number"
                min="0"
                step="0.01"
                required
                placeholder="Ex: 45.00"
                value={form.price}
                onChange={updateField}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Sua Cidade / Bairro</label>
              <input
                name="city"
                placeholder="Ex: São Paulo - Pinheiros"
                value={form.city}
                onChange={updateField}
              />
            </div>
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Categoria</label>
              <select name="category" value={form.category} onChange={updateField}>
                <option value="fraldas">Fraldas & Higiene</option>
                <option value="chupetas">Chupetas & Mordedores</option>
                <option value="mamadeiras">Mamadeiras & Alimentação</option>
                <option value="carrinho">Carrinhos de Bebê</option>
                <option value="bebe conforto">Bebê Conforto & Cadeirinhas</option>
                <option value="roupinhas">Roupinhas & Calçados</option>
                <option value="brinquedos">Brinquedos Educativos</option>
                <option value="desapego">Outros Desapegos</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Condição do Item</label>
              <select name="condition" value={form.condition} onChange={updateField}>
                <option value="novo">Novo (Lacrado / Nunca Usado)</option>
                <option value="seminovo">Seminovo (Ótimo Estado)</option>
                <option value="usado">Usado (Com Marcas de Uso)</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Descrição e Detalhes de Retirada</label>
            <textarea
              name="description"
              rows={3}
              placeholder="Descreva detalhes, se entrega no metrô, motivo do desapego, validade..."
              value={form.description}
              onChange={updateField}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Foto do Produto</label>
            <label className="image-picker">
              <input type="file" accept="image/*" onChange={(event) => setFile(event.target.files?.[0] || null)} />
              <span>{file ? `Foto selecionada: ${file.name}` : "Escolher foto da galeria"}</span>
            </label>
          </div>

          <div className="location-action-box">
            <button
              className="soft-button"
              type="button"
              onClick={() => requestLocation().catch(() => {})}
            >
              📍 {userLocation ? "Localização GPS salva" : "Incluir minha localização para calcular distância"}
            </button>
            <p className="hint">
              A localização aproximada permite mostrar aos compradores: "a 3 km de você".
            </p>
          </div>

          <button className="primary-button submit-publish-btn" disabled={loading}>
            {loading ? "Publicando anúncio..." : "Publicar Anúncio no Marketplace"}
          </button>
        </form>
      )}

      {/* FILTER & SEARCH BAR */}
      <section className="marketplace-controls">
        <div className="search-input-wrapper">
          <input
            type="search"
            placeholder="Buscar por fraldas, carrinho, mamadeira, cidade..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="filters-row">
          <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
            <option value="todas">Todas as Categorias</option>
            <option value="fraldas">Fraldas</option>
            <option value="chupetas">Chupetas</option>
            <option value="mamadeiras">Mamadeiras</option>
            <option value="carrinho">Carrinhos</option>
            <option value="bebe conforto">Bebê Conforto</option>
            <option value="roupinhas">Roupinhas</option>
            <option value="brinquedos">Brinquedos</option>
          </select>

          <select value={selectedCondition} onChange={(e) => setSelectedCondition(e.target.value)}>
            <option value="todas">Todas as Condições</option>
            <option value="novo">Novo</option>
            <option value="seminovo">Seminovo</option>
            <option value="usado">Usado</option>
          </select>

          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="recentes">Mais Recentes</option>
            <option value="menor-preco">Menor Preço</option>
            <option value="maior-preco">Maior Preço</option>
          </select>

          {!userLocation && (
            <button className="soft-button small" type="button" onClick={() => requestLocation().catch(() => {})}>
              📍 Ativar Distância
            </button>
          )}
        </div>
      </section>

      {/* PRODUCT RESULTS GRID */}
      <section className="marketplace-results">
        <div className="store-panel-title">
          <div>
            <span className="eyebrow">Desapegos Disponíveis</span>
            <h2>Produtos publicados pelas mães</h2>
          </div>
          <strong>{filteredProducts.length} itens encontrados</strong>
        </div>

        {fetchingProducts ? (
          <div className="page-loader">
            <div className="loader-spinner"></div>
            <p>Carregando desapegos da comunidade...</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="empty-state-card">
            <h3>Nenhum anúncio encontrado para esta busca.</h3>
            <p>Tente ajustar os filtros ou seja a primeira a anunciar!</p>
          </div>
        ) : (
          <div className="product-grid">
            {filteredProducts.map((product) => (
              <ProdutoCard
                key={product.id}
                produto={product}
                currentUserId={session?.user?.id}
                userLocation={userLocation}
                onDelete={deleteProduct}
                onInterest={startConversation}
                onLike={toggleLike}
                onReport={reportProduct}
                onStatusChange={updateProductStatus}
                onOpenDetails={(p) => setSelectedProductDetails(p)}
              />
            ))}
          </div>
        )}
      </section>

      {/* PRODUCT DETAILS MODAL */}
      {selectedProductDetails && (
        <div className="profile-modal-backdrop" role="presentation" onClick={() => setSelectedProductDetails(null)}>
          <div className="product-modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="product-modal-header">
              <h3>{selectedProductDetails.title}</h3>
              <button
                type="button"
                className="ghost-button small"
                onClick={() => setSelectedProductDetails(null)}
              >
                ✕
              </button>
            </div>

            <div className="product-modal-body">
              {selectedProductDetails.image_url && (
                <div className="product-modal-image">
                  <img src={selectedProductDetails.image_url} alt={selectedProductDetails.title} />
                </div>
              )}

              <div className="product-modal-info">
                <div className="product-modal-price">
                  <strong>
                    {Number(selectedProductDetails.price).toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </strong>
                  <span className="condition-pill">{selectedProductDetails.condition || "Seminovo"}</span>
                </div>

                <p className="product-modal-desc">
                  {selectedProductDetails.description || "Nenhuma descrição detalhada informada."}
                </p>

                <div className="product-modal-seller">
                  <span>Anunciado por:</span>
                  <strong>{selectedProductDetails.profiles?.full_name || "Mãe da comunidade"}</strong>
                  <small>{selectedProductDetails.city || "Brasil"}</small>
                </div>

                <div className="product-modal-actions">
                  {selectedProductDetails.seller_id !== session?.user?.id && (
                    <button
                      className="primary-button"
                      onClick={() => {
                        setSelectedProductDetails(null);
                        startConversation(selectedProductDetails);
                      }}
                    >
                      💬 Conversar / Tenho Interesse
                    </button>
                  )}
                  <button
                    className="soft-button"
                    onClick={() => {
                      toggleLike(selectedProductDetails);
                    }}
                  >
                    {selectedProductDetails.liked_by_me ? "♥ Salvo nos Favoritos" : "♡ Curtir Desapego"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Marketplace;
