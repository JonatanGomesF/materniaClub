import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { getCurrentSession, getDisplayUser, isSupabaseConfigured, supabase } from "../lib/supabaseClient";

function Navbar() {
  const [account, setAccount] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [wallet, setWallet] = useState({ userId: null, balance: null });
  const [isWalletOpen, setIsWalletOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    const refreshAccount = () => {
      getCurrentSession().then(({ session, profile }) => {
        if (mounted) setAccount(getDisplayUser(session, profile));
      });
    };

    refreshAccount();
    window.addEventListener("maternia-profile-updated", refreshAccount);

    if (!supabase) {
      return () => {
        mounted = false;
        window.removeEventListener("maternia-profile-updated", refreshAccount);
      };
    }

    const { data } = supabase.auth.onAuthStateChange(() => {
      refreshAccount();
    });

    return () => {
      mounted = false;
      window.removeEventListener("maternia-profile-updated", refreshAccount);
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!supabase || !account?.id) return undefined;
    let mounted = true;

    const loadUnreadCount = async () => {
      const { count, error } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .neq("sender_id", account.id)
        .is("read_at", null);

      if (mounted && !error) setUnreadCount(count || 0);
    };

    loadUnreadCount();
    window.addEventListener("chat-unread-changed", loadUnreadCount);

    const channel = supabase
      .channel(`navbar-unread-${account.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, loadUnreadCount)
      .subscribe();

    return () => {
      mounted = false;
      window.removeEventListener("chat-unread-changed", loadUnreadCount);
      supabase.removeChannel(channel);
    };
  }, [account?.id]);

  useEffect(() => {
    if (!supabase || !account?.id || account.accountType !== "user") return undefined;
    let mounted = true;

    const loadWallet = async () => {
      const { data, error } = await supabase
        .from("maternia_wallets")
        .select("balance")
        .eq("user_id", account.id)
        .maybeSingle();

      if (mounted && !error) setWallet({ userId: account.id, balance: data?.balance ?? 0 });
    };

    loadWallet();
    window.addEventListener("maternia-wallet-updated", loadWallet);

    const channel = supabase
      .channel(`navbar-wallet-${account.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "maternia_wallets", filter: `user_id=eq.${account.id}` },
        loadWallet
      )
      .subscribe();

    return () => {
      mounted = false;
      window.removeEventListener("maternia-wallet-updated", loadWallet);
      supabase.removeChannel(channel);
    };
  }, [account?.id, account?.accountType]);

  const logout = async () => {
    if (supabase) await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const visibleWalletBalance =
    account?.accountType === "user" && wallet.userId === account?.id ? wallet.balance : null;
  const coinLabel = visibleWalletBalance === 1 ? "MaterniaCoin" : "MaterniaCoins";

  return (
    <>
      <header className="topbar">
        {/* BRAND LOGO */}
        <Link className="brand" to="/">
          <span className="brand-mark">
            <img src="/maternia-logo.png" alt="Logo materniaClub" />
          </span>
          <span className="brand-name">
            maternia<strong>Club</strong>
          </span>
        </Link>

        {/* DESKTOP NAVIGATION LINKS */}
        <nav className="nav-links desktop-nav" aria-label="Navegação principal">
          {account?.accountType !== "store" && (
            <NavLink to="/" end>
              Feed
            </NavLink>
          )}
          {account?.accountType !== "store" && (
            <NavLink to="/marketplace">
              Marketplace
            </NavLink>
          )}
          <NavLink to="/lojas">
            Lojas Parceiras
          </NavLink>
          {account?.accountType !== "store" && (
            <NavLink to="/amigos">
              Amigas
            </NavLink>
          )}
          <NavLink className="chat-nav-link" to="/chat">
            Chat
            {account && unreadCount > 0 && (
              <span className="unread-badge" aria-label={`${unreadCount} mensagens não lidas`}>
                {unreadCount}
              </span>
            )}
          </NavLink>
          {account && account.accountType !== "store" && (
            <NavLink to="/perfil">
              Meu Perfil
            </NavLink>
          )}
          {["admin", "moderator"].includes(account?.role) && (
            <NavLink to="/admin" className="admin-nav-link">
              Admin
            </NavLink>
          )}
        </nav>

        {/* USER PROFILE & WALLET CHIP */}
        <div className="nav-account">
          {!isSupabaseConfigured && <span className="status-pill status-demo">Demo</span>}

          {account ? (
            <div className="account-chip-card">
              {visibleWalletBalance !== null && (
                <button
                  className="coin-badge-btn"
                  title="Clique para ver suas moedas maternia"
                  type="button"
                  onClick={() => setIsWalletOpen(true)}
                >
                  <span className="coin-icon-circle">M</span>
                  <span className="coin-value">{visibleWalletBalance}</span>
                </button>
              )}

              <Link
                to={account.accountType === "store" ? "/lojas?view=manage" : "/perfil"}
                className="account-avatar-link"
                title="Ver perfil"
              >
                <span className="account-avatar">
                  {account.avatarUrl ? <img src={account.avatarUrl} alt="" /> : account.initial}
                </span>
                <span className="account-text-info">
                  <strong>{account.firstName}</strong>
                  <small>{account.accountType === "store" ? "Loja Parceira" : "Mãe do Clube"}</small>
                </span>
              </Link>

              <button className="logout-icon-btn" onClick={logout} title="Sair da conta" type="button">
                ⎋
              </button>
            </div>
          ) : (
            <Link className="nav-login-button" to="/login">
              Entrar / Cadastrar
            </Link>
          )}
        </div>

        {/* COIN WALLET MODAL */}
        {visibleWalletBalance !== null && isWalletOpen && (
          <div className="coin-modal-backdrop" role="presentation" onClick={() => setIsWalletOpen(false)}>
            <section
              className="coin-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Saldo de MaterniaCoins"
              onClick={(event) => event.stopPropagation()}
            >
              <button className="coin-modal-close" type="button" onClick={() => setIsWalletOpen(false)}>
                ✕
              </button>
              <div className="coin-modal-icon">M</div>
              <h2>
                Você possui {visibleWalletBalance} {coinLabel}
              </h2>
              <p>
                As <strong>MaterniaCoins</strong> são moedas exclusivas de fidelidade do clube! Use-as em descontos
                especiais de lojas parceiras, benefícios em eventos e vantagens dentro da comunidade.
              </p>
              <div className="coin-modal-tips">
                <span>💡 Ganhe mais moedas participando ativamente do clube!</span>
              </div>
            </section>
          </div>
        )}
      </header>

      {/* MOBILE BOTTOM NAVIGATION BAR */}
      <nav className="mobile-bottom-bar" aria-label="Navegação móvel">
        {account?.accountType !== "store" && (
          <NavLink to="/" end className={({ isActive }) => `mobile-nav-item ${isActive ? "active" : ""}`}>
            <span className="mobile-nav-icon">🏠</span>
            <span>Feed</span>
          </NavLink>
        )}
        {account?.accountType !== "store" && (
          <NavLink to="/marketplace" className={({ isActive }) => `mobile-nav-item ${isActive ? "active" : ""}`}>
            <span className="mobile-nav-icon">🛍️</span>
            <span>Desapegos</span>
          </NavLink>
        )}
        <NavLink to="/lojas" className={({ isActive }) => `mobile-nav-item ${isActive ? "active" : ""}`}>
          <span className="mobile-nav-icon">🏬</span>
          <span>Lojas</span>
        </NavLink>
        <NavLink to="/chat" className={({ isActive }) => `mobile-nav-item ${isActive ? "active" : ""}`}>
          <span className="mobile-nav-icon">
            💬
            {account && unreadCount > 0 && <span className="mobile-unread-dot">{unreadCount}</span>}
          </span>
          <span>Chat</span>
        </NavLink>
        {account && account.accountType !== "store" && (
          <NavLink to="/perfil" className={({ isActive }) => `mobile-nav-item ${isActive ? "active" : ""}`}>
            <span className="mobile-nav-icon">👤</span>
            <span>Perfil</span>
          </NavLink>
        )}
        {["admin", "moderator"].includes(account?.role) && (
          <NavLink to="/admin" className={({ isActive }) => `mobile-nav-item ${isActive ? "active" : ""}`}>
            <span className="mobile-nav-icon">⚙️</span>
            <span>Admin</span>
          </NavLink>
        )}
      </nav>
    </>
  );
}

export default Navbar;
