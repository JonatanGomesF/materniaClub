import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { getCurrentSession, getDisplayUser, isSupabaseConfigured, supabase } from "../lib/supabaseClient";

function Navbar() {
  const [account, setAccount] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let mounted = true;

    getCurrentSession().then(({ session, profile }) => {
      if (mounted) setAccount(getDisplayUser(session, profile));
    });

    if (!supabase) return () => {
      mounted = false;
    };

    const { data } = supabase.auth.onAuthStateChange(() => {
      getCurrentSession().then(({ session, profile }) => setAccount(getDisplayUser(session, profile)));
    });

    return () => {
      mounted = false;
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

    const channel = supabase
      .channel(`navbar-unread-${account.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, loadUnreadCount)
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [account?.id]);

  const logout = async () => {
    if (supabase) await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <header className="topbar">
      <Link className="brand" to="/">
        <span className="brand-mark">
          <img src="/maternia-logo.png" alt="Logo materniaClub" />
        </span>
        <span>materniaClub</span>
      </Link>

      <nav className="nav-links" aria-label="Navegacao principal">
        <NavLink to="/">Feed</NavLink>
        <NavLink to="/marketplace">Marketplace</NavLink>
        <NavLink to="/lojas">Lojas</NavLink>
        <NavLink to="/amigos">Amigos</NavLink>
        <NavLink className="chat-nav-link" to="/chat">
          Chat
          {account && unreadCount > 0 && <span className="unread-badge" aria-label={`${unreadCount} mensagens nao lidas`}>{unreadCount}</span>}
        </NavLink>
        <NavLink to="/perfil">Perfil</NavLink>
        {["admin", "moderator"].includes(account?.role) && <NavLink to="/admin">Admin</NavLink>}
      </nav>

      <div className="nav-account">
        {!isSupabaseConfigured && <span className="status-pill">Demo</span>}
        {account ? (
          <div className="account-card">
            <span className="account-avatar">{account.initial}</span>
            <span className="account-copy">
              <strong>Ola, {account.firstName}</strong>
              <small>{account.email}</small>
            </span>
            <button className="logout-button" onClick={logout}>Sair</button>
          </div>
        ) : (
          <Link className="primary-button small" to="/login">Entrar</Link>
        )}
      </div>
    </header>
  );
}

export default Navbar;
