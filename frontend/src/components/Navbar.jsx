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

    if (!supabase) return () => {
      mounted = false;
      window.removeEventListener("maternia-profile-updated", refreshAccount);
    };

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
    if (!supabase || !account?.id) {
      return undefined;
    }

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
    if (!supabase || !account?.id || account.accountType !== "user") {
      return undefined;
    }

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
      .on("postgres_changes", { event: "*", schema: "public", table: "maternia_wallets", filter: `user_id=eq.${account.id}` }, loadWallet)
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

  const visibleWalletBalance = account?.accountType === "user" && wallet.userId === account?.id ? wallet.balance : null;
  const coinLabel = visibleWalletBalance === 1 ? "MaterniaCoin" : "MaterniaCoins";

  return (
    <header className="topbar">
      <Link className="brand" to="/">
        <span className="brand-mark">
          <img src="/maternia-logo.png" alt="Logo materniaClub" />
        </span>
        <span>materniaClub</span>
      </Link>

      <nav className="nav-links" aria-label="Navegacao principal">
        {account?.accountType !== "store" && <NavLink to="/">Feed</NavLink>}
        {account?.accountType !== "store" && <NavLink to="/marketplace">Marketplace</NavLink>}
        <NavLink to="/lojas">Lojas</NavLink>
        {account?.accountType !== "store" && <NavLink to="/amigos">Amigos</NavLink>}
        <NavLink className="chat-nav-link" to="/chat">
          Chat
          {account && unreadCount > 0 && <span className="unread-badge" aria-label={`${unreadCount} mensagens nao lidas`}>{unreadCount}</span>}
        </NavLink>
        {account && account.accountType !== "store" && <NavLink to="/perfil">Perfil</NavLink>}
        {["admin", "moderator"].includes(account?.role) && <NavLink to="/admin">Admin</NavLink>}
      </nav>

      <div className="nav-account">
        {!isSupabaseConfigured && <span className="status-pill">Demo</span>}
        {account ? (
          <div className="account-card">
            <span className="account-avatar">
              {account.avatarUrl ? <img src={account.avatarUrl} alt="" /> : account.initial}
            </span>
            <span className="account-copy">
              <strong>Ola, {account.firstName}</strong>
              <small>{account.email}</small>
              {visibleWalletBalance !== null && (
                <button className="coin-balance" title="Suas moedas maternia" type="button" onClick={() => setIsWalletOpen(true)}>
                  <span>M</span>
                  {visibleWalletBalance} moedas
                </button>
              )}
            </span>
            <button className="logout-button" onClick={logout}>Sair</button>
          </div>
        ) : (
          <Link className="nav-login-button" to="/login">Entrar</Link>
        )}
      </div>

      {visibleWalletBalance !== null && isWalletOpen && (
        <div className="coin-modal-backdrop" role="presentation" onClick={() => setIsWalletOpen(false)}>
          <section className="coin-modal" role="dialog" aria-modal="true" aria-label="Saldo de MaterniaCoins" onClick={(event) => event.stopPropagation()}>
            <button className="coin-modal-close" type="button" onClick={() => setIsWalletOpen(false)}>Fechar</button>
            <span className="coin-modal-icon">M</span>
            <h2>Voce tem {visibleWalletBalance} {coinLabel}</h2>
            <p>Use suas moedas em beneficios, descontos e vantagens dentro do materniaClub.</p>
          </section>
        </div>
      )}
    </header>
  );
}

export default Navbar;
