import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import ProdutoCard from "../components/ProdutoCard";
import { ensureUserProfile, getCurrentSession, supabase, uploadMedia } from "../lib/supabaseClient";
import { useToast } from "../lib/toastContext";

function formatCNPJ(value) {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
}

const emptyStore = {
  name: "",
  cnpj: "",
  city: "",
  description: "",
  logo_url: "",
  cover_url: "",
};

const emptyStoreAccess = {
  email: "",
  password: "",
  name: "",
  cnpj: "",
  city: "",
  description: "",
};

const emptyProduct = {
  title: "",
  price: "",
  city: "",
  category: "fraldas",
  description: "",
};

function Lojas() {
  const { toast, showConfirm } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [stores, setStores] = useState([]);
  const [store, setStore] = useState(null);
  const [storeProducts, setStoreProducts] = useState([]);
  const [myProducts, setMyProducts] = useState([]);
  const [storeReviews, setStoreReviews] = useState([]);
  const [selectedStore, setSelectedStore] = useState(null);
  const [activeView, setActiveView] = useState(() => (searchParams.get("view") === "manage" ? "manage" : "showcase"));

  const [storeSearch, setStoreSearch] = useState("");
  const [storeForm, setStoreForm] = useState(emptyStore);
  const [storeAccess, setStoreAccess] = useState(emptyStoreAccess);
  const [productForm, setProductForm] = useState(emptyProduct);
  const [editingProduct, setEditingProduct] = useState(null);
  const [file, setFile] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [coverFile, setCoverFile] = useState(null);
  const [isStoreEditOpen, setIsStoreEditOpen] = useState(false);
  const [isProductFormOpen, setIsProductFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadStores = useCallback(async (currentSession, currentProfile) => {
    if (!supabase) return;

    const { data: storeRows } = await supabase
      .from("stores")
      .select("*")
      .eq("status", "verified")
      .order("created_at", { ascending: false });

    const visibleStores = storeRows || [];
    setStores(visibleStores);

    if (visibleStores.length > 0) {
      const { data: reviewRows } = await supabase
        .from("store_reviews")
        .select("*, reviewer:profiles!store_reviews_reviewer_id_fkey(full_name, avatar_url)")
        .in("store_id", visibleStores.map((item) => item.id))
        .eq("status", "published")
        .order("created_at", { ascending: false });

      setStoreReviews(reviewRows || []);
    } else {
      setStoreReviews([]);
    }

    const { data: productRows } = await supabase
      .from("store_products")
      .select("*, stores(name, city, owner_id, logo_url, status)")
      .in("status", ["active", "sold"])
      .order("created_at", { ascending: false });

    const visibleProducts = (productRows || []).filter((product) => product.stores?.status === "verified");
    setStoreProducts(visibleProducts);

    const requestedStoreId = searchParams.get("store");
    const requestedProductId = searchParams.get("produto");
    if (requestedStoreId) {
      const storeFromUrl =
        visibleStores.find((item) => item.id === requestedStoreId) ||
        visibleStores.find((item) =>
          visibleProducts.some((product) => product.id === requestedProductId && product.store_id === item.id)
        );
      if (storeFromUrl) {
        setSelectedStore(storeFromUrl);
        setActiveView("showcase");
      }
    }

    if (!currentSession?.user || currentProfile?.account_type !== "store") {
      setStore(null);
      setMyProducts([]);
      return;
    }

    const { data: myStore } = await supabase
      .from("stores")
      .select("*")
      .eq("owner_id", currentSession.user.id)
      .maybeSingle();

    setStore(myStore);

    if (myStore) {
      setStoreForm({
        name: myStore.name || "",
        cnpj: formatCNPJ(myStore.cnpj || ""),
        city: myStore.city || "",
        description: myStore.description || "",
        logo_url: myStore.logo_url || "",
        cover_url: myStore.cover_url || "",
      });

      const { data: mine } = await supabase
        .from("store_products")
        .select("*")
        .eq("store_id", myStore.id)
        .order("created_at", { ascending: false });

      setMyProducts(mine || []);
    }
  }, [searchParams]);

  useEffect(() => {
    async function load() {
      const { session: currentSession, profile: currentProfile } = await getCurrentSession();
      setSession(currentSession);
      setProfile(currentProfile);
      loadStores(currentSession, currentProfile);
    }
    load();
  }, [loadStores]);

  function updateStoreForm(event) {
    const { name, value } = event.target;
    if (name === "cnpj") {
      setStoreForm((current) => ({ ...current, cnpj: formatCNPJ(value) }));
    } else {
      setStoreForm((current) => ({ ...current, [name]: value }));
    }
  }

  function updateStoreAccess(event) {
    const { name, value } = event.target;
    if (name === "cnpj") {
      setStoreAccess((current) => ({ ...current, cnpj: formatCNPJ(value) }));
    } else {
      setStoreAccess((current) => ({ ...current, [name]: value }));
    }
  }

  function updateProductForm(event) {
    setProductForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function saveStore(event) {
    event.preventDefault();
    if (!supabase || !session?.user) {
      toast.info("Entre no app para cadastrar sua loja.");
      return;
    }
    if (profile?.account_type !== "store") {
      toast.warning("Esta área é exclusiva para contas de loja parceira.");
      return;
    }

    const rawCnpj = storeForm.cnpj.replace(/\D/g, "");
    if (!storeForm.name.trim() || rawCnpj.length !== 14) {
      toast.warning("Informe o nome da loja e um CNPJ válido com 14 dígitos.");
      return;
    }

    setSaving(true);
    try {
      await ensureUserProfile(session.user, { full_name: storeForm.name.trim(), city: storeForm.city.trim() });
      const logoUrl = logoFile ? await uploadMedia(logoFile, "store-logos") : storeForm.logo_url || null;
      const coverUrl = coverFile ? await uploadMedia(coverFile, "store-covers") : storeForm.cover_url || null;

      const payload = {
        owner_id: session.user.id,
        name: storeForm.name.trim(),
        cnpj: rawCnpj,
        city: storeForm.city.trim(),
        description: storeForm.description.trim(),
        logo_url: logoUrl,
      };

      if (coverUrl) payload.cover_url = coverUrl;

      const { error } = store
        ? await supabase.from("stores").update(payload).eq("id", store.id)
        : await supabase.from("stores").insert(payload);

      if (error) throw error;

      toast.success("Dados da loja atualizados!");
      setLogoFile(null);
      setCoverFile(null);
      await loadStores(session, { ...profile, account_type: "store" });
      setActiveView("manage");
      setIsStoreEditOpen(false);
    } catch (error) {
      toast.error(error.message || "Erro ao salvar loja");
    } finally {
      setSaving(false);
    }
  }

  async function registerStoreAccount(event) {
    event.preventDefault();
    if (!supabase) return toast.warning("Conecte o Supabase para cadastrar lojas.");

    const rawCnpj = storeAccess.cnpj.replace(/\D/g, "");
    if (!storeAccess.email || !storeAccess.password || !storeAccess.name || rawCnpj.length !== 14) {
      return toast.warning("Preencha email, senha, nome da loja e CNPJ válido.");
    }

    setSaving(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: storeAccess.email.trim(),
        password: storeAccess.password,
        options: { data: { full_name: storeAccess.name.trim(), account_type: "store", cnpj: rawCnpj } },
      });

      if (error) throw error;

      if (!data.session?.user) {
        toast.info("Conta da loja criada! Verifique seu email para confirmar o acesso.");
        return;
      }

      const storeProfile = await ensureUserProfile(data.session.user, {
        full_name: storeAccess.name.trim(),
        city: storeAccess.city.trim(),
        account_type: "store",
      });

      const { error: storeError } = await supabase.from("stores").insert({
        owner_id: data.session.user.id,
        name: storeAccess.name.trim(),
        cnpj: rawCnpj,
        city: storeAccess.city.trim(),
        description: storeAccess.description.trim(),
        status: "pending",
      });

      if (storeError) throw storeError;

      toast.success("Loja cadastrada com sucesso! Enviada para análise.");
      setSession(data.session);
      setProfile(storeProfile);
      setStoreAccess(emptyStoreAccess);
      await loadStores(data.session, storeProfile);
    } catch (error) {
      toast.error(error.message || "Erro ao cadastrar loja");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(product) {
    setEditingProduct(product);
    setProductForm({
      title: product.title || "",
      price: product.price || "",
      city: product.city || "",
      category: product.category || "fraldas",
      description: product.description || "",
    });
    setFile(null);
    setIsProductFormOpen(true);
  }

  function openProductCreate() {
    setEditingProduct(null);
    setProductForm(emptyProduct);
    setFile(null);
    setIsProductFormOpen(true);
  }

  function closeProductForm() {
    setEditingProduct(null);
    setProductForm(emptyProduct);
    setFile(null);
    setIsProductFormOpen(false);
  }

  async function saveProduct(event) {
    event.preventDefault();
    if (!supabase || !session?.user || !store) return toast.info("Cadastre sua loja antes de publicar produtos.");
    if (store.status !== "verified") return toast.warning("Sua loja precisa ser verificada pela moderação antes de publicar.");
    if (!productForm.title.trim() || !productForm.price) return toast.warning("Informe nome e preço do produto.");

    setSaving(true);
    try {
      const imageUrl = file ? await uploadMedia(file, "store-products") : editingProduct?.image_url || null;
      const payload = {
        store_id: store.id,
        title: productForm.title.trim(),
        description: productForm.description.trim(),
        price: Number(productForm.price),
        category: productForm.category,
        city: productForm.city.trim() || store.city,
        image_url: imageUrl,
        status: editingProduct?.status || "active",
      };

      const { error } = editingProduct
        ? await supabase.from("store_products").update(payload).eq("id", editingProduct.id)
        : await supabase.from("store_products").insert(payload);

      if (error) throw error;

      toast.success(editingProduct ? "Produto atualizado com sucesso!" : "Produto adicionado à sua vitrine!");
      closeProductForm();
      await loadStores(session, profile);
    } catch (error) {
      toast.error(error.message || "Erro ao salvar produto");
    } finally {
      setSaving(false);
    }
  }

  async function updateProductStatus(product, status) {
    const { error } = await supabase.from("store_products").update({ status }).eq("id", product.id);
    if (error) return toast.error(error.message);
    toast.success(status === "sold" ? "Marcado como esgotado/vendido!" : "Produto liberado para venda!");
    loadStores(session, profile);
  }

  async function deleteProduct(product) {
    const confirmed = await showConfirm(
      "Excluir produto da vitrine",
      "Deseja excluir definitivamente este item do catálogo?",
      "Excluir",
      "Cancelar",
      true
    );
    if (!confirmed) return;

    const { error } = await supabase.from("store_products").delete().eq("id", product.id);
    if (error) return toast.error(error.message);
    toast.success("Produto excluído com sucesso.");
    loadStores(session, profile);
  }

  async function startStoreConversation(product) {
    if (!supabase || !session?.user) {
      toast.info("Faça login para conversar com a loja parceira.");
      return;
    }

    if (product.seller_id === session.user.id) {
      toast.warning("Você administra esta loja.");
      return;
    }

    try {
      await ensureUserProfile(session.user);

      const baseConversation = {
        buyer_id: session.user.id,
        seller_id: product.seller_id,
      };

      let conversation = null;

      const { data: existingStoreConversation, error: existingStoreError } = await supabase
        .from("conversations")
        .select("*")
        .eq("store_product_id", product.id)
        .eq("buyer_id", session.user.id)
        .eq("seller_id", product.seller_id)
        .maybeSingle();

      if (!existingStoreError) {
        conversation = existingStoreConversation;
      }

      if (!conversation && !existingStoreError) {
        const { data: createdStoreConversation, error: createStoreError } = await supabase
          .from("conversations")
          .insert({ ...baseConversation, store_product_id: product.id })
          .select()
          .maybeSingle();

        if (createStoreError) throw createStoreError;
        conversation = createdStoreConversation;
      }

      await supabase.from("messages").insert({
        conversation_id: conversation.id,
        sender_id: session.user.id,
        body: `Olá! Quero comprar na loja o produto: ${product.title}`,
      });

      toast.success("Conversa aberta no Chat!");
      window.location.href = `/chat?conversation=${conversation.id}`;
    } catch (error) {
      toast.error(error.message || "Erro ao iniciar conversa");
    }
  }

  const selectedStoreProducts = selectedStore
    ? storeProducts.filter((product) => product.store_id === selectedStore.id)
    : [];

  const publicProducts = selectedStoreProducts.map((product) => ({
    ...product,
    condition: "novo",
    seller_id: product.stores?.owner_id,
    profiles: { full_name: product.stores?.name || "Loja Parceira" },
    city: product.city || product.stores?.city,
  }));

  const filteredStores = stores.filter((s) => {
    if (!storeSearch.trim()) return true;
    return (
      s.name.toLowerCase().includes(storeSearch.toLowerCase()) ||
      s.city?.toLowerCase().includes(storeSearch.toLowerCase()) ||
      s.description?.toLowerCase().includes(storeSearch.toLowerCase())
    );
  });

  function getStoreProductCount(storeItem) {
    return storeProducts.filter((product) => product.store_id === storeItem.id).length;
  }

  function getStoreReviews(storeItem) {
    if (!storeItem) return [];
    return storeReviews.filter((review) => review.store_id === storeItem.id);
  }

  function getStoreAverageRating(storeItem) {
    const reviews = getStoreReviews(storeItem);
    if (reviews.length === 0) return null;
    const total = reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0);
    return (total / reviews.length).toFixed(1);
  }

  function renderStars(rating) {
    return [1, 2, 3, 4, 5].map((star) => (
      <span className={star <= Number(rating) ? "star-active" : "star-inactive"} key={star}>
        ★
      </span>
    ));
  }

  const isStoreOwner = profile?.account_type === "store";

  return (
    <div className="page-shell stores-layout">
      {/* HEADER SECTION */}
      <section className="section-heading store-heading">
        <div>
          <span className="eyebrow">Lojas Parceiras</span>
          <h1>Vitrines comerciais verificadas para você e seu bebê.</h1>
          <p>
            Compre direto de marcas, lojistas e fabricantes infantis com garantia de procedência, CNPJ checado e
            atendimento exclusivo via chat.
          </p>
        </div>

        <div className="stores-nav-tabs">
          <button
            type="button"
            className={`tab-btn ${activeView === "showcase" ? "active" : ""}`}
            onClick={() => {
              setActiveView("showcase");
              setSelectedStore(null);
            }}
          >
            Vitrines de Lojas
          </button>
          <button
            type="button"
            className={`tab-btn ${activeView === "manage" ? "active" : ""}`}
            onClick={() => setActiveView("manage")}
          >
            {isStoreOwner ? "Minha Loja & Painel" : "Seja uma Loja Parceira"}
          </button>
        </div>
      </section>

      {/* VIEW: SHOWCASE */}
      {activeView === "showcase" && (
        <>
          {selectedStore ? (
            /* STORE DETAIL SHOWCASE */
            <section className="selected-store-view">
              <button
                type="button"
                className="ghost-button back-to-stores-btn"
                onClick={() => setSelectedStore(null)}
              >
                ← Voltar para todas as lojas
              </button>

              <div className="store-hero-card">
                {selectedStore.cover_url && (
                  <div className="store-hero-cover">
                    <img src={selectedStore.cover_url} alt="Capa da loja" />
                  </div>
                )}
                <div className="store-hero-content">
                  <div className="store-logo-large">
                    {selectedStore.logo_url ? (
                      <img src={selectedStore.logo_url} alt={selectedStore.name} />
                    ) : (
                      selectedStore.name.charAt(0)
                    )}
                  </div>
                  <div className="store-hero-info">
                    <div className="store-hero-title-row">
                      <h2>{selectedStore.name}</h2>
                      <span className="verified-store-badge">✓ Loja Verificada</span>
                    </div>
                    <p className="store-city-line">{selectedStore.city || "Brasil"} · CNPJ: {formatCNPJ(selectedStore.cnpj)}</p>
                    <p className="store-hero-desc">{selectedStore.description || "Produtos infantis selecionados com carinho para as mamães."}</p>

                    <div className="store-rating-summary">
                      {getStoreAverageRating(selectedStore) ? (
                        <>
                          <span className="store-stars-row">{renderStars(getStoreAverageRating(selectedStore))}</span>
                          <strong>{getStoreAverageRating(selectedStore)} / 5</strong>
                          <span>({getStoreReviews(selectedStore).length} avaliações)</span>
                        </>
                      ) : (
                        <span className="hint">Loja nova na plataforma</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* STORE PRODUCTS */}
              <section className="store-products-section">
                <div className="store-panel-title">
                  <div>
                    <span className="eyebrow">Catálogo</span>
                    <h2>Produtos disponíveis na loja</h2>
                  </div>
                  <strong>{publicProducts.length} itens</strong>
                </div>

                {publicProducts.length === 0 ? (
                  <div className="empty-state-card">
                    <p>Esta loja ainda não adicionou produtos ativos no momento.</p>
                  </div>
                ) : (
                  <div className="product-grid">
                    {publicProducts.map((product) => (
                      <ProdutoCard
                        key={product.id}
                        produto={product}
                        currentUserId={session?.user?.id}
                        interestLabel="Comprar da Loja"
                        onInterest={startStoreConversation}
                      />
                    ))}
                  </div>
                )}
              </section>

              {/* STORE REVIEWS */}
              <section className="store-reviews-section">
                <h2>Avaliações de Clientes</h2>
                {getStoreReviews(selectedStore).length === 0 ? (
                  <p className="empty-state">Essa loja ainda não possui avaliações públicas.</p>
                ) : (
                  <div className="review-list">
                    {getStoreReviews(selectedStore).map((review) => (
                      <article className="review-card" key={review.id}>
                        <div className="review-author">
                          <span className="profile-avatar-small">
                            {review.reviewer?.avatar_url ? (
                              <img src={review.reviewer.avatar_url} alt="" />
                            ) : (
                              review.reviewer?.full_name?.charAt(0) || "M"
                            )}
                          </span>
                          <div>
                            <strong>{review.reviewer?.full_name || "Cliente materniaClub"}</strong>
                            <span className="review-stars">{renderStars(review.rating)}</span>
                          </div>
                        </div>
                        {review.comment && <p>{review.comment}</p>}
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </section>
          ) : (
            /* ALL STORES GRID */
            <section className="stores-directory">
              <div className="stores-search-bar">
                <input
                  type="search"
                  placeholder="Buscar loja por nome, cidade ou especialidade..."
                  value={storeSearch}
                  onChange={(e) => setStoreSearch(e.target.value)}
                />
              </div>

              {filteredStores.length === 0 ? (
                <div className="empty-state-card">
                  <h3>Nenhuma loja parceira encontrada.</h3>
                  <p>Cadastre sua loja para ser a primeira a aparecer na vitrine!</p>
                </div>
              ) : (
                <div className="stores-grid">
                  {filteredStores.map((item) => (
                    <article
                      className="store-card-item"
                      key={item.id}
                      onClick={() => setSelectedStore(item)}
                    >
                      <div className="store-card-cover">
                        {item.cover_url ? (
                          <img src={item.cover_url} alt="" />
                        ) : (
                          <div className="cover-placeholder" />
                        )}
                        <div className="store-card-logo">
                          {item.logo_url ? <img src={item.logo_url} alt="" /> : item.name.charAt(0)}
                        </div>
                      </div>

                      <div className="store-card-body">
                        <div className="store-card-title">
                          <h3>{item.name}</h3>
                          <span className="badge-verified">✓</span>
                        </div>
                        <p className="store-card-city">{item.city || "Brasil"}</p>
                        <p className="store-card-desc">{item.description || "Produtos infantis selecionados."}</p>

                        <div className="store-card-footer">
                          <span>{getStoreProductCount(item)} produtos</span>
                          <button type="button" className="primary-button small">
                            Ver Vitrine →
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}

      {/* VIEW: MANAGE / REGISTER */}
      {activeView === "manage" && (
        <section className="store-management-view">
          {session?.user && profile?.account_type === "store" ? (
            store ? (
              /* STORE DASHBOARD */
              <div className="store-dashboard">
                {/* STATUS ALERT BANNER */}
                {store.status === "pending" && (
                  <div className="store-alert-banner alert-warning">
                    <span className="banner-icon">⏳</span>
                    <div>
                      <strong>Sua loja está em análise de verificação</strong>
                      <p>
                        Nosso time está checando o CNPJ ({formatCNPJ(store.cnpj)}) e os dados. Assim que for
                        aprovada, seus produtos aparecerão no Feed e na Vitrine com o selo verificado!
                      </p>
                    </div>
                  </div>
                )}

                {store.status === "verified" && (
                  <div className="store-alert-banner alert-success">
                    <span className="banner-icon">✓</span>
                    <div>
                      <strong>Loja Verificada e Ativa!</strong>
                      <p>Sua loja possui o selo verde oficial de parceira confiável do materniaClub.</p>
                    </div>
                  </div>
                )}

                {store.status === "suspended" && (
                  <div className="store-alert-banner alert-danger">
                    <span className="banner-icon">✕</span>
                    <div>
                      <strong>Loja Temporariamente Suspensa</strong>
                      <p>Entre em contato com a equipe de suporte para regularizar o cadastro.</p>
                    </div>
                  </div>
                )}

                {/* STORE PROFILE CARD */}
                <div className="store-admin-header-card">
                  <div className="store-admin-logo">
                    {store.logo_url ? <img src={store.logo_url} alt="" /> : store.name.charAt(0)}
                  </div>
                  <div className="store-admin-info">
                    <h2>{store.name}</h2>
                    <p>{store.city || "Brasil"} · CNPJ: {formatCNPJ(store.cnpj)}</p>
                    <span className={`status-pill status-${store.status}`}>
                      {store.status === "verified"
                        ? "Verificada"
                        : store.status === "pending"
                        ? "Aguardando Aprovação"
                        : store.status}
                    </span>
                  </div>
                  <div className="store-admin-actions">
                    <button
                      type="button"
                      className="soft-button"
                      onClick={() => setIsStoreEditOpen(!isStoreEditOpen)}
                    >
                      {isStoreEditOpen ? "Fechar Edição" : "Editar Dados da Loja"}
                    </button>
                    {store.status === "verified" && (
                      <button type="button" className="primary-button" onClick={openProductCreate}>
                        + Novo Produto
                      </button>
                    )}
                  </div>
                </div>

                {/* EDIT STORE FORM */}
                {isStoreEditOpen && (
                  <form className="listing-form store-edit-form" onSubmit={saveStore}>
                    <h3>Editar Perfil da Loja</h3>
                    <div className="form-group">
                      <label className="form-label">Nome da Loja</label>
                      <input name="name" required value={storeForm.name} onChange={updateStoreForm} />
                    </div>
                    <div className="form-grid">
                      <div className="form-group">
                        <label className="form-label">CNPJ</label>
                        <input name="cnpj" required value={storeForm.cnpj} onChange={updateStoreForm} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Cidade / Estado</label>
                        <input name="city" value={storeForm.city} onChange={updateStoreForm} />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Descrição da Loja</label>
                      <textarea
                        name="description"
                        rows={3}
                        value={storeForm.description}
                        onChange={updateStoreForm}
                      />
                    </div>
                    <div className="form-grid">
                      <div className="form-group">
                        <label className="form-label">Logotipo da Loja</label>
                        <label className="image-picker">
                          <input type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] || null)} />
                          <span>{logoFile ? logoFile.name : "Alterar Logotipo"}</span>
                        </label>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Imagem de Capa</label>
                        <label className="image-picker">
                          <input type="file" accept="image/*" onChange={(e) => setCoverFile(e.target.files?.[0] || null)} />
                          <span>{coverFile ? coverFile.name : "Alterar Capa"}</span>
                        </label>
                      </div>
                    </div>
                    <button className="primary-button" disabled={saving}>
                      {saving ? "Salvando..." : "Salvar Alterações da Loja"}
                    </button>
                  </form>
                )}

                {/* MY PRODUCTS LIST */}
                <section className="store-inventory-section">
                  <div className="store-panel-title">
                    <div>
                      <span className="eyebrow">Vitrine</span>
                      <h2>Produtos cadastrados da sua loja</h2>
                    </div>
                    <strong>{myProducts.length} itens</strong>
                  </div>

                  {myProducts.length === 0 ? (
                    <div className="empty-state-card">
                      <h3>Nenhum produto cadastrado ainda.</h3>
                      <p>
                        {store.status === "verified"
                          ? "Clique em '+ Novo Produto' para começar a vender para as mães!"
                          : "Assim que sua loja for verificada, você poderá cadastrar seus produtos aqui."}
                      </p>
                    </div>
                  ) : (
                    <div className="inventory-grid">
                      {myProducts.map((p) => (
                        <article className="inventory-card" key={p.id}>
                          <div className="inventory-media">
                            {p.image_url ? <img src={p.image_url} alt="" /> : <span>Sem foto</span>}
                          </div>
                          <div className="inventory-info">
                            <h4>{p.title}</h4>
                            <strong>
                              {Number(p.price).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                            </strong>
                            <p>{p.category} · {p.city || store.city}</p>
                            <span className={`status-tag status-${p.status}`}>
                              {p.status === "active" ? "Disponível" : "Vendido/Esgotado"}
                            </span>
                            <div className="inventory-actions">
                              <button type="button" className="ghost-button small" onClick={() => startEdit(p)}>
                                Editar
                              </button>
                              <button
                                type="button"
                                className="soft-button small"
                                onClick={() => updateProductStatus(p, p.status === "active" ? "sold" : "active")}
                              >
                                {p.status === "active" ? "Esgotar" : "Reativar"}
                              </button>
                              <button
                                type="button"
                                className="ghost-button danger-text small"
                                onClick={() => deleteProduct(p)}
                              >
                                Excluir
                              </button>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            ) : (
              /* STORE ONBOARDING FORM */
              <form className="listing-form" onSubmit={saveStore}>
                <h2>Cadastre sua Loja Parceira</h2>
                <p>Preencha os dados da sua empresa para solicitar verificação.</p>

                <div className="form-group">
                  <label className="form-label">Nome Fantasia da Loja</label>
                  <input
                    name="name"
                    required
                    placeholder="Ex: Baby Store Oficial"
                    value={storeForm.name}
                    onChange={updateStoreForm}
                  />
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">CNPJ (14 números)</label>
                    <input
                      name="cnpj"
                      required
                      inputMode="numeric"
                      placeholder="00.000.000/0000-00"
                      value={storeForm.cnpj}
                      onChange={updateStoreForm}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Cidade / Estado</label>
                    <input
                      name="city"
                      placeholder="Ex: Campinas - SP"
                      value={storeForm.city}
                      onChange={updateStoreForm}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Sobre a Loja</label>
                  <textarea
                    name="description"
                    rows={3}
                    placeholder="Conte sobre sua loja, tipos de produtos e atendimento..."
                    value={storeForm.description}
                    onChange={updateStoreForm}
                  />
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Logotipo</label>
                    <label className="image-picker">
                      <input type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] || null)} />
                      <span>{logoFile ? logoFile.name : "Upload do Logotipo"}</span>
                    </label>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Banner / Capa</label>
                    <label className="image-picker">
                      <input type="file" accept="image/*" onChange={(e) => setCoverFile(e.target.files?.[0] || null)} />
                      <span>{coverFile ? coverFile.name : "Upload da Capa"}</span>
                    </label>
                  </div>
                </div>

                <button className="primary-button" disabled={saving}>
                  {saving ? "Cadastrando Loja..." : "Enviar Loja para Aprovação"}
                </button>
              </form>
            )
          ) : (
            /* NEW STORE REGISTRATION */
            <section className="store-register-banner-box">
              <div className="store-pitch-card">
                <span className="eyebrow">Expanda seu negócio</span>
                <h2>Venda para milhares de mães no materniaClub</h2>
                <p>
                  Cadastre sua loja com CNPJ, ganhe o selo de Loja Verificada, exponha produtos diretamente no Feed e
                  atenda clientes no chat da plataforma.
                </p>
                <div className="pitch-bullets">
                  <div>✓ Selo verde de Loja Verificada após análise do CNPJ</div>
                  <div>✓ Publicações automáticas dos produtos no feed principal</div>
                  <div>✓ Canal direto de chat para vendas e entregas</div>
                  <div>✓ Avaliações reais de clientes com notas e comentários</div>
                </div>
              </div>

              <form className="listing-form store-signup-form" onSubmit={registerStoreAccount}>
                <h3>Criar Conta de Loja Parceira</h3>

                <div className="form-group">
                  <label className="form-label">Nome da Loja</label>
                  <input
                    name="name"
                    required
                    placeholder="Ex: Pequenos Passos Kids"
                    value={storeAccess.name}
                    onChange={updateStoreAccess}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">CNPJ</label>
                  <input
                    name="cnpj"
                    required
                    inputMode="numeric"
                    placeholder="00.000.000/0000-00"
                    value={storeAccess.cnpj}
                    onChange={updateStoreAccess}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Cidade</label>
                  <input
                    name="city"
                    placeholder="Ex: São Paulo"
                    value={storeAccess.city}
                    onChange={updateStoreAccess}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Email de Acesso</label>
                  <input
                    name="email"
                    required
                    type="email"
                    placeholder="contato@sualoja.com.br"
                    value={storeAccess.email}
                    onChange={updateStoreAccess}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Senha</label>
                  <input
                    name="password"
                    required
                    type="password"
                    minLength={6}
                    placeholder="Mínimo 6 caracteres"
                    value={storeAccess.password}
                    onChange={updateStoreAccess}
                  />
                </div>

                <button className="primary-button" disabled={saving}>
                  {saving ? "Criando Conta..." : "Cadastrar Loja e Solicitar Verificação"}
                </button>
              </form>
            </section>
          )}

          {/* PRODUCT CREATION/EDIT MODAL */}
          {isProductFormOpen && (
            <div className="profile-modal-backdrop" role="presentation" onClick={closeProductForm}>
              <form
                className="listing-form listing-drawer product-form-modal"
                onClick={(e) => e.stopPropagation()}
                onSubmit={saveProduct}
              >
                <div className="drawer-header">
                  <h2>{editingProduct ? "Editar Produto da Vitrine" : "Novo Produto na Vitrine"}</h2>
                  <button type="button" className="ghost-button small" onClick={closeProductForm}>
                    ✕
                  </button>
                </div>

                <div className="form-group">
                  <label className="form-label">Título do Produto</label>
                  <input
                    name="title"
                    required
                    placeholder="Ex: Kit Mamadeira Anti-Cólica 260ml"
                    value={productForm.title}
                    onChange={updateProductForm}
                  />
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Preço de Venda (R$)</label>
                    <input
                      name="price"
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      placeholder="Ex: 89.90"
                      value={productForm.price}
                      onChange={updateProductForm}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Categoria</label>
                    <select name="category" value={productForm.category} onChange={updateProductForm}>
                      <option value="fraldas">Fraldas & Higiene</option>
                      <option value="chupetas">Chupetas</option>
                      <option value="mamadeiras">Mamadeiras & Copos</option>
                      <option value="carrinho">Carrinhos</option>
                      <option value="bebe conforto">Bebê Conforto</option>
                      <option value="roupinhas">Roupinhas & Enxoval</option>
                      <option value="brinquedos">Brinquedos</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Descrição do Produto</label>
                  <textarea
                    name="description"
                    rows={3}
                    placeholder="Destaque materiais, benefícios, garantia e pronta entrega..."
                    value={productForm.description}
                    onChange={updateProductForm}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Foto do Produto</label>
                  <label className="image-picker">
                    <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                    <span>{file ? file.name : "Escolher foto do produto"}</span>
                  </label>
                </div>

                <div className="drawer-actions">
                  <button className="primary-button" disabled={saving}>
                    {saving ? "Salvando..." : editingProduct ? "Atualizar Produto" : "Publicar na Vitrine e Feed"}
                  </button>
                  <button type="button" className="ghost-button" onClick={closeProductForm}>
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export default Lojas;
