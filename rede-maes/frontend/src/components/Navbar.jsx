import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { getCurrentSession, getDisplayUser, isSupabaseConfigured, supabase } from "../lib/supabaseClient";

function Navbar() {
  const [account, setAccount] = useState(null);

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

  const logout = async () => {
    if (supabase) await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <header className="topbar">
      <Link className="brand" to="/">
        <span className="brand-mark">m</span>
        <span>materniaClub</span>
      </Link>

      <nav className="nav-links" aria-label="Navegacao principal">
        <NavLink to="/">Feed</NavLink>
        <NavLink to="/marketplace">Marketplace</NavLink>
        <NavLink to="/chat">Chat</NavLink>
        <NavLink to="/perfil">Perfil</NavLink>
        <NavLink to="/admin">Admin</NavLink>
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
