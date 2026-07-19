import { useState } from "react";
import { ensureUserProfile, isSupabaseConfigured, supabase } from "../lib/supabaseClient";

function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    city: "",
    motherhood_stage: "gestante",
    account_type: "user",
    cnpj: "",
  });

  function handleChange(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  function getFriendlyAuthMessage(error) {
    const message = error?.message || "";

    if (message.includes("email rate limit exceeded")) {
      return "O Supabase limitou temporariamente o envio de emails. Aguarde alguns minutos ou desative a confirmacao de email em Authentication > Sign In / Providers > Email.";
    }

    if (message.includes("Email not confirmed")) {
      return "Seu email ainda nao foi confirmado. Abra o email de confirmacao ou desative a confirmacao de email no Supabase durante os testes.";
    }

    if (message.includes("Invalid login credentials")) {
      return "Email ou senha incorretos. Confira os dados ou crie uma nova conta.";
    }

    if (message.includes("User already registered")) {
      return "Esse email ja tem conta. Clique em Ja tenho conta e faca login.";
    }

    return message || "Nao foi possivel concluir a autenticacao agora.";
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");

    if (!supabase) {
      alert("Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para ativar login real.");
      return;
    }

    setLoading(true);
    try {
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: form.email,
          password: form.password,
        });
        if (error) throw error;
        const profile = await ensureUserProfile(data.user);
        window.location.href = profile?.account_type === "store" ? "/lojas?view=manage" : "/";
        return;
      } else {
        const isStore = form.account_type === "store";
        const cnpj = form.cnpj.replace(/\D/g, "");

        if (isStore && cnpj.length !== 14) {
          setMessage("Digite um CNPJ valido com 14 numeros.");
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
          options: { data: { full_name: form.full_name, account_type: form.account_type, cnpj, city: form.city } },
        });
        if (error) throw error;

        if (data.user) {
          await ensureUserProfile(data.user, {
            full_name: form.full_name,
            city: form.city,
            motherhood_stage: form.motherhood_stage,
            account_type: form.account_type,
          });

          if (isStore) {
            const { error: storeError } = await supabase.from("stores").upsert({
              owner_id: data.user.id,
              name: form.full_name.trim(),
              cnpj,
              city: form.city.trim(),
              status: "pending",
            }, { onConflict: "owner_id" });
            if (storeError) throw storeError;
          }
        }

        if (isStore) {
          setMessage("Cadastro recebido! Sua loja esta em analise. Avisaremos quando ela for aprovada.");
          return;
        }
      }

      window.location.href = "/";
    } catch (error) {
      alert(getFriendlyAuthMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <section className="auth-panel">
        <span className="eyebrow">materniaClub</span>
        <h1>{isLogin ? "Entre no seu clube materno." : "Crie sua conta."}</h1>
        <p>Uma rede feminina para ofertas, trocas, fotos, apoio e desapegos com seguranca.</p>

        <form onSubmit={handleSubmit}>
          {!isLogin && (
            <>
              <input name="full_name" required placeholder={form.account_type === "store" ? "Nome da loja" : "Nome completo"} value={form.full_name} onChange={handleChange} />
              <input name="city" placeholder="Cidade" value={form.city} onChange={handleChange} />
              <select name="account_type" value={form.account_type} onChange={handleChange}>
                <option value="user">Mae / usuaria</option>
                <option value="store">Loja parceira</option>
              </select>
              {form.account_type === "user" ? (
                <select name="motherhood_stage" value={form.motherhood_stage} onChange={handleChange}>
                  <option value="gestante">Gestante</option>
                  <option value="mae_primeira_viagem">Mae de primeira viagem</option>
                  <option value="mae_experiente">Mae experiente</option>
                  <option value="tentante">Tentante</option>
                </select>
              ) : (
                <input name="cnpj" required inputMode="numeric" placeholder="CNPJ (somente numeros)" value={form.cnpj} onChange={handleChange} />
              )}
            </>
          )}

          <input name="email" required type="email" placeholder="Email" value={form.email} onChange={handleChange} />
          <input name="password" required minLength="6" type="password" placeholder="Senha" value={form.password} onChange={handleChange} />

          <button className="primary-button" disabled={loading}>
            {loading ? "Aguarde..." : isLogin ? "Entrar" : "Cadastrar"}
          </button>
        </form>

        {message && <p className="notice" role="status">{message}</p>}

        <button className="ghost-button" onClick={() => setIsLogin((current) => !current)}>
          {isLogin ? "Criar minha conta" : "Ja tenho conta"}
        </button>

        {!isSupabaseConfigured && <p className="hint">Login em modo demo ate configurar o Supabase.</p>}
      </section>
    </div>
  );
}

export default Login;
