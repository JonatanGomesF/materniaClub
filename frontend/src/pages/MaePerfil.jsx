import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import ProdutoCard from "../components/ProdutoCard";
import PostCard from "../components/PostCard";
import { getCurrentSession, supabase } from "../lib/supabaseClient";

function MaePerfil() {
  const { id } = useParams();
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({ posts: 0, activeProducts: 0, soldProducts: 0 });
  const [products, setProducts] = useState([]);
  const [posts, setPosts] = useState([]);
  const [friendship, setFriendship] = useState(null);
  const [loadedAt] = useState(() => Date.now());

  useEffect(() => {
    async function loadProfile() {
      const { session: currentSession } = await getCurrentSession();
      setSession(currentSession);

      if (!supabase || !id) return;

      const [
        { data: profileData },
        { count: postsCount },
        { count: activeProductsCount },
        { count: soldProductsCount },
        { data: productRows },
        { data: postRows },
      ] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", id).maybeSingle(),
        supabase.from("posts").select("*", { count: "exact", head: true }).eq("author_id", id).eq("status", "published"),
        supabase.from("products").select("*", { count: "exact", head: true }).eq("seller_id", id).eq("status", "active"),
        supabase.from("products").select("*", { count: "exact", head: true }).eq("seller_id", id).eq("status", "sold"),
        supabase
          .from("products")
          .select("*, profiles(full_name)")
          .eq("seller_id", id)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(6),
        supabase
          .from("posts")
          .select("*, profiles(full_name, city, status)")
          .eq("author_id", id)
          .eq("status", "published")
          .order("created_at", { ascending: false })
          .limit(4),
      ]);

      setProfile(profileData);
      setStats({
        posts: postsCount || 0,
        activeProducts: activeProductsCount || 0,
        soldProducts: soldProductsCount || 0,
      });
      setProducts(productRows || []);
      setPosts(postRows || []);

      if (currentSession?.user && currentSession.user.id !== id) {
        const { data: friendshipData } = await supabase
          .from("friendships")
          .select("*")
          .or(`and(requester_id.eq.${currentSession.user.id},addressee_id.eq.${id}),and(requester_id.eq.${id},addressee_id.eq.${currentSession.user.id})`)
          .maybeSingle();
        setFriendship(friendshipData);
      }
    }

    loadProfile();
  }, [id]);

  function getTimeOnPlatform() {
    if (!profile?.created_at) return "Recem-chegada";

    const createdAt = new Date(profile.created_at);
    const diffDays = Math.max(1, Math.floor((loadedAt - createdAt.getTime()) / 86400000));

    if (diffDays < 30) return `${diffDays} dias`;

    const months = Math.floor(diffDays / 30);
    if (months < 12) return `${months} ${months === 1 ? "mes" : "meses"}`;

    const years = Math.floor(months / 12);
    return `${years} ${years === 1 ? "ano" : "anos"}`;
  }

  async function sendFriendRequest() {
    if (!supabase || !session?.user) return alert("Faca login para enviar uma solicitacao de amizade.");
    const { data, error } = await supabase.from("friendships").insert({ requester_id: session.user.id, addressee_id: id }).select().single();
    if (error) {
      if (error.code === "PGRST205" || error.message?.includes("friendships")) {
        return alert("O recurso de amizades ainda precisa ser ativado no banco de dados. Execute o arquivo friendships-update.sql no SQL Editor do Supabase.");
      }
      return alert(error.code === "23505" ? "Ja existe uma solicitacao entre voces." : error.message);
    }
    setFriendship(data);
  }

  async function acceptFriendRequest() {
    const { data, error } = await supabase.from("friendships").update({ status: "accepted", updated_at: new Date().toISOString() }).eq("id", friendship.id).select().single();
    if (error) return alert(error.message);
    setFriendship(data);
  }

  async function removeFriendship() {
    if (!window.confirm(friendship?.status === "accepted" ? "Desfazer esta amizade?" : "Cancelar esta solicitacao?")) return;
    const { error } = await supabase.from("friendships").delete().eq("id", friendship.id);
    if (error) return alert(error.message);
    setFriendship(null);
  }

  function renderFriendshipAction() {
    if (!session?.user || session.user.id === id) return null;
    if (!friendship) return <button className="primary-button" onClick={sendFriendRequest}>Adicionar amiga</button>;
    if (friendship.status === "accepted") return <button className="soft-button" onClick={removeFriendship}>Amigas ✓</button>;
    if (friendship.addressee_id === session.user.id) {
      return <div className="friend-actions"><button className="primary-button" onClick={acceptFriendRequest}>Aceitar amizade</button><button className="soft-button" onClick={removeFriendship}>Recusar</button></div>;
    }
    return <button className="soft-button" onClick={removeFriendship}>Solicitacao enviada</button>;
  }

  if (!profile) {
    return (
      <div className="page-shell">
        <section className="notice">Perfil nao encontrado ou ainda carregando.</section>
      </div>
    );
  }

  return (
    <div className="page-shell public-profile">
      <section className="profile-hero-card">
        <div className="profile-avatar-large">{profile.full_name?.charAt(0) || "M"}</div>
        <div>
          <span className="eyebrow">Perfil da mae</span>
          <h1>{profile.full_name}</h1>
          <p>{profile.bio || "Mae da comunidade materniaClub compartilhando ofertas, desapegos e experiencias."}</p>
          {renderFriendshipAction()}
        </div>
      </section>

      <section className="profile-stats-grid">
        <div>
          <span>Cidade</span>
          <strong>{profile.city || "Nao informada"}</strong>
        </div>
        <div>
          <span>Na plataforma ha</span>
          <strong>{getTimeOnPlatform()}</strong>
        </div>
        <div>
          <span>Vendas feitas</span>
          <strong>{stats.soldProducts}</strong>
        </div>
        <div>
          <span>Anuncios ativos</span>
          <strong>{stats.activeProducts}</strong>
        </div>
        <div>
          <span>Publicacoes</span>
          <strong>{stats.posts}</strong>
        </div>
      </section>

      <section className="profile-section">
        <h2>Anuncios dessa mae</h2>
        {products.length === 0 ? (
          <p className="empty-state">Nenhum anuncio ativo no momento.</p>
        ) : (
          <div className="product-grid compact-profile-grid">
            {products.map((product) => (
              <ProdutoCard
                currentUserId={session?.user?.id}
                key={product.id}
                produto={product}
              />
            ))}
          </div>
        )}
      </section>

      <section className="profile-section">
        <h2>Publicacoes recentes</h2>
        {posts.length === 0 ? (
          <p className="empty-state">Nenhuma publicacao recente.</p>
        ) : (
          <div className="profile-post-list">
            {posts.map((post) => <PostCard currentUserId={session?.user?.id} key={post.id} post={post} />)}
          </div>
        )}
      </section>
    </div>
  );
}

export default MaePerfil;
