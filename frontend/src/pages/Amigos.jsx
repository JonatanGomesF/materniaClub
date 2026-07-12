import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getCurrentSession, supabase } from "../lib/supabaseClient";

const friendshipSelect = "*, requester:profiles!friendships_requester_id_fkey(id, full_name, city, bio, avatar_url), addressee:profiles!friendships_addressee_id_fkey(id, full_name, city, bio, avatar_url)";

function Amigos() {
  const [userId, setUserId] = useState(null);
  const [friendships, setFriendships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  async function loadFriendships(id) {
    if (!supabase || !id) return;
    const { data, error } = await supabase.from("friendships").select(friendshipSelect).or(`requester_id.eq.${id},addressee_id.eq.${id}`).order("updated_at", { ascending: false });
    if (!error) setFriendships(data || []);
    setLoading(false);
  }

  useEffect(() => {
    getCurrentSession().then(({ session }) => {
      const id = session?.user?.id || null;
      setUserId(id);
      if (id) loadFriendships(id);
      else setLoading(false);
    });
  }, []);

  async function accept(item) {
    const { error } = await supabase.from("friendships").update({ status: "accepted", updated_at: new Date().toISOString() }).eq("id", item.id);
    if (error) return alert(error.message);
    loadFriendships(userId);
  }

  async function remove(item) {
    const { error } = await supabase.from("friendships").delete().eq("id", item.id);
    if (error) return alert(error.message);
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
      .select("id, full_name, city, bio, avatar_url")
      .ilike("full_name", `%${name}%`)
      .neq("id", userId)
      .eq("status", "active")
      .order("full_name")
      .limit(20);

    if (error) alert(error.message);
    setSearchResults(data || []);
    setHasSearched(true);
    setSearching(false);
  }

  const accepted = friendships.filter((item) => item.status === "accepted");
  const received = friendships.filter((item) => item.status === "pending" && item.addressee_id === userId);
  const sent = friendships.filter((item) => item.status === "pending" && item.requester_id === userId);
  const otherMother = (item) => item.requester_id === userId ? item.addressee : item.requester;

  function MotherCard({ item, actions }) {
    const mother = otherMother(item);
    return <article className="friend-card">
      <Link className="friend-identity" to={`/maes/${mother.id}`}>
        <span className="profile-avatar-small">{mother.full_name?.charAt(0) || "M"}</span>
        <span><strong>{mother.full_name}</strong><small>{mother.city || "Cidade nao informada"}</small></span>
      </Link>
      {actions}
    </article>;
  }

  if (!userId && !loading) return <div className="page-shell"><section className="notice">Faca login para ver suas amizades.</section></div>;

  return <div className="page-shell friends-page">
    <section className="section-heading"><span className="eyebrow">Sua comunidade</span><h1>Meus amigos</h1><p>Encontre aqui suas amigas e solicitacoes de amizade.</p></section>

    <section className="profile-section friend-search-section">
      <h2>Procurar amigos</h2>
      <form className="friend-search-form" onSubmit={searchMothers}>
        <input
          aria-label="Nome da pessoa"
          placeholder="Digite o nome da pessoa"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setHasSearched(false);
          }}
        />
        <button className="primary-button" disabled={searching || !search.trim()}>{searching ? "Procurando..." : "Procurar"}</button>
      </form>
      {searchResults.length > 0 && <div className="friends-grid search-results">{searchResults.map((mother) => <article className="friend-card" key={mother.id}>
        <Link className="friend-identity" to={`/maes/${mother.id}`}>
          <span className="profile-avatar-small">{mother.full_name?.charAt(0) || "M"}</span>
          <span><strong>{mother.full_name}</strong><small>{mother.city || "Cidade nao informada"}</small></span>
        </Link>
        <Link className="soft-button" to={`/maes/${mother.id}`}>Ver perfil</Link>
      </article>)}</div>}
      {!searching && hasSearched && searchResults.length === 0 && <p className="empty-state">Nenhuma pessoa encontrada com esse nome.</p>}
    </section>

    {received.length > 0 && <section className="profile-section"><h2>Solicitacoes recebidas ({received.length})</h2><div className="friends-grid">{received.map((item) => <MotherCard key={item.id} item={item} actions={<div className="friend-actions"><button className="primary-button small" onClick={() => accept(item)}>Aceitar</button><button className="soft-button" onClick={() => remove(item)}>Recusar</button></div>} />)}</div></section>}

    <section className="profile-section"><h2>Minhas amigas ({accepted.length})</h2>{accepted.length === 0 ? <p className="empty-state">Voce ainda nao adicionou nenhuma amiga.</p> : <div className="friends-grid">{accepted.map((item) => <MotherCard key={item.id} item={item} actions={<button className="soft-button" onClick={() => remove(item)}>Desfazer amizade</button>} />)}</div>}</section>

    {sent.length > 0 && <section className="profile-section"><h2>Solicitacoes enviadas ({sent.length})</h2><div className="friends-grid">{sent.map((item) => <MotherCard key={item.id} item={item} actions={<button className="soft-button" onClick={() => remove(item)}>Cancelar</button>} />)}</div></section>}
  </div>;
}

export default Amigos;
