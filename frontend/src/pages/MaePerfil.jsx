import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import PostCard from "../components/PostCard";
import ProdutoCard from "../components/ProdutoCard";
import ProfilePersonalDetails from "../components/ProfilePersonalDetails";
import { getCurrentSession, supabase } from "../lib/supabaseClient";
import { useToast } from "../lib/toastContext";

function MaePerfil() {
  const { id } = useParams();
  const { toast, showConfirm } = useToast();
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({ posts: 0, activeProducts: 0, soldProducts: 0 });
  const [products, setProducts] = useState([]);
  const [posts, setPosts] = useState([]);
  const [reviews, setReviews] = useState([]);
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
        { data: reviewRows },
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
          .select("*, profiles(full_name, city, status, avatar_url)")
          .eq("author_id", id)
          .eq("status", "published")
          .order("created_at", { ascending: false })
          .limit(4),
        supabase
          .from("mother_reviews")
          .select("*, reviewer:profiles!mother_reviews_reviewer_id_fkey(full_name, avatar_url)")
          .eq("reviewed_id", id)
          .eq("status", "published")
          .order("created_at", { ascending: false })
          .limit(8),
      ]);

      setProfile(profileData);
      setStats({
        posts: postsCount || 0,
        activeProducts: activeProductsCount || 0,
        soldProducts: soldProductsCount || 0,
      });
      setProducts(productRows || []);
      setPosts(postRows || []);
      setReviews(reviewRows || []);

      if (currentSession?.user && currentSession.user.id !== id) {
        const { data: friendshipData } = await supabase
          .from("friendships")
          .select("*")
          .or(
            `and(requester_id.eq.${currentSession.user.id},addressee_id.eq.${id}),and(requester_id.eq.${id},addressee_id.eq.${currentSession.user.id})`
          )
          .maybeSingle();
        setFriendship(friendshipData);
      }
    }

    loadProfile();
  }, [id]);

  function getTimeOnPlatform() {
    if (!profile?.created_at) return "Recém-chegada";

    const createdAt = new Date(profile.created_at);
    const diffDays = Math.max(1, Math.floor((loadedAt - createdAt.getTime()) / 86400000));

    if (diffDays < 30) return `${diffDays} dias`;

    const months = Math.floor(diffDays / 30);
    if (months < 12) return `${months} ${months === 1 ? "mês" : "meses"}`;

    const years = Math.floor(months / 12);
    return `${years} ${years === 1 ? "ano" : "anos"}`;
  }

  async function sendFriendRequest() {
    if (!supabase || !session?.user) {
      toast.info("Faça login para enviar solicitação de amizade.");
      return;
    }

    const { data, error } = await supabase
      .from("friendships")
      .insert({ requester_id: session.user.id, addressee_id: id })
      .select()
      .single();

    if (error) {
      toast.error(error.code === "23505" ? "Já existe uma solicitação entre vocês." : error.message);
      return;
    }

    toast.success("Solicitação de amizade enviada!");
    setFriendship(data);
  }

  async function acceptFriendRequest() {
    const { data, error } = await supabase
      .from("friendships")
      .update({ status: "accepted", updated_at: new Date().toISOString() })
      .eq("id", friendship.id)
      .select()
      .single();

    if (error) return toast.error(error.message);
    toast.success("Amizade confirmada no clube!");
    setFriendship(data);
  }

  async function removeFriendship() {
    const isAccepted = friendship?.status === "accepted";
    const confirmed = await showConfirm(
      isAccepted ? "Desfazer amizade" : "Cancelar solicitação",
      isAccepted ? "Deseja remover esta mãe da sua lista de amigas?" : "Deseja cancelar esta solicitação?",
      "Confirmar",
      "Voltar",
      true
    );

    if (!confirmed) return;

    const { error } = await supabase.from("friendships").delete().eq("id", friendship.id);
    if (error) return toast.error(error.message);
    toast.success(isAccepted ? "Amizade desfeita." : "Solicitação cancelada.");
    setFriendship(null);
  }

  function renderFriendshipAction() {
    if (!session?.user || session.user.id === id) return null;
    if (!friendship) return <button className="primary-button" onClick={sendFriendRequest}>+ Adicionar Amiga</button>;
    if (friendship.status === "accepted") return <button className="soft-button" onClick={removeFriendship}>✓ Amigas</button>;
    if (friendship.addressee_id === session.user.id) {
      return (
        <div className="friend-actions">
          <button className="primary-button small" onClick={acceptFriendRequest}>Aceitar Amizade</button>
          <button className="soft-button small" onClick={removeFriendship}>Recusar</button>
        </div>
      );
    }
    return <button className="soft-button" onClick={removeFriendship}>Solicitação enviada (cancelar)</button>;
  }

  function getAverageRating() {
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

  if (!profile) {
    return (
      <div className="page-shell">
        <section className="empty-state-card">
          <p>Carregando perfil da mãe...</p>
        </section>
      </div>
    );
  }

  return (
    <div className="page-shell public-profile">
      <section className="profile-hero-card">
        <div className="profile-avatar-large">
          {profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : profile.full_name?.charAt(0) || "M"}
        </div>
        <div>
          <span className="eyebrow">Perfil Materno</span>
          <h1>{profile.full_name}</h1>
          <p>{profile.bio || "Mãe da comunidade materniaClub compartilhando ofertas, desapegos e experiências."}</p>
          {renderFriendshipAction()}
        </div>
      </section>

      <section className="profile-stats-grid">
        <div className="metric-card">
          <span>Cidade</span>
          <strong>{profile.city || "Não informada"}</strong>
        </div>
        <div className="metric-card">
          <span>No clube há</span>
          <strong>{getTimeOnPlatform()}</strong>
        </div>
        <div className="metric-card">
          <span>Vendas Feitas</span>
          <strong>{stats.soldProducts}</strong>
        </div>
        <div className="metric-card">
          <span>Desapegos Ativos</span>
          <strong>{stats.activeProducts}</strong>
        </div>
        <div className="metric-card">
          <span>Publicações</span>
          <strong>{stats.posts}</strong>
        </div>
        <div className="metric-card">
          <span>Avaliação Média</span>
          <strong>{getAverageRating() ? `${getAverageRating()} / 5 ★` : "Sem avaliações"}</strong>
        </div>
      </section>

      <section className="profile-section profile-personal-public">
        <div className="section-title-row">
          <h2>Dados Pessoais</h2>
        </div>
        <ProfilePersonalDetails profile={profile} />
      </section>

      <section className="profile-section reviews-section">
        <div className="section-title-row">
          <h2>Avaliações de outras Mães</h2>
          {reviews.length > 0 && <span className="tag">{reviews.length} avaliações</span>}
        </div>
        {reviews.length === 0 ? (
          <p className="empty-state">Essa mãe ainda não recebeu avaliações de negociações.</p>
        ) : (
          <div className="review-list">
            {reviews.map((review) => (
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
                    <strong>{review.reviewer?.full_name || "Mãe da comunidade"}</strong>
                    <span className="review-stars">{renderStars(review.rating)}</span>
                  </div>
                </div>
                {review.comment && <p>{review.comment}</p>}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="profile-section">
        <h2>Desapegos Disponíveis</h2>
        {products.length === 0 ? (
          <p className="empty-state">Nenhum anúncio ativo no momento.</p>
        ) : (
          <div className="product-grid compact-profile-grid">
            {products.map((product) => (
              <ProdutoCard currentUserId={session?.user?.id} key={product.id} produto={product} />
            ))}
          </div>
        )}
      </section>

      <section className="profile-section">
        <h2>Publicações Recentes no Feed</h2>
        {posts.length === 0 ? (
          <p className="empty-state">Nenhuma publicação recente.</p>
        ) : (
          <div className="profile-post-list">
            {posts.map((post) => (
              <PostCard currentUserId={session?.user?.id} key={post.id} post={post} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default MaePerfil;
