import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getCurrentSession, supabase } from "../lib/supabaseClient";
import { useToast } from "../lib/toastContext";

const friendshipSelect =
  "*, requester:profiles!friendships_requester_id_fkey(id, full_name, city, bio, avatar_url), addressee:profiles!friendships_addressee_id_fkey(id, full_name, city, bio, avatar_url)";

function Amigos() {
  const { toast, showConfirm } = useToast();
  const [userId, setUserId] = useState(null);
  const [friendships, setFriendships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  async function loadFriendships(id) {
    if (!supabase || !id) return;
    const { data, error } = await supabase
      .from("friendships")
      .select(friendshipSelect)
      .or(`requester_id.eq.${id},addressee_id.eq.${id}`)
      .order("updated_at", { ascending: false });

    if (!error) setFriendships(data || []);
    setLoading(false);
  }

  useEffect(() => {
    getCurrentSession().then(({ session, profile }) => {
      if (profile?.account_type === "store") {
        window.location.href = "/lojas?view=manage";
        return;
      }
      const id = session?.user?.id || null;
      setUserId(id);
      if (id) loadFriendships(id);
      else setLoading(false);
    });
  }, []);

  async function accept(item) {
    const { error } = await supabase
      .from("friendships")
      .update({ status: "accepted", updated_at: new Date().toISOString() })
      .eq("id", item.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Solicitação de amizade aceita!");
    loadFriendships(userId);
  }

  async function remove(item) {
    const isAccepted = item.status === "accepted";
    const confirmed = await showConfirm(
      isAccepted ? "Desfazer amizade" : "Cancelar solicitação",
      isAccepted ? "Deseja remover esta pessoa das suas amigas?" : "Deseja cancelar esta solicitação pendente?",
      "Confirmar",
      "Voltar",
      true
    );

    if (!confirmed) return;

    const { error } = await supabase.from("friendships").delete().eq("id", item.id);
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(isAccepted ? "Amizade desfeita." : "Solicitação cancelada.");
    loadFriendships(userId);
  }

  async function searchMothers(event) {
    event.preventDefault();
    const name = search.trim();
    if (!supabase || !userId || !name) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }

    setSearching(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, city, bio, avatar_url, motherhood_stage")
      .ilike("full_name", `%${name}%`)
      .neq("id", userId)
      .eq("status", "active")
      .eq("account_type", "user")
      .order("full_name")
      .limit(20);

    if (error) toast.error(error.message);
    setSearchResults(data || []);
    setHasSearched(true);
    setSearching(false);
  }

  const accepted = friendships.filter((item) => item.status === "accepted");
  const received = friendships.filter((item) => item.status === "pending" && item.addressee_id === userId);
  const sent = friendships.filter((item) => item.status === "pending" && item.requester_id === userId);
  const otherMother = (item) => (item.requester_id === userId ? item.addressee : item.requester);

  function MotherCard({ item, actions }) {
    const mother = otherMother(item);
    return (
      <article className="friend-card">
        <Link className="friend-identity" to={`/maes/${mother?.id}`}>
          <span className="profile-avatar-small">
            {mother?.avatar_url ? <img src={mother.avatar_url} alt="" /> : mother?.full_name?.charAt(0) || "M"}
          </span>
          <span>
            <strong>{mother?.full_name}</strong>
            <small>{mother?.city || "Cidade não informada"}</small>
          </span>
        </Link>
        {actions}
      </article>
    );
  }

  if (!userId && !loading) {
    return (
      <div className="page-shell">
        <section className="empty-state-card">
          <h3>Faça login para gerenciar suas amizades no clube.</h3>
        </section>
      </div>
    );
  }

  return (
    <div className="page-shell friends-page">
      <section className="section-heading">
        <span className="eyebrow">Rede de Apoio</span>
        <h1>Minhas Amigas no materniaClub</h1>
        <p>Conecte-se com outras mães, troque conselhos e acompanhe desapegos da sua região.</p>
      </section>

      {/* SEARCH MOTHERS */}
      <section className="profile-section friend-search-section">
        <h2>Encontrar Novas Amigas</h2>
        <form className="friend-search-form" onSubmit={searchMothers}>
          <input
            aria-label="Nome da pessoa"
            placeholder="Digite o nome de uma mãe para buscar..."
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setHasSearched(false);
            }}
          />
          <button className="primary-button" disabled={searching || !search.trim()}>
            {searching ? "Procurando..." : "Buscar Mãe"}
          </button>
        </form>

        {searchResults.length > 0 && (
          <div className="friends-grid search-results">
            {searchResults.map((mother) => (
              <article className="friend-card" key={mother.id}>
                <Link className="friend-identity" to={`/maes/${mother.id}`}>
                  <span className="profile-avatar-small">
                    {mother.avatar_url ? <img src={mother.avatar_url} alt="" /> : mother.full_name?.charAt(0) || "M"}
                  </span>
                  <span>
                    <strong>{mother.full_name}</strong>
                    <small>{mother.city || "Cidade não informada"}</small>
                  </span>
                </Link>
                <Link className="soft-button" to={`/maes/${mother.id}`}>
                  Ver Perfil
                </Link>
              </article>
            ))}
          </div>
        )}

        {!searching && hasSearched && searchResults.length === 0 && (
          <p className="empty-state">Nenhuma usuária encontrada com esse nome.</p>
        )}
      </section>

      {/* RECEIVED REQUESTS */}
      {received.length > 0 && (
        <section className="profile-section">
          <h2>Solicitações Recebidas ({received.length})</h2>
          <div className="friends-grid">
            {received.map((item) => (
              <MotherCard
                key={item.id}
                item={item}
                actions={
                  <div className="friend-actions">
                    <button className="primary-button small" onClick={() => accept(item)}>
                      Aceitar
                    </button>
                    <button className="soft-button small" onClick={() => remove(item)}>
                      Recusar
                    </button>
                  </div>
                }
              />
            ))}
          </div>
        </section>
      )}

      {/* ACCEPTED FRIENDS */}
      <section className="profile-section">
        <h2>Minhas Amigas Conectadas ({accepted.length})</h2>
        {accepted.length === 0 ? (
          <div className="empty-state-card">
            <p>Você ainda não tem amigas adicionadas. Use o campo de busca acima para encontrar outras mães!</p>
          </div>
        ) : (
          <div className="friends-grid">
            {accepted.map((item) => (
              <MotherCard
                key={item.id}
                item={item}
                actions={
                  <button className="ghost-button small" onClick={() => remove(item)}>
                    Desfazer amizade
                  </button>
                }
              />
            ))}
          </div>
        )}
      </section>

      {/* SENT REQUESTS */}
      {sent.length > 0 && (
        <section className="profile-section">
          <h2>Solicitações Enviadas ({sent.length})</h2>
          <div className="friends-grid">
            {sent.map((item) => (
              <MotherCard
                key={item.id}
                item={item}
                actions={
                  <button className="soft-button small" onClick={() => remove(item)}>
                    Cancelar Solicitação
                  </button>
                }
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default Amigos;
