import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getCurrentSession, supabase } from "../lib/supabaseClient";
import { useToast } from "../lib/toastContext";

function Chat() {
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [session, setSession] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [unreadByConversation, setUnreadByConversation] = useState({});
  const [reviewsByConversation, setReviewsByConversation] = useState({});
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [reviewDraft, setReviewDraft] = useState({ rating: 5, comment: "" });
  const [savingReview, setSavingReview] = useState(false);

  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  function getConversationProduct(conversation) {
    return conversation?.products || conversation?.store_products || null;
  }

  function getConversationTitle(conversation) {
    const product = getConversationProduct(conversation);
    return product?.title || "Negociação materniaClub";
  }

  function getOtherParticipant(conversation) {
    if (!conversation || !session?.user) return null;
    return conversation.buyer_id === session.user.id ? conversation.seller : conversation.buyer;
  }

  function isStoreConversation(conversation) {
    return Boolean(conversation?.store_product_id && !conversation.product_id);
  }

  function canReviewConversation(conversation) {
    if (
      !session?.user ||
      !conversation ||
      conversation.buyer_id !== session.user.id ||
      conversation.seller_id === session.user.id
    ) {
      return false;
    }

    if (isStoreConversation(conversation)) {
      return conversation.seller?.account_type === "store";
    }

    return Boolean(
      conversation.product_id &&
        !conversation.store_product_id &&
        conversation.seller?.account_type === "user"
    );
  }

  function getReviewTargetName(conversation) {
    if (!conversation) return "essa negociação";
    if (isStoreConversation(conversation)) {
      return conversation.store_products?.stores?.name || conversation.seller?.full_name || "esta loja";
    }
    return conversation.seller?.full_name || "esta mãe";
  }

  const markConversationAsRead = useCallback(async (conversationId, userId) => {
    if (!supabase || !conversationId || !userId) return;

    const { error } = await supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .neq("sender_id", userId)
      .is("read_at", null);

    if (!error) {
      setUnreadByConversation((current) => ({ ...current, [conversationId]: 0 }));
      window.dispatchEvent(new Event("chat-unread-changed"));
    }
  }, []);

  const loadUnreadCounts = useCallback(async (userId, conversationRows) => {
    if (!supabase || !userId || conversationRows.length === 0) {
      setUnreadByConversation({});
      return;
    }

    const { data, error } = await supabase
      .from("messages")
      .select("conversation_id")
      .in("conversation_id", conversationRows.map((item) => item.id))
      .neq("sender_id", userId)
      .is("read_at", null);

    if (error) return;
    setUnreadByConversation(
      (data || []).reduce((counts, item) => {
        counts[item.conversation_id] = (counts[item.conversation_id] || 0) + 1;
        return counts;
      }, {})
    );
  }, []);

  const loadMessages = useCallback(
    async (conversationId, userId) => {
      if (!supabase || !conversationId) return;

      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (!error) {
        setMessages(data || []);
        await markConversationAsRead(conversationId, userId);
        setTimeout(scrollToBottom, 100);
      }
    },
    [markConversationAsRead]
  );

  const loadReviews = useCallback(async (userId, conversationRows) => {
    if (!supabase || !userId || conversationRows.length === 0) {
      setReviewsByConversation({});
      return;
    }

    const motherReviewableIds = conversationRows
      .filter((c) => c.buyer_id === userId && c.product_id && !c.store_product_id)
      .map((c) => c.id);

    const storeReviewableIds = conversationRows
      .filter((c) => c.buyer_id === userId && c.store_product_id && !c.product_id)
      .map((c) => c.id);

    if (motherReviewableIds.length === 0 && storeReviewableIds.length === 0) {
      setReviewsByConversation({});
      return;
    }

    const nextReviews = {};

    if (motherReviewableIds.length > 0) {
      const { data, error } = await supabase
        .from("mother_reviews")
        .select("*")
        .eq("reviewer_id", userId)
        .in("conversation_id", motherReviewableIds);

      if (!error) {
        (data || []).forEach((review) => {
          nextReviews[review.conversation_id] = { ...review, review_type: "mother" };
        });
      }
    }

    if (storeReviewableIds.length > 0) {
      const { data, error } = await supabase
        .from("store_reviews")
        .select("*")
        .eq("reviewer_id", userId)
        .in("conversation_id", storeReviewableIds);

      if (!error) {
        (data || []).forEach((review) => {
          nextReviews[review.conversation_id] = { ...review, review_type: "store" };
        });
      }
    }

    setReviewsByConversation(nextReviews);
  }, []);

  useEffect(() => {
    async function loadChat() {
      const { session: currentSession } = await getCurrentSession();
      setSession(currentSession);
      if (!supabase || !currentSession?.user) return;

      const { data, error } = await supabase
        .from("conversations")
        .select(
          "*, buyer:profiles!conversations_buyer_id_fkey(id, full_name, avatar_url, account_type), seller:profiles!conversations_seller_id_fkey(id, full_name, avatar_url, account_type), products(id, title, image_url, price, condition), store_products(id, title, image_url, price, store_id, stores(id, name, logo_url))"
        )
        .or(`buyer_id.eq.${currentSession.user.id},seller_id.eq.${currentSession.user.id}`)
        .order("created_at", { ascending: false });

      if (error) {
        console.warn("Erro ao carregar conversas:", error.message);
        return;
      }

      const rows = data || [];
      setConversations(rows);
      loadUnreadCounts(currentSession.user.id, rows);
      loadReviews(currentSession.user.id, rows);

      const conversationId = searchParams.get("conversation");
      const selected = rows.find((item) => item.id === conversationId) || rows[0] || null;
      setActiveConversation(selected);
      if (selected) loadMessages(selected.id, currentSession.user.id);
    }

    loadChat();
  }, [loadMessages, loadReviews, loadUnreadCounts, searchParams]);

  // Realtime messages subscription
  useEffect(() => {
    if (!supabase || !activeConversation?.id) return undefined;

    const channel = supabase
      .channel(`chat-convo-${activeConversation.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${activeConversation.id}`,
        },
        (payload) => {
          setMessages((current) => {
            if (current.some((m) => m.id === payload.new.id)) return current;
            return [...current, payload.new];
          });
          if (session?.user && payload.new.sender_id !== session.user.id) {
            markConversationAsRead(activeConversation.id, session.user.id);
          }
          setTimeout(scrollToBottom, 100);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeConversation?.id, markConversationAsRead, session?.user]);

  async function sendMessage(e) {
    e.preventDefault();
    if (!message.trim() || !supabase || !activeConversation || !session?.user) return;

    setSending(true);
    const textToSend = message.trim();
    setMessage("");

    try {
      const { data, error } = await supabase.from("messages").insert({
        conversation_id: activeConversation.id,
        sender_id: session.user.id,
        body: textToSend,
      }).select().maybeSingle();

      if (error) throw error;

      if (data) {
        setMessages((current) => [...current, data]);
        setTimeout(scrollToBottom, 50);
      }
    } catch (err) {
      toast.error(err.message || "Erro ao enviar mensagem");
    } finally {
      setSending(false);
    }
  }

  async function submitReview(e) {
    e.preventDefault();
    if (!supabase || !session?.user || !activeConversation) return;

    setSavingReview(true);
    try {
      const isStore = isStoreConversation(activeConversation);

      if (isStore) {
        const { error } = await supabase.from("store_reviews").insert({
          conversation_id: activeConversation.id,
          store_product_id: activeConversation.store_product_id,
          store_id: activeConversation.store_products?.store_id || activeConversation.store_products?.stores?.id,
          reviewer_id: session.user.id,
          rating: Number(reviewDraft.rating),
          comment: reviewDraft.comment.trim() || null,
        });

        if (error) throw error;
      } else {
        const { error } = await supabase.from("mother_reviews").insert({
          conversation_id: activeConversation.id,
          product_id: activeConversation.product_id,
          reviewer_id: session.user.id,
          reviewed_id: activeConversation.seller_id,
          rating: Number(reviewDraft.rating),
          comment: reviewDraft.comment.trim() || null,
        });

        if (error) throw error;
      }

      toast.success("Avaliação enviada com sucesso! Obrigada por fortalecer a comunidade!");
      setIsReviewOpen(false);
      loadReviews(session.user.id, conversations);
    } catch (err) {
      toast.error(err.message || "Erro ao enviar avaliação");
    } finally {
      setSavingReview(false);
    }
  }

  const otherPerson = getOtherParticipant(activeConversation);
  const activeProduct = getConversationProduct(activeConversation);
  const existingReview = activeConversation ? reviewsByConversation[activeConversation.id] : null;

  return (
    <div className="page-shell chat-page-layout">
      {/* CONVERSATION LIST SIDEBAR */}
      <aside className="chat-sidebar">
        <div className="chat-sidebar-header">
          <h2>Suas Conversas</h2>
          <span className="count-pill">{conversations.length}</span>
        </div>

        {conversations.length === 0 ? (
          <div className="empty-state-chat-sidebar">
            <p>Nenhuma conversa ativa no momento.</p>
            <small>Inicie um chat pelo Marketplace, Feed ou Vitrine de Lojas!</small>
          </div>
        ) : (
          <div className="chat-conversations-list">
            {conversations.map((c) => {
              const other = getOtherParticipant(c);
              const unread = unreadByConversation[c.id] || 0;
              const isSelected = activeConversation?.id === c.id;
              const product = getConversationProduct(c);

              return (
                <article
                  key={c.id}
                  className={`conversation-item ${isSelected ? "active" : ""}`}
                  onClick={() => {
                    setActiveConversation(c);
                    if (session?.user) loadMessages(c.id, session.user.id);
                  }}
                >
                  <div className="convo-avatar">
                    {other?.avatar_url ? (
                      <img src={other.avatar_url} alt="" />
                    ) : (
                      other?.full_name?.charAt(0) || "M"
                    )}
                  </div>
                  <div className="convo-info">
                    <div className="convo-top-row">
                      <strong>{other?.full_name || "Usuária"}</strong>
                      {unread > 0 && <span className="chat-unread-dot">{unread}</span>}
                    </div>
                    <p className="convo-preview-title">{product?.title || "Conversa do clube"}</p>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </aside>

      {/* CHAT MAIN AREA */}
      <section className="chat-main-area">
        {activeConversation ? (
          <>
            {/* CHAT HEADER */}
            <div className="chat-active-header">
              <div className="chat-header-user">
                <div className="chat-header-avatar">
                  {otherPerson?.avatar_url ? (
                    <img src={otherPerson.avatar_url} alt="" />
                  ) : (
                    otherPerson?.full_name?.charAt(0) || "M"
                  )}
                </div>
                <div>
                  <h3>{otherPerson?.full_name || "Participante"}</h3>
                  <span className="chat-header-status">
                    {isStoreConversation(activeConversation) ? "Loja Parceira" : "Mãe do materniaClub"}
                  </span>
                </div>
              </div>

              {/* REVIEW BUTTON */}
              {canReviewConversation(activeConversation) && (
                <div className="chat-header-actions">
                  {existingReview ? (
                    <span className="reviewed-badge">✓ Avaliação enviada (★ {existingReview.rating})</span>
                  ) : (
                    <button
                      type="button"
                      className="primary-button small"
                      onClick={() => setIsReviewOpen(true)}
                    >
                      ★ Avaliar Negociação
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* PRODUCT SUMMARY BANNER */}
            {activeProduct && (
              <div className="chat-product-banner">
                {activeProduct.image_url && (
                  <img src={activeProduct.image_url} alt={activeProduct.title} className="chat-product-thumb" />
                )}
                <div className="chat-product-details">
                  <strong>{activeProduct.title}</strong>
                  {activeProduct.price && (
                    <span>
                      {Number(activeProduct.price).toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* MESSAGES LIST */}
            <div className="chat-messages-container">
              {messages.length === 0 ? (
                <div className="chat-messages-empty">
                  <p>Inicie a conversa combinando detalhes de retirada, pagamento ou entrega.</p>
                </div>
              ) : (
                messages.map((m) => {
                  const isMine = m.sender_id === session?.user?.id;
                  const time = m.created_at
                    ? new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(
                        new Date(m.created_at)
                      )
                    : "";

                  return (
                    <div key={m.id} className={`message-bubble ${isMine ? "mine" : "theirs"}`}>
                      <p>{m.body}</p>
                      <span className="msg-time">{time}</span>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* MESSAGE INPUT FORM */}
            <form className="chat-input-bar" onSubmit={sendMessage}>
              <input
                placeholder="Escreva sua mensagem com carinho e respeito..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={sending}
              />
              <button className="primary-button" disabled={sending || !message.trim()}>
                {sending ? "..." : "Enviar"}
              </button>
            </form>
          </>
        ) : (
          <div className="no-conversation-selected">
            <h3>Nenhuma conversa selecionada</h3>
            <p>Selecione uma conversa ao lado ou navegue pelo Marketplace para iniciar uma negociação.</p>
          </div>
        )}
      </section>

      {/* RATING MODAL */}
      {isReviewOpen && activeConversation && (
        <div className="profile-modal-backdrop" role="presentation" onClick={() => setIsReviewOpen(false)}>
          <form
            className="listing-form review-modal-card"
            onClick={(e) => e.stopPropagation()}
            onSubmit={submitReview}
          >
            <div className="drawer-header">
              <h2>Avaliar {getReviewTargetName(activeConversation)}</h2>
              <button type="button" className="ghost-button small" onClick={() => setIsReviewOpen(false)}>
                ✕
              </button>
            </div>

            <p className="hint">
              Sua avaliação ajuda outras mães do materniaClub a saberem sobre pontualidade, qualidade e atendimento!
            </p>

            <div className="rating-stars-picker">
              <label className="form-label">Nota de 1 a 5 estrelas</label>
              <div className="stars-input-row">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    className={`star-choice-btn ${star <= reviewDraft.rating ? "active" : ""}`}
                    onClick={() => setReviewDraft((curr) => ({ ...curr, rating: star }))}
                  >
                    ★
                  </button>
                ))}
                <strong>{reviewDraft.rating} de 5</strong>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Comentário sobre a experiência</label>
              <textarea
                rows={3}
                placeholder="Ex: Produto exatamente como na foto, vendedora super atenciosa e rápida na entrega..."
                value={reviewDraft.comment}
                onChange={(e) => setReviewDraft((curr) => ({ ...curr, comment: e.target.value }))}
                maxLength={600}
              />
            </div>

            <div className="drawer-actions">
              <button className="primary-button" disabled={savingReview}>
                {savingReview ? "Enviando..." : "Publicar Avaliação"}
              </button>
              <button type="button" className="ghost-button" onClick={() => setIsReviewOpen(false)}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default Chat;
