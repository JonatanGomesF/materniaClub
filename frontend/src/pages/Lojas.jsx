import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import ProdutoCard from "../components/ProdutoCard";
import { ensureUserProfile, getCurrentSession, supabase, uploadMedia } from "../lib/supabaseClient";

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
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [stores, setStores] = useState([]);
  const [store, setStore] = useState(null);
  const [storeProducts, setStoreProducts] = useState([]);
  const [myProducts, setMyProducts] = useState([]);
  const [selectedStore, setSelectedStore] = useState(null);
  const [activeView, setActiveView] = useState("showcase");
  const [storeForm, setStoreForm] = useState(emptyStore);
  const [storeAccess, setStoreAccess] = useState(emptyStoreAccess);
  const [productForm, setProductForm] = useState(emptyProduct);
  const [editingProduct, setEditingProduct] = useState(null);
  const [file, setFile] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [coverFile, setCoverFile] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadStores = useCallback(async (currentSession, currentProfile) => {
    if (!supabase) return;

    const { data: storeRows } = await supabase
      .from("stores")
      .select("*")
      .eq("status", "active")
      .order("created_at", { ascending: false });

    setStores(storeRows || []);

    const { data: productRows } = await supabase
      .from("store_products")
      .select("*, stores(name, city, owner_id)")
      .eq("status", "active")
      .order("created_at", { ascending: false });

    setStoreProducts(productRows || []);

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
        cnpj: myStore.cnpj || "",
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
  }, []);

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
    setStoreForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  function updateStoreAccess(event) {
    setStoreAccess((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  function updateProductForm(event) {
    setProductForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function saveStore(event) {
    event.preventDefault();
    if (!supabase || !session?.user) return alert("Entre no app para cadastrar sua loja.");
    if (profile?.account_type !== "store") return alert("Esta area e exclusiva para contas de loja.");
    if (!storeForm.name.trim() || !storeForm.cnpj.trim()) return alert("Informe nome da loja e CNPJ.");

    setSaving(true);
    try {
      await ensureUserProfile(session.user, { account_type: "store", full_name: storeForm.name.trim(), city: storeForm.city.trim() });
      const logoUrl = logoFile ? await uploadMedia(logoFile, "store-logos") : storeForm.logo_url || null;
      const coverUrl = coverFile ? await uploadMedia(coverFile, "store-covers") : storeForm.cover_url || null;

      const payload = {
        owner_id: session.user.id,
        name: storeForm.name.trim(),
        cnpj: storeForm.cnpj.trim(),
        city: storeForm.city.trim(),
        description: storeForm.description.trim(),
        logo_url: logoUrl,
      };

      if (coverUrl) payload.cover_url = coverUrl;

      const { error } = store
        ? await supabase.from("stores").update(payload).eq("id", store.id)
        : await supabase.from("stores").insert(payload);

      if (error) throw error;
      setLogoFile(null);
      setCoverFile(null);
      await loadStores(session, { ...profile, account_type: "store" });
      setActiveView("manage");
    } catch (error) {
      alert(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function registerStoreAccount(event) {
    event.preventDefault();
    if (!supabase) return alert("Conecte o Supabase para cadastrar lojas.");
    if (!storeAccess.email || !storeAccess.password || !storeAccess.name || !storeAccess.cnpj) {
      return alert("Informe email, senha, nome da loja e CNPJ.");
    }

    setSaving(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: storeAccess.email,
        password: storeAccess.password,
        options: { data: { full_name: storeAccess.name, account_type: "store" } },
      });

      if (error) throw error;

      if (!data.session?.user) {
        alert("Conta da loja criada. Confirme o email e depois entre novamente em Minha loja.");
        return;
      }

      const storeProfile = await ensureUserProfile(data.session.user, {
        full_name: storeAccess.name,
        city: storeAccess.city,
        account_type: "store",
      });

      const { error: storeError } = await supabase.from("stores").insert({
        owner_id: data.session.user.id,
        name: storeAccess.name.trim(),
        cnpj: storeAccess.cnpj.trim(),
        city: storeAccess.city.trim(),
        description: storeAccess.description.trim(),
      });

      if (storeError) throw storeError;
      setSession(data.session);
      setProfile(storeProfile);
      setStoreAccess(emptyStoreAccess);
      await loadStores(data.session, storeProfile);
    } catch (error) {
      alert(error.message);
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
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveProduct(event) {
    event.preventDefault();
    if (!supabase || !session?.user || !store) return alert("Cadastre sua loja antes de publicar produtos.");
    if (store.status !== "active") return alert("Sua loja ainda esta em analise e nao pode publicar produtos.");
    if (!productForm.title.trim() || !productForm.price) return alert("Informe nome e preco do produto.");

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
        status: "active",
      };

      const { error } = editingProduct
        ? await supabase.from("store_products").update(payload).eq("id", editingProduct.id)
        : await supabase.from("store_products").insert(payload);

      if (error) throw error;

      setProductForm(emptyProduct);
      setEditingProduct(null);
      setFile(null);
      await loadStores(session, profile);
    } catch (error) {
      alert(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function updateProductStatus(product, status) {
    const { error } = await supabase.from("store_products").update({ status }).eq("id", product.id);
    if (error) return alert(error.message);
    loadStores(session, profile);
  }

  async function deleteProduct(product) {
    const confirmed = window.confirm("Excluir definitivamente este produto da loja?");
    if (!confirmed) return;

    const { error } = await supabase.from("store_products").delete().eq("id", product.id);
    if (error) return alert(error.message);
    loadStores(session, profile);
  }

  async function startStoreConversation(product) {
    if (!supabase || !session?.user) {
      alert("Faca login para comprar produtos das lojas.");
      return;
    }

    if (product.seller_id === session.user.id) {
      alert("Voce esta administrando esta loja.");
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

      if (!conversation && existingStoreError) {
        const { data: existingConversation } = await supabase
          .from("conversations")
          .select("*")
          .is("product_id", null)
          .eq("buyer_id", session.user.id)
          .eq("seller_id", product.seller_id)
          .maybeSingle();

        conversation = existingConversation;

        if (!conversation) {
          const { data: createdConversation, error: createError } = await supabase
            .from("conversations")
            .insert(baseConversation)
            .select()
            .maybeSingle();

          if (createError) throw createError;
          conversation = createdConversation;
        }
      }

      await supabase.from("messages").insert({
        conversation_id: conversation.id,
        sender_id: session.user.id,
        body: `Quero comprar na loja: ${product.title}`,
      });

      window.location.href = `/chat?conversation=${conversation.id}`;
    } catch (error) {
      alert(error.message);
    }
  }

  const selectedStoreProducts = selectedStore
    ? storeProducts.filter((product) => product.store_id === selectedStore.id)
    : [];

  const publicProducts = selectedStoreProducts.map((product) => ({
    ...product,
    condition: "novo",
    seller_id: product.stores?.owner_id,
    profiles: { full_name: product.stores?.name || "Loja parceira" },
    city: product.city || product.stores?.city,
  }));

  function getStoreProductCount(storeItem) {
    return storeProducts.filter((product) => product.store_id === storeItem.id).length;
  }

  const activeProductsCount = storeProducts.length;
  const activeStoresCount = stores.length;
  const visibleProductsCount = selectedStore ? selectedStoreProducts.length : activeProductsCount;
  const storeMetrics = [
    { label: "Lojas ativas", value: activeStoresCount },
    { label: "Produtos na vitrine", value: activeProductsCount },
    { label: "Vitrine aberta", value: selectedStore ? selectedStore.name : "Todas" },
  ];

  function openShowcase() {
    setActiveView("showcase");
    setSelectedStore(null);
  }

  return (
    <div className="stores-dashboard">
      <aside className="stores-sidebar">
        <Link className="brand stores-brand" to="/">
          <span className="brand-mark">
            <img src="/maternia-logo.png" alt="Logo materniaClub" />
          </span>
          <span>materniaClub</span>
        </Link>
        <nav className="stores-side-nav" aria-label="Navegacao de lojas">
          <button className={activeView === "showcase" ? "active" : ""} onClick={openShowcase}>Vitrine</button>
          {profile?.account_type === "store" && (
            <button className={activeView === "manage" ? "active" : ""} onClick={() => setActiveView("manage")}>Minha loja</button>
          )}
          <Link to="/marketplace">Marketplace</Link>
          <Link to="/chat">Chat</Link>
        </nav>
        <div className="stores-side-note">
          <strong>Ofertas infantis</strong>
          <span>Produtos, promocoes e lojas parceiras em um painel simples para maes.</span>
        </div>
      </aside>

      <div className="page-shell stores-page">
        <section className="stores-hero-dark">
          <div>
            <span className="eyebrow">Lojas parceiras</span>
            <h1>Ofertas infantis em uma vitrine feita para maes.</h1>
            <p>Lojas divulgam produtos, promocoes e artigos infantis enquanto maes continuam usando feed, marketplace e chat normalmente.</p>
          </div>
          <div className="store-view-switch">
            <button className={activeView === "showcase" ? "primary-button" : "soft-button"} onClick={openShowcase}>Ver vitrine</button>
            {profile?.account_type === "store" && (
              <button className={activeView === "manage" ? "primary-button" : "soft-button"} onClick={() => setActiveView("manage")}>Minha loja</button>
            )}
          </div>
        </section>

        <section className="store-metric-grid">
          {storeMetrics.map((metric) => (
            <div className="store-metric-card" key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </div>
          ))}
        </section>

        {activeView === "manage" ? (
          <section className="store-admin-panel">
          {!session ? (
            <div className="store-empty-admin">
              <h2>Acesso exclusivo para lojas</h2>
              <p>Maes usam Feed, Marketplace e Vitrine. Lojas usam esta area para cadastrar a vitrine e anunciar produtos infantis.</p>
              <form className="store-access-form" onSubmit={registerStoreAccount}>
                <input name="name" placeholder="Nome da loja" value={storeAccess.name} onChange={updateStoreAccess} />
                <input name="cnpj" placeholder="CNPJ" value={storeAccess.cnpj} onChange={updateStoreAccess} />
                <input name="city" placeholder="Cidade da loja" value={storeAccess.city} onChange={updateStoreAccess} />
                <input name="email" type="email" placeholder="Email da loja" value={storeAccess.email} onChange={updateStoreAccess} />
                <input name="password" type="password" placeholder="Senha" value={storeAccess.password} onChange={updateStoreAccess} />
                <textarea name="description" placeholder="Descricao curta da loja" value={storeAccess.description} onChange={updateStoreAccess} />
                <button className="primary-button" disabled={saving}>{saving ? "Criando..." : "Cadastrar loja"}</button>
              </form>
              <Link className="ghost-button" to="/login">Ja tenho acesso de loja</Link>
            </div>
          ) : profile?.account_type !== "store" ? (
            <div className="store-empty-admin">
              <h2>Esta conta e de mae</h2>
              <p>Para manter a plataforma organizada, maes compram, conversam e encontram ofertas. Apenas contas de loja podem administrar vitrines e produtos.</p>
              <p className="hint">Saia desta conta e entre com o email da loja para acessar o painel de produtos.</p>
            </div>
          ) : (
            <>
              {store?.status === "pending" && <p className="notice">Cadastro recebido. Sua loja esta em analise e sera liberada apos a aprovacao.</p>}
              {store?.status === "rejected" && <p className="notice">O cadastro desta loja nao foi aprovado. Entre em contato com a administracao para revisar os dados.</p>}
              <form className="listing-form" onSubmit={saveStore}>
                <h2>{store ? "Dados da loja" : "Cadastrar minha loja"}</h2>
                <div className="store-media-editor">
                  <div className="store-logo-preview">{storeForm.logo_url ? <img src={storeForm.logo_url} alt="" /> : <span>{storeForm.name?.charAt(0) || "L"}</span>}</div>
                  <label className="image-picker">
                    <input type="file" accept="image/*" onChange={(event) => setLogoFile(event.target.files?.[0] || null)} />
                    <span>{logoFile ? logoFile.name : "Alterar logo da loja"}</span>
                  </label>
                  <div className="store-cover-preview">{storeForm.cover_url ? <img src={storeForm.cover_url} alt="" /> : <span>Foto de capa</span>}</div>
                  <label className="image-picker">
                    <input type="file" accept="image/*" onChange={(event) => setCoverFile(event.target.files?.[0] || null)} />
                    <span>{coverFile ? coverFile.name : "Alterar foto da vitrine"}</span>
                  </label>
                </div>
                <input name="name" placeholder="Nome da loja" value={storeForm.name} onChange={updateStoreForm} />
                <input name="cnpj" placeholder="CNPJ" value={storeForm.cnpj} onChange={updateStoreForm} />
                <input name="city" placeholder="Cidade da loja" value={storeForm.city} onChange={updateStoreForm} />
                <textarea name="description" placeholder="Descricao curta da loja" value={storeForm.description} onChange={updateStoreForm} />
                <button className="primary-button" disabled={saving}>{saving ? "Salvando..." : store ? "Salvar loja" : "Criar loja"}</button>
              </form>

              {store?.status === "active" ? (
                <>
                  <form className="listing-form" onSubmit={saveProduct}>
                    <h2>{editingProduct ? "Editar produto" : "Cadastrar produto na vitrine"}</h2>
                    <input name="title" placeholder="Nome do produto" value={productForm.title} onChange={updateProductForm} />
                    <div className="form-grid">
                      <input name="price" type="number" min="0" step="0.01" placeholder="Preco" value={productForm.price} onChange={updateProductForm} />
                      <input name="city" placeholder="Cidade" value={productForm.city} onChange={updateProductForm} />
                    </div>
                    <select name="category" value={productForm.category} onChange={updateProductForm}>
                      <option value="fraldas">Fraldas</option>
                      <option value="chupetas">Chupetas</option>
                      <option value="mamadeiras">Mamadeiras</option>
                      <option value="carrinho">Carrinho</option>
                      <option value="bebe conforto">Bebe conforto</option>
                      <option value="roupinhas">Roupinhas</option>
                      <option value="promocao">Promocao</option>
                    </select>
                    <textarea name="description" placeholder="Descricao, promocao ou detalhes" value={productForm.description} onChange={updateProductForm} />
                    <input type="file" accept="image/*" onChange={(event) => setFile(event.target.files?.[0] || null)} />
                    <button className="primary-button" disabled={saving}>{saving ? "Salvando..." : editingProduct ? "Salvar produto" : "Publicar produto"}</button>
                    {editingProduct && <button className="ghost-button" type="button" onClick={() => {
                      setEditingProduct(null);
                      setProductForm(emptyProduct);
                      setFile(null);
                    }}>Cancelar edicao</button>}
                  </form>

                  <div className="store-admin-list">
                    <h2>Produtos da minha loja</h2>
                    {myProducts.length === 0 ? (
                      <p className="empty-state">Nenhum produto cadastrado ainda. Use o formulario acima para criar o primeiro.</p>
                ) : myProducts.map((product) => (
                  <div className="store-admin-row" key={product.id}>
                    <div className="store-admin-product">
                      <div className="store-admin-thumb">
                        {product.image_url ? (
                          <img src={product.image_url} alt={product.title} />
                        ) : (
                          <span>Sem foto</span>
                        )}
                      </div>
                      <div>
                        <strong>{product.title}</strong>
                        <small>{product.category} - {product.city || store.city || "Cidade nao informada"}</small>
                      </div>
                    </div>
                    <span>{Number(product.price).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
                    <span className="tag">{product.status}</span>
                    <button className="soft-button small" onClick={() => startEdit(product)}>Editar</button>
                        <button className="ghost-button small" onClick={() => updateProductStatus(product, "hidden")}>Remover da vitrine</button>
                        <button className="danger-button small" onClick={() => deleteProduct(product)}>Excluir</button>
                      </div>
                    ))}
                  </div>
                </>
              ) : store ? (
                <p className="notice">Os produtos serao liberados quando a loja for aprovada.</p>
              ) : (
                <p className="notice">Depois de criar a loja, o cadastro de produtos aparece aqui automaticamente.</p>
              )}
            </>
          )}
          </section>
        ) : (
          <section className="store-showcase">
          {!selectedStore ? (
            <>
              <div className="store-panel-title">
                <div>
                  <span>Vitrine das lojas</span>
                  <h2>Escolha uma loja para ver os itens</h2>
                </div>
                <strong>{visibleProductsCount} produtos ativos</strong>
              </div>
              {stores.length === 0 ? (
                <p className="empty-state">As lojas parceiras aparecem aqui quando forem cadastradas.</p>
              ) : (
                <div className="store-front-grid">
                  {stores.map((storeItem) => {
                    const productCount = getStoreProductCount(storeItem);
                    return (
                      <button className="store-front-card" key={storeItem.id} onClick={() => setSelectedStore(storeItem)}>
                        {storeItem.cover_url && (
                          <div className="store-front-cover">
                            <img src={storeItem.cover_url} alt="" />
                          </div>
                        )}
                        <div className="store-front-logo">
                          {storeItem.logo_url ? <img src={storeItem.logo_url} alt={storeItem.name} /> : <span>{storeItem.name?.charAt(0) || "L"}</span>}
                        </div>
                        <div className="store-front-copy">
                          <span className="eyebrow">{productCount} produtos</span>
                          <h3>{storeItem.name}</h3>
                          <p>{storeItem.description || "Vitrine com ofertas, promocoes e artigos infantis para maes."}</p>
                          <div className="store-front-meta">
                            <span>{storeItem.city || "Cidade nao informada"}</span>
                            <strong>Ver produtos</strong>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="store-selected-header">
                <div>
                  <span className="eyebrow">Vitrine selecionada</span>
                  <h2>{selectedStore.name}</h2>
                  <p>{selectedStore.description || "Produtos, promocoes e artigos infantis desta loja."}</p>
                  <small>{selectedStore.city || "Cidade nao informada"}</small>
                </div>
                <button className="soft-button" onClick={() => setSelectedStore(null)}>Voltar para lojas</button>
              </div>

              {publicProducts.length === 0 ? (
                <p className="empty-state">Esta loja ainda nao tem produtos ativos na vitrine.</p>
              ) : (
                <div className="product-grid">
                  {publicProducts.map((product) => (
                    <ProdutoCard
                      key={product.id}
                      produto={product}
                      currentUserId={session?.user?.id}
                      interestLabel="Comprar"
                      onInterest={startStoreConversation}
                      profilePath={null}
                    />
                  ))}
                </div>
              )}
            </>
          )}
          </section>
        )}
      </div>
    </div>
  );
}

export default Lojas;
