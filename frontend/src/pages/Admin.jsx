import { useEffect, useState } from "react";
import { adminIdeas } from "../data/adminIdeas";
import { demoStats } from "../data/demoData";
import { getCurrentSession, isSupabaseConfigured, supabase } from "../lib/supabaseClient";

function Admin() {
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState(demoStats);
  const [users, setUsers] = useState([]);
  const [reports, setReports] = useState([]);
  const [stores, setStores] = useState([]);

  useEffect(() => {
    async function loadAdmin() {
      const { profile: currentProfile } = await getCurrentSession();
      setProfile(currentProfile);

      if (!supabase || currentProfile?.role !== "admin") return;

      const [{ data: profiles }, { data: reportRows }, { data: storeRows }, { count: posts }, { count: products }] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("reports").select("*, reporter:profiles(full_name)").order("created_at", { ascending: false }),
        supabase.from("stores").select("*").order("created_at", { ascending: false }),
        supabase.from("posts").select("*", { count: "exact", head: true }),
        supabase.from("products").select("*", { count: "exact", head: true }),
      ]);

      setUsers(profiles || []);
      setReports(reportRows || []);
      setStores(storeRows || []);
      setStats({
        users: profiles?.length || 0,
        posts: posts || 0,
        products: products || 0,
        reports: reportRows?.filter((report) => report.status === "open").length || 0,
      });
    }

    loadAdmin();
  }, []);

  async function updateUserStatus(userId, status) {
    if (!supabase) return;
    await supabase.from("profiles").update({ status }).eq("id", userId);
    setUsers((current) => current.map((user) => (user.id === userId ? { ...user, status } : user)));
  }

  async function closeReport(reportId) {
    if (!supabase) return;
    await supabase.from("reports").update({ status: "resolved" }).eq("id", reportId);
    setReports((current) => current.map((report) => (report.id === reportId ? { ...report, status: "resolved" } : report)));
  }

  async function updateStoreStatus(storeId, status) {
    if (!supabase) return;
    const { error } = await supabase.from("stores").update({ status }).eq("id", storeId);
    if (error) return alert(error.message);
    setStores((current) => current.map((store) => (store.id === storeId ? { ...store, status } : store)));
  }

  const isAdmin = profile?.role === "admin";

  return (
    <div className="page-shell admin-layout">
      <section className="section-heading">
        <span className="eyebrow">Painel admin</span>
        <h1>Controle do materniaClub</h1>
        <p>Moderacao, seguranca, promocoes verificadas e saude da comunidade em um so lugar.</p>
      </section>

      {!isSupabaseConfigured && <p className="notice">Modo demo: conecte o Supabase para administrar dados reais.</p>}
      {isSupabaseConfigured && !isAdmin && <p className="notice">Sua conta precisa ter role admin na tabela profiles.</p>}

      <section className="metric-grid">
        <div><strong>{stats.users}</strong><span>Usuarias</span></div>
        <div><strong>{stats.posts}</strong><span>Posts</span></div>
        <div><strong>{stats.products}</strong><span>Anuncios</span></div>
        <div><strong>{stats.reports}</strong><span>Denuncias abertas</span></div>
      </section>

      <section className="admin-section">
        <h2>O que voce pode administrar</h2>
        <div className="idea-grid">
          {adminIdeas.map((idea) => <p key={idea}>{idea}</p>)}
        </div>
      </section>

      <section className="admin-section">
        <h2>Solicitacoes de lojas</h2>
        {stores.filter((store) => store.status === "pending").length === 0 ? (
          <p className="empty-state">Nenhuma loja aguardando analise.</p>
        ) : stores.filter((store) => store.status === "pending").map((store) => (
          <div className="admin-row" key={store.id}>
            <div>
              <strong>{store.name}</strong>
              <p>{store.city || "Sem cidade"} · CNPJ: {store.cnpj}</p>
            </div>
            <span className="tag">Em analise</span>
            <button className="primary-button" onClick={() => updateStoreStatus(store.id, "active")}>Aprovar</button>
            <button className="danger-button" onClick={() => updateStoreStatus(store.id, "rejected")}>Recusar</button>
          </div>
        ))}
      </section>

      <section className="admin-section">
        <h2>Denuncias</h2>
        {reports.length === 0 ? (
          <p className="empty-state">Sem denuncias reais carregadas.</p>
        ) : reports.map((report) => (
          <div className="admin-row" key={report.id}>
            <div>
              <strong>{report.target_type}</strong>
              <p>{report.reason}</p>
            </div>
            <span className="tag">{report.status}</span>
            <button className="soft-button" onClick={() => closeReport(report.id)}>Resolver</button>
          </div>
        ))}
      </section>

      <section className="admin-section">
        <h2>Usuarias</h2>
        {users.length === 0 ? (
          <p className="empty-state">As usuarias aparecem aqui quando o Supabase estiver conectado.</p>
        ) : users.map((user) => (
          <div className="admin-row" key={user.id}>
            <div>
              <strong>{user.full_name}</strong>
              <p>{user.city || "Sem cidade"} · {user.role}</p>
            </div>
            <span className="tag">{user.status}</span>
            <button className="ghost-button" onClick={() => updateUserStatus(user.id, "banned")}>Banir</button>
            <button className="soft-button" onClick={() => updateUserStatus(user.id, "active")}>Reativar</button>
          </div>
        ))}
      </section>
    </div>
  );
}

export default Admin;
