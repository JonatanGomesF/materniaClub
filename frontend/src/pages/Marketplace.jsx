import { useCallback, useEffect, useState } from "react";
import ProdutoCard from "../components/ProdutoCard";
import { demoProducts } from "../data/demoData";
import { ensureUserProfile, getCurrentSession, isSupabaseConfigured, supabase, uploadMedia } from "../lib/supabaseClient";

const marketplaceHighlights = [
  ...demoProducts,
  {
    id: "highlight-fraldas",
    title: "Promocoes de fraldas",
    condition: "ofertas",
    category: "fraldas",
    city: "perto de voce",
    image_url: "https://images.unsplash.com/photo-1546015720-b8b30df5aa27?auto=format&fit=crop&w=900&q=80",
    profiles: { full_name: "materniaClub" },
  },
  {
    id: "highlight-roupinhas",
    title: "Roupinhas e enxoval",
    condition: "achadinhos",
    category: "roupinhas",
    city: "para o bebe",
    image_url: "https://images.unsplash.com/photo-1519689680058-324335c77eba?auto=format&fit=crop&w=900&q=80",
    profiles: { full_name: "materniaClub" },
  },
  {
    id: "highlight-quarto",
    title: "Itens para o quartinho",
    condition: "decoracao",
    category: "quarto",
    city: "mamaes",
    image_url: "https://images.unsplash.com/photo-1492725764893-90b379c2b6e7?auto=format&fit=crop&w=900&q=80",
    profiles: { full_name: "materniaClub" },
  },
];

const marketplaceTips = [
  "Fraldas, chupetas e mamadeiras com preco bom",
  "Carrinhos e bebe conforto seminovos",
  "Produtos perto da sua localizacao",
  "Chat direto com a mae ou loja anunciante",
];

function Marketplace() {
  const [products, setProducts] = useState(isSupabaseConfigured ? [] : demoProducts);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [fetchingProducts, setFetchingProducts] = useState(isSupabaseConfigured);
  const [showForm, setShowForm] = useState(false);
  const [userLocation, setUserLocation] = useState(() => {
    const saved = localStorage.getItem("materniaClubLocation");
    return saved ? JSON.parse(saved) : null;
  });
  const [form, setForm] = useState({
    title: "",
    price: "",
    city: "",
    category: "fraldas",
    condition: "novo",
    description: "",
  });
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const requestLocation = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Seu navegador nao suporta localizacao."));
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
          resolve(location);
        },
        () => reject(new Error("Permita a localizacao para mostrar distancia dos anuncios.")),
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 300000 },
      );
    });
  }, []);

  const fetchProducts = useCallback(async () => {
    if (!supabase) return;
    setFetchingProducts(true);

    const { data, error } = await supabase
      .from("products")
      .select("*, profiles(full_name)")
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (error) {
      setFetchingProducts(false);
      return;
    }

    const ids = data.map((product) => product.id);
    if (ids.length === 0) {
      setProducts([]);
      setFetchingProducts(false);
      return;
    }

    const { data: likes } = await supabase
      .from("product_likes")
      .select("product_id,user_id")
      .in("product_id", ids);

    const enriched = data.map((product) => {
      const productLikes = likes?.filter((like) => like.product_id === product.id) || [];
      return {
        ...product,
        likes_count: productLikes.length,
        liked_by_me: productLikes.some((like) => like.user_id === session?.user?.id),
      };
    });

    setProducts(enriched);
    setFetchingProducts(false);
  }, [session?.user?.id]);

  useEffect(() => {
    getCurrentSession().then(({ session: currentSession, profile: currentProfile }) => {
      setSession(currentSession);
      setProfile(currentProfile);
    });
    fetchProducts();
    if (!userLocation) {
      requestLocation().catch(() => {});
    }
  }, [fetchProducts, requestLocation, userLocation]);

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function createProduct(event) {
    event.preventDefault();
    if (!form.title || !form.price) return;
    if (!supabase || !session?.user) {
      alert("Conecte seu Supabase e faca login para publicar anuncios.");
      return;
    }

    setLoading(true);
    try {
      const syncedProfile = profile || await ensureUserProfile(session.user);
      if (syncedProfile) setProfile(syncedProfile);
      const location = userLocation || await requestLocation();

      const imageUrl = file ? await uploadMedia(file, "products") : null;
      const { error } = await supabase.from("products").insert({
        seller_id: session.user.id,
        ...form,
        price: Number(form.price),
        image_url: imageUrl,
        latitude: location.latitude,
        longitude: location.longitude,
      });

      if (error) throw error;
      setForm({ title: "", price: "", city: "", category: "fraldas", condition: "novo", description: "" });
      setFile(null);
      setShowForm(false);
      fetchProducts();
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function toggleLike(product) {
    if (!supabase || !session?.user) {
      alert("Faca login para curtir anuncios.");
      return;
    }

    if (product.liked_by_me) {
      const { error } = await supabase
        .from("product_likes")
        .delete()
        .eq("product_id", product.id)
        .eq("user_id", session.user.id);
      if (error) return alert(error.message);
    } else {
      const { error } = await supabase.from("product_likes").insert({
        product_id: product.id,
        user_id: session.user.id,
      });
      if (error) return alert(error.message);
    }

    setProducts((current) => current.map((item) => {
      if (item.id !== product.id) return item;
      const liked = !item.liked_by_me;
      return {
        ...item,
        liked_by_me: liked,
        likes_count: Math.max(0, (item.likes_count || 0) + (liked ? 1 : -1)),
      };
    }));
  }

  async function startConversation(product) {
    if (!supabase || !session?.user) {
      alert("Faca login para conversar com a anunciante.");
      return;
    }

    if (product.seller_id === session.user.id) return;

    const syncedProfile = profile || await ensureUserProfile(session.user);
    if (syncedProfile) setProfile(syncedProfile);

    const { data: existingConversation, error: existingError } = await supabase
      .from("conversations")
      .select("*")
      .eq("product_id", product.id)
      .eq("buyer_id", session.user.id)
      .eq("seller_id", product.seller_id)
      .maybeSingle();

    if (existingError) {
      alert(existingError.message);
      return;
    }

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

      if (error) {
        alert(error.message);
        return;
      }

      conversation = createdConversation;
    }

    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      sender_id: session.user.id,
      body: `Tenho interesse em: ${product.title}`,
    });

    window.location.href = `/chat?conversation=${conversation.id}`;
  }

  async function deleteProduct(product) {
    if (!supabase || !session?.user || product.seller_id !== session.user.id) return;

    const confirmed = window.confirm("Excluir esta publicacao do marketplace?");
    if (!confirmed) return;

    const { error } = await supabase
      .from("products")
      .delete()
      .eq("id", product.id)
      .eq("seller_id", session.user.id);

    if (error) {
      alert(error.message);
      return;
    }

    setProducts((current) => current.filter((item) => item.id !== product.id));
  }

  async function reportProduct(product) {
    if (!supabase || !session?.user) {
      alert("Faca login para denunciar anuncios.");
      return;
    }

    await supabase.from("reports").insert({
      reporter_id: session.user.id,
      target_type: "product",
      target_id: product.id,
      reason: "Anuncio suspeito ou fora da comunidade",
    });
    alert("Denuncia enviada para analise.");
  }

  return (
    <div className="page-shell marketplace-layout">
      <section className="section-heading marketplace-heading">
        <div>
          <span className="eyebrow">Marketplace materno</span>
          <h1>Compre, venda e encontre ofertas para o bebe.</h1>
          <p>Um espaco para fraldas, chupetas, mamadeiras, carrinhos, bebe conforto, roupinhas e achadinhos que ajudam a rotina das maes.</p>
        </div>
        <button className="primary-button announce-button" onClick={() => setShowForm((current) => !current)}>
          {showForm ? "Fechar anuncio" : "Anunciar"}
        </button>
      </section>

      <section className="marketplace-feature-panel">
        <div className="marketplace-feature-copy">
          <span className="eyebrow">Universo do bebe</span>
          <h2>Fotos, categorias e ideias para encontrar o que sua familia precisa.</h2>
          <div className="marketplace-tip-grid">
            {marketplaceTips.map((tip) => <span key={tip}>{tip}</span>)}
          </div>
        </div>
        <div className="marketplace-highlight-grid">
          {marketplaceHighlights.slice(0, 6).map((item) => (
            <article className="marketplace-highlight-card" key={item.id}>
              <img src={item.image_url} alt={item.title} />
              <span>{item.category}</span>
              <strong>{item.title}</strong>
            </article>
          ))}
        </div>
      </section>

      {showForm && (
        <form className="listing-form listing-drawer" onSubmit={createProduct}>
          <h2>Novo anuncio</h2>
          <input name="title" placeholder="Ex: pacote de fraldas M" value={form.title} onChange={updateField} />
          <div className="form-grid">
            <input name="price" type="number" min="0" step="0.01" placeholder="Preco" value={form.price} onChange={updateField} />
            <input name="city" placeholder="Cidade" value={form.city} onChange={updateField} />
          </div>
          <div className="form-grid">
            <select name="category" value={form.category} onChange={updateField}>
              <option value="fraldas">Fraldas</option>
              <option value="chupetas">Chupetas</option>
              <option value="mamadeiras">Mamadeiras</option>
              <option value="carrinho">Carrinho</option>
              <option value="bebe conforto">Bebe conforto</option>
              <option value="roupinhas">Roupinhas</option>
            </select>
            <select name="condition" value={form.condition} onChange={updateField}>
              <option value="novo">Novo</option>
              <option value="seminovo">Seminovo</option>
              <option value="usado">Usado</option>
            </select>
          </div>
          <textarea name="description" placeholder="Detalhes do produto, retirada ou link da promocao" value={form.description} onChange={updateField} />
          <input type="file" accept="image/*" onChange={(event) => setFile(event.target.files?.[0] || null)} />
          <button className="soft-button" type="button" onClick={() => requestLocation().catch((error) => alert(error.message))}>
            {userLocation ? "Localizacao salva" : "Usar minha localizacao"}
          </button>
          <p className="hint">A localizacao permite mostrar anuncios como "a 4 km de voce". Ela sera salva apenas no anuncio.</p>
          <button className="primary-button" disabled={loading}>{loading ? "Publicando..." : "Publicar anuncio"}</button>
          {!isSupabaseConfigured && <p className="hint">Modo demo: os anuncios reais precisam das chaves do Supabase.</p>}
        </form>
      )}

      <section className="marketplace-results">
        <div className="store-panel-title">
          <div>
            <span>Anuncios reais</span>
            <h2>Produtos publicados pelas maes</h2>
          </div>
          <strong>{products.length} anuncios ativos</strong>
        </div>

        {fetchingProducts ? (
          <p className="empty-state">Carregando anuncios do marketplace...</p>
        ) : products.length === 0 ? (
          <p className="empty-state">Ainda nao existem anuncios ativos. Clique em Anunciar para publicar o primeiro produto.</p>
        ) : (
          <div className="product-grid">
            {products.map((product) => (
              <ProdutoCard
                key={product.id}
                produto={product}
                currentUserId={session?.user?.id}
                userLocation={userLocation}
                onDelete={deleteProduct}
                onInterest={startConversation}
                onLike={toggleLike}
                onReport={reportProduct}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default Marketplace;
