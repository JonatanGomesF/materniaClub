import { useState } from "react";
import { ensureUserProfile, isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import { useToast } from "../lib/toastContext";

function formatCNPJ(value) {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
}

function Login() {
  const { toast } = useToast();
  const [isLogin, setIsLogin] = useState(true);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");

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
    const { name, value } = event.target;
    if (name === "cnpj") {
      setForm((current) => ({ ...current, cnpj: formatCNPJ(value) }));
    } else {
      setForm((current) => ({ ...current, [name]: value }));
    }
  }

  function getFriendlyAuthMessage(error) {
    const msg = error?.message || "";

    if (msg.includes("email rate limit exceeded")) {
      return "O Supabase limitou temporariamente o envio de emails. Aguarde alguns minutos ou desative a confirmação de email no painel Supabase.";
    }

    if (msg.includes("Email not confirmed")) {
      return "Seu email ainda não foi confirmado. Abra a caixa de entrada para confirmar ou desative o envio de email de confirmação no Supabase.";
    }

    if (msg.includes("Invalid login credentials")) {
      return "Email ou senha incorretos. Confira seus dados ou crie uma nova conta.";
    }

    if (msg.includes("User already registered")) {
      return "Este email já possui cadastro. Faça login diretamente com sua senha.";
    }

    return msg || "Não foi possível concluir a autenticação agora.";
  }

  async function handleResetPassword(e) {
    e.preventDefault();
    if (!resetEmail.trim() || !supabase) return;

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
        redirectTo: `${window.location.origin}/perfil`,
      });

      if (error) throw error;

      setResetSent(true);
      toast.success("Link de recuperação enviado para seu email!");
    } catch (err) {
      toast.error(getFriendlyAuthMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setNotice("");

    if (!supabase) {
      toast.warning("Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env");
      return;
    }

    setLoading(true);
    try {
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: form.email.trim(),
          password: form.password,
        });

        if (error) throw error;

        toast.success("Login realizado com sucesso!");
        const profile = await ensureUserProfile(data.user);

        setTimeout(() => {
          window.location.href = profile?.account_type === "store" ? "/lojas?view=manage" : "/";
        }, 500);
        return;
      } else {
        const isStore = form.account_type === "store";
        const rawCnpj = form.cnpj.replace(/\D/g, "");

        if (isStore && rawCnpj.length !== 14) {
          toast.warning("Digite um CNPJ válido com 14 dígitos.");
          setLoading(false);
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email: form.email.trim(),
          password: form.password,
          options: {
            data: {
              full_name: form.full_name.trim(),
              account_type: form.account_type,
              cnpj: isStore ? rawCnpj : null,
              city: form.city.trim(),
              motherhood_stage: isStore ? null : form.motherhood_stage,
            },
          },
        });

        if (error) throw error;

        if (data.user) {
          await ensureUserProfile(data.user, {
            full_name: form.full_name.trim(),
            city: form.city.trim(),
            motherhood_stage: form.motherhood_stage,
            account_type: form.account_type,
          });

          if (isStore) {
            const { error: storeError } = await supabase.from("stores").upsert({
              owner_id: data.user.id,
              name: form.full_name.trim(),
              cnpj: rawCnpj,
              city: form.city.trim(),
              status: "pending",
            }, { onConflict: "owner_id" });

            if (storeError) console.warn("Aviso ao vincular loja:", storeError.message);
          }
        }

        if (isStore) {
          setNotice("Cadastro recebido com sucesso! Sua loja foi enviada para análise e em breve será aprovada pela nossa equipe.");
          toast.success("Loja cadastrada! Aguardando aprovação.");
          return;
        }

        if (data.session) {
          toast.success("Conta criada com sucesso! Bem-vinda ao clube!");
          setTimeout(() => {
            window.location.href = "/";
          }, 600);
        } else {
          setNotice("Conta cadastrada! Se a confirmação de email estiver ativa no seu projeto Supabase, verifique sua caixa de entrada.");
          toast.info("Verifique seu email para confirmar o cadastro.");
        }
      }
    } catch (error) {
      toast.error(getFriendlyAuthMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <section className="auth-panel">
        <span className="eyebrow">materniaClub</span>
        <h1>{isLogin ? "Entre no seu clube materno." : "Crie sua conta no clube."}</h1>
        <p>Uma rede acolhedora para mães e lojistas: ofertas, trocas, conselhos, amizades e desapegos seguros.</p>

        {!showForgotPassword ? (
          <form onSubmit={handleSubmit} className="auth-form-body">
            {!isLogin && (
              <>
                <div className="form-group">
                  <label className="form-label">{form.account_type === "store" ? "Nome da Loja" : "Seu Nome Completo"}</label>
                  <input
                    name="full_name"
                    required
                    placeholder={form.account_type === "store" ? "Ex: Bebê Encantado Kids" : "Ex: Mariana Silva"}
                    value={form.full_name}
                    onChange={handleChange}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Cidade</label>
                    <input
                      name="city"
                      placeholder="Ex: São Paulo"
                      value={form.city}
                      onChange={handleChange}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Tipo de Conta</label>
                    <select name="account_type" value={form.account_type} onChange={handleChange}>
                      <option value="user">Mãe / Usuária</option>
                      <option value="store">Loja Parceira</option>
                    </select>
                  </div>
                </div>

                {form.account_type === "user" ? (
                  <div className="form-group">
                    <label className="form-label">Fase da Maternidade</label>
                    <select name="motherhood_stage" value={form.motherhood_stage} onChange={handleChange}>
                      <option value="gestante">Gestante</option>
                      <option value="mae_primeira_viagem">Mãe de primeira viagem</option>
                      <option value="mae_experiente">Mãe experiente</option>
                      <option value="tentante">Tentante</option>
                    </select>
                  </div>
                ) : (
                  <div className="form-group">
                    <label className="form-label">CNPJ da Loja</label>
                    <input
                      name="cnpj"
                      required
                      inputMode="numeric"
                      placeholder="00.000.000/0000-00"
                      value={form.cnpj}
                      onChange={handleChange}
                    />
                  </div>
                )}
              </>
            )}

            <div className="form-group">
              <label className="form-label">Email de Acesso</label>
              <input
                name="email"
                required
                type="email"
                placeholder="seu-email@exemplo.com"
                value={form.email}
                onChange={handleChange}
              />
            </div>

            <div className="form-group password-group">
              <div className="password-header">
                <label className="form-label">Senha</label>
                {isLogin && (
                  <button
                    type="button"
                    className="forgot-link"
                    onClick={() => {
                      setResetEmail(form.email);
                      setShowForgotPassword(true);
                    }}
                  >
                    Esqueci a senha
                  </button>
                )}
              </div>
              <div className="password-input-wrapper">
                <input
                  name="password"
                  required
                  minLength={6}
                  type={showPassword ? "text" : "password"}
                  placeholder="Mínimo 6 caracteres"
                  value={form.password}
                  onChange={handleChange}
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Ocultar senha" : "Exibir senha"}
                >
                  {showPassword ? "Ocultar" : "Mostrar"}
                </button>
              </div>
            </div>

            <button className="primary-button submit-auth-btn" disabled={loading}>
              {loading ? "Aguarde um momento..." : isLogin ? "Entrar na Conta" : "Criar Minha Conta"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleResetPassword} className="auth-form-body reset-password-form">
            <h2>Recuperar Senha</h2>
            <p className="reset-desc">
              Digite seu email cadastrado para receber as instruções de redefinição de senha.
            </p>

            <div className="form-group">
              <label className="form-label">Email cadastrado</label>
              <input
                type="email"
                required
                placeholder="seu-email@exemplo.com"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
              />
            </div>

            {resetSent ? (
              <div className="reset-success-box">
                <p>✓ Enviamos o link para seu email! Verifique sua caixa de entrada e spam.</p>
              </div>
            ) : null}

            <div className="reset-actions">
              <button className="primary-button" disabled={loading}>
                {loading ? "Enviando link..." : "Enviar link de recuperação"}
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  setShowForgotPassword(false);
                  setResetSent(false);
                }}
              >
                Voltar ao Login
              </button>
            </div>
          </form>
        )}

        {notice && <div className="auth-notice-card" role="status"><p>{notice}</p></div>}

        {!showForgotPassword && (
          <div className="auth-toggle-footer">
            <button className="ghost-button" onClick={() => { setIsLogin((curr) => !curr); setNotice(""); }}>
              {isLogin ? "Não tem uma conta? Crie sua conta grátis" : "Já possui conta? Clique para entrar"}
            </button>
          </div>
        )}

        {!isSupabaseConfigured && (
          <p className="hint demo-warning-hint">Modo demonstração: configure as variáveis do Supabase no .env para ativar autenticação em produção.</p>
        )}
      </section>
    </div>
  );
}

export default Login;
