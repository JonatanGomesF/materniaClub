import { useCallback, useEffect, useState } from "react";
import ProdutoCard from "../components/ProdutoCard";
import { demoProducts } from "../data/demoData";
import { ensureUserProfile, getCurrentSession, isSupabaseConfigured, supabase, uploadMedia } from "../lib/supabaseClient";

function Marketplace() {
  const [products, setProducts] = useState(demoProducts);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
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

  async function fetchProducts() {
    if (!supabase) return;

    const { data, error } = await supabase
      .from("products")
      .select("*, profiles(full_name)")
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (!error) setProducts(data);
  }

  useEffect(() => {
    getCurrentSession().then(({ session: currentSession, profile: currentProfile }) => {
      setSession(currentSession);
      setProfile(currentProfile);
    });
    fetchProducts();
    if (!userLocation) {
      requestLocation().catch(() => {});
    }
  }, [requestLocation, userLocation]);

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
      fetchProducts();
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
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
      <section className="section-heading">
        <span className="eyebrow">Marketplace materno</span>
        <h1>Compre, venda e encontre ofertas para o bebe.</h1>
      </section>

      <form className="listing-form" onSubmit={createProduct}>
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

      <section className="product-grid">
        {products.map((product) => (
          <ProdutoCard
            key={product.id}
            produto={product}
            currentUserId={session?.user?.id}
            userLocation={userLocation}
            onDelete={deleteProduct}
            onReport={reportProduct}
          />
        ))}
      </section>
    </div>
  );
}

export default Marketplace;
