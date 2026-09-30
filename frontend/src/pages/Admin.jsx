import { useEffect, useState } from "react";
import { adminIdeas } from "../data/adminIdeas";
import { demoStats } from "../data/demoData";
import { getCurrentSession, isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import { useToast } from "../lib/toastContext";

function formatCNPJ(value) {
  if (!value) return "Não informado";
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length !== 14) return value;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
}

function Admin() {
  const { toast, showConfirm } = useToast();
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState(demoStats);
  const [users, setUsers] = useState([]);
  const [reports, setReports] = useState([]);
  const [stores, setStores] = useState([]);
  const [wallets, setWallets] = useState({});
  const [coinAmounts, setCoinAmounts] = useState({});
  const [activeTab, setActiveTab] = useState("stores-pending");
  const [userSearch, setUserSearch] = useState("");

  useEffect(() => {
    async function loadAdmin() {
      const { profile: currentProfile } = await getCurrentSession();
      setProfile(currentProfile);

      if (!supabase || currentProfile?.role !== "admin") return;

      const [
        { data: profiles },
        { data: reportRows },
        { data: storeRows },
        { count: posts },
        { count: products },
        walletResult,
      ] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("reports").select("*, reporter:profiles(full_name)").order("created_at", { ascending: false }),
        supabase.from("stores").select("*").order("created_at", { ascending: false }),
        supabase.from("posts").select("*", { count: "exact", head: true }),
        supabase.from("products").select("*", { count: "exact", head: true }),
        supabase.from("maternia_wallets").select("*"),
      ]);

      setUsers(profiles || []);
      setReports(reportRows || []);
      setStores(storeRows || []);
      setWallets(
        (walletResult.data || []).reduce((map, wallet) => {
          map[wallet.user_id] = wallet;
          return map;
        }, {})
      );

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

    const actionText = status === "banned" ? "banir esta usuária" : "reativar esta conta";
    const confirmed = await showConfirm("Moderação de Usuária", `Deseja ${actionText}?`, "Confirmar", "Cancelar", status === "banned");
    if (!confirmed) return;

    const { error } = await supabase.from("profiles").update({ status }).eq("id", userId);
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(`Usuária atualizada para status: ${status}`);
    setUsers((current) => current.map((user) => (user.id === userId ? { ...user, status } : user)));
  }

  async function addCoins(user, customAmount = null) {
    if (!supabase) return;

    if (user.account_type !== "user") {
      toast.warning("Moedas maternia são exclusivas para mães.");
      return;
    }

    const amount = Number(customAmount || coinAmounts[user.id]);
    if (!Number.isInteger(amount) || amount <= 0) {
      toast.warning("Digite uma quantidade inteira e positiva de moedas.");
      return;
    }

    const { data, error } = await supabase.rpc("admin_add_maternia_coins", {
      target_user_id: user.id,
      amount_to_add: amount,
      reason_text: "Crédito manual do admin",
    });

    if (error) {
      toast.error(error.message);
      return;
    }

    setWallets((current) => ({
      ...current,
      [user.id]: { ...(current[user.id] || { user_id: user.id }), balance: data },
    }));
    setCoinAmounts((current) => ({ ...current, [user.id]: "" }));
    toast.success(`+${amount} moedas creditadas para ${user.full_name}! Saldo atual: ${data}`);
    window.dispatchEvent(new Event("maternia-wallet-updated"));
  }

  async function closeReport(reportId) {
    if (!supabase) return;

    const { error } = await supabase.from("reports").update({ status: "resolved" }).eq("id", reportId);
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Denúncia marcada como resolvida!");
    setReports((current) =>
      current.map((report) => (report.id === reportId ? { ...report, status: "resolved" } : report))
    );
  }

  async function updateStoreStatus(storeId, status) {
    if (!supabase) return;
    const currentStore = stores.find((s) => s.id === storeId);

    const actionNames = {
      verified: "Aprovar e Verificar Loja",
      suspended: "Suspender Loja",
      rejected: "Recusar Cadastro",
    };

    const confirmed = await showConfirm(
      actionNames[status] || "Alterar status",
      `Confirma alterar status de "${currentStore?.name}" para "${status}"?`,
      "Confirmar",
      "Cancelar",
      status !== "verified"
    );

    if (!confirmed) return;

    const { data, error } = await supabase
      .from("stores")
      .update({ status })
      .eq("id", storeId)
      .select()
      .maybeSingle();

    if (error) {
      toast.error(error.message);
      return;
    }

    if (!data) {
      toast.warning("Não foi possível alterar a loja.");
      return;
    }

    setStores((current) => current.map((s) => (s.id === storeId ? data : s)));
    toast.success(`Loja "${data.name}" agora está como ${getStoreStatusLabel(data.status)}!`);
  }

  const isAdmin = profile?.role === "admin";
  const pendingStores = stores.filter((store) => store.status === "pending");

  function getStoreStatusLabel(status) {
    const labels = {
      pending: "Aguardando verificação",
      verified: "Verificada ✓",
      rejected: "Recusada",
      suspended: "Suspensa",
      hidden: "Oculta",
      removed: "Removida",
    };
    return labels[status] || status;
  }

  const filteredUsers = users.filter((u) => {
    if (!userSearch.trim()) return true;
    return (
      u.full_name?.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.city?.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.role?.toLowerCase().includes(userSearch.toLowerCase())
    );
  });

  return (
    <div className="page-shell admin-layout">
      <section className="section-heading">
        <span className="eyebrow">Painel de Controle</span>
        <h1>Administração materniaClub</h1>
        <p>Moderação central, aprovação de parceiros CNPJ, auditoria de denúncias e economia de MaterniaCoins.</p>
      </section>

      {!isSupabaseConfigured && (
        <div className="auth-notice-card">
          <p>Modo demonstração: configure as variáveis de ambiente do Supabase para administrar dados reais.</p>
        </div>
      )}

      {isSupabaseConfigured && !isAdmin && (
        <div className="auth-notice-card alert-warning">
          <p>
            Sua conta atual não possui permissão de Administrador (role = admin). Execute o comando de promoção no
            Supabase SQL Editor com seu email.
          </p>
        </div>
      )}

      {/* METRIC GRID */}
      <section className="metric-grid">
        <div className="metric-card">
          <strong>{stats.users}</strong>
          <span>Usuárias Cadastradas</span>
        </div>
        <div className="metric-card">
          <strong>{stats.posts}</strong>
          <span>Posts no Feed</span>
        </div>
        <div className="metric-card">
          <strong>{stats.products}</strong>
          <span>Anúncios Ativos</span>
        </div>
        <div className="metric-card">
          <strong>{stats.reports}</strong>
          <span>Denúncias Pendentes</span>
        </div>
      </section>

      {/* ADMIN TABS */}
      <div className="admin-tabs-bar">
        <button
          type="button"
          className={`tab-btn ${activeTab === "stores-pending" ? "active" : ""}`}
          onClick={() => setActiveTab("stores-pending")}
        >
          Lojas Pendentes ({pendingStores.length})
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === "stores-all" ? "active" : ""}`}
          onClick={() => setActiveTab("stores-all")}
        >
          Todas as Lojas ({stores.length})
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === "reports" ? "active" : ""}`}
          onClick={() => setActiveTab("reports")}
        >
          Denúncias ({reports.filter((r) => r.status === "open").length})
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === "users" ? "active" : ""}`}
          onClick={() => setActiveTab("users")}
        >
          Usuárias & Moedas ({users.length})
        </button>
      </div>

      {/* TAB: PENDING STORES */}
      {activeTab === "stores-pending" && (
        <section className="admin-section">
          <h2>Solicitações de Lojas Parceiras</h2>
          <p className="hint">Lojas que se cadastraram e aguardam checagem de CNPJ para receber o selo verificado.</p>

          {pendingStores.length === 0 ? (
            <div className="empty-state-card">
              <p>✓ Nenhuma loja aguardando aprovação no momento.</p>
            </div>
          ) : (
            pendingStores.map((s) => (
              <div className="admin-row" key={s.id}>
                <div className="admin-row-main">
                  <strong>{s.name}</strong>
                  <p>
                    {s.city || "Sem cidade"} · <strong>CNPJ:</strong> {formatCNPJ(s.cnpj)}
                  </p>
                  {s.description && <p className="admin-row-desc">{s.description}</p>}
                </div>
                <span className="status-pill status-pending">{getStoreStatusLabel(s.status)}</span>
                <div className="admin-actions">
                  <button className="primary-button small" onClick={() => updateStoreStatus(s.id, "verified")}>
                    ✓ Aprovar & Verificar
                  </button>
                  <button className="danger-button small" onClick={() => updateStoreStatus(s.id, "rejected")}>
                    ✕ Recusar
                  </button>
                </div>
              </div>
            ))
          )}
        </section>
      )}

      {/* TAB: ALL STORES */}
      {activeTab === "stores-all" && (
        <section className="admin-section">
          <h2>Todas as Lojas Registradas</h2>
          {stores.length === 0 ? (
            <p className="empty-state">Nenhuma loja cadastrada no sistema.</p>
          ) : (
            stores.map((s) => (
              <div className="admin-row" key={s.id}>
                <div className="admin-row-main">
                  <strong>{s.name}</strong>
                  <p>{s.city || "Sem cidade"} · CNPJ: {formatCNPJ(s.cnpj)}</p>
                </div>
                <span className={`status-pill status-${s.status}`}>{getStoreStatusLabel(s.status)}</span>
                <div className="admin-actions">
                  {s.status !== "verified" && (
                    <button className="primary-button small" onClick={() => updateStoreStatus(s.id, "verified")}>
                      Verificar
                    </button>
                  )}
                  {s.status === "verified" ? (
                    <button className="ghost-button small" onClick={() => updateStoreStatus(s.id, "suspended")}>
                      Suspender
                    </button>
                  ) : s.status === "suspended" ? (
                    <button className="soft-button small" onClick={() => updateStoreStatus(s.id, "verified")}>
                      Reativar
                    </button>
                  ) : null}
                  {s.status !== "rejected" && (
                    <button className="danger-button small" onClick={() => updateStoreStatus(s.id, "rejected")}>
                      Recusar
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </section>
      )}

      {/* TAB: REPORTS */}
      {activeTab === "reports" && (
        <section className="admin-section">
          <h2>Denúncias para Moderação</h2>
          {reports.length === 0 ? (
            <p className="empty-state">Nenhuma denúncia registrada.</p>
          ) : (
            reports.map((r) => (
              <div className="admin-row" key={r.id}>
                <div className="admin-row-main">
                  <strong>Tipo: {r.target_type}</strong>
                  <p><strong>Motivo:</strong> {r.reason}</p>
                  <small>Denunciado por: {r.reporter?.full_name || "Mãe anônima"}</small>
                </div>
                <span className={`status-pill status-${r.status}`}>{r.status === "open" ? "Aberta" : "Resolvida"}</span>
                <div className="admin-actions">
                  {r.status === "open" && (
                    <button className="primary-button small" onClick={() => closeReport(r.id)}>
                      Marcar Resolvida
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </section>
      )}

      {/* TAB: USERS & COINS */}
      {activeTab === "users" && (
        <section className="admin-section">
          <div className="store-panel-title">
            <h2>Gestão de Usuárias e MaterniaCoins</h2>
            <input
              type="search"
              placeholder="Filtrar por nome, cidade ou cargo..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className="admin-search-input"
            />
          </div>

          {filteredUsers.length === 0 ? (
            <p className="empty-state">Nenhuma usuária encontrada com esses critérios.</p>
          ) : (
            filteredUsers.map((u) => (
              <div className="admin-row" key={u.id}>
                <div className="admin-row-main">
                  <strong>{u.full_name}</strong>
                  <p>
                    {u.city || "Sem cidade"} · <strong>Tipo:</strong> {u.account_type === "store" ? "Loja" : "Mãe"} · <strong>Papel:</strong> {u.role}
                  </p>
                </div>

                <div className="coin-admin-box">
                  {u.account_type === "store" ? (
                    <span className="tag">Conta Loja</span>
                  ) : (
                    <>
                      <span className="coin-admin-pill">
                        Saldo: <strong>{wallets[u.id]?.balance ?? 0} M</strong>
                      </span>
                      <div className="coin-quick-buttons">
                        <button type="button" className="soft-button small" onClick={() => addCoins(u, 10)}>+10</button>
                        <button type="button" className="soft-button small" onClick={() => addCoins(u, 50)}>+50</button>
                      </div>
                      <div className="coin-admin-controls">
                        <input
                          aria-label={`Moedas para ${u.full_name}`}
                          min="1"
                          placeholder="Qtd"
                          type="number"
                          value={coinAmounts[u.id] || ""}
                          onChange={(e) => setCoinAmounts((c) => ({ ...c, [u.id]: e.target.value }))}
                        />
                        <button className="primary-button small" onClick={() => addCoins(u)}>Credit</button>
                      </div>
                    </>
                  )}
                </div>

                <span className={`status-pill status-${u.status}`}>
                  {u.status === "active" ? "Ativa" : u.status === "banned" ? "Banida" : u.status}
                </span>

                <div className="admin-actions">
                  {u.status === "active" ? (
                    <button className="danger-button small" onClick={() => updateUserStatus(u.id, "banned")}>
                      Banir
                    </button>
                  ) : (
                    <button className="soft-button small" onClick={() => updateUserStatus(u.id, "active")}>
                      Reativar
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </section>
      )}
    </div>
  );
}

export default Admin;
