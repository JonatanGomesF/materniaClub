import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getCurrentSession, supabase } from "../lib/supabaseClient";

function Chat() {
  const [searchParams] = useSearchParams();
  const [session, setSession] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [unreadByConversation, setUnreadByConversation] = useState({});
  const [reviewsByConversation, setReviewsByConversation] = useState({});
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [reviewDraft, setReviewDraft] = useState({ rating: 5, comment: "" });

  function getConversationProduct(conversation) {
    return conversation?.products || conversation?.store_products || null;
  }

  function getConversationTitle(conversation) {
    const product = getConversationProduct(conversation);
    return product?.title || "Conversa do marketplace";
  }

  function getOtherParticipant(conversation) {
    if (!conversation || !session?.user) return null;
    return conversation.buyer_id === session.user.id ? conversation.seller : conversation.buyer;
  }

  function isStoreConversation(conversation) {
    return Boolean(conversation?.store_product_id && !conversation.product_id);
  }

  function canReviewConversation(conversation) {
    if (!session?.user || !conversation || conversation.buyer_id !== session.user.id || conversation.seller_id === session.user.id) {
      return false;
    }

    if (isStoreConversation(conversation)) {
      return conversation.seller?.account_type === "store";
    }

    return Boolean(
      conversation.product_id
      && !conversation.store_product_id
      && conversation.seller?.account_type === "user"
    );
  }

  function getReviewTargetName(conversation) {
    if (!conversation) return "essa negociacao";
    if (isStoreConversation(conversation)) return conversation.store_products?.stores?.name || conversation.seller?.full_name || "essa loja";
    return conversation.seller?.full_name || "essa mamae";
  }

  function getReviewTargetType(conversation) {
    return isStoreConversation(conversation) ? "loja" : "mamae";
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
    setUnreadByConversation((data || []).reduce((counts, item) => {
      counts[item.conversation_id] = (counts[item.conversation_id] || 0) + 1;
      return counts;
    }, {}));
  }, []);

  const loadMessages = useCallback(async (conversationId, userId) => {
    if (!supabase || !conversationId) return;

    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (!error) {
      setMessages(data || []);
      await markConversationAsRead(conversationId, userId);
    }
  }, [markConversationAsRead]);

  const loadReviews = useCallback(async (userId, conversationRows) => {
    if (!supabase || !userId || conversationRows.length === 0) {
      setReviewsByConversation({});
      return;
    }

    const motherReviewableIds = conversationRows
      .filter((conversation) => conversation.buyer_id === userId && conversation.product_id && !conversation.store_product_id)
      .map((conversation) => conversation.id);

    const storeReviewableIds = conversationRows
      .filter((conversation) => conversation.buyer_id === userId && conversation.store_product_id && !conversation.product_id)
      .map((conversation) => conversation.id);

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

      let { data, error } = await supabase
        .from("conversations")
        .select("*, buyer:profiles!conversations_buyer_id_fkey(id, full_name, avatar_url, account_type), seller:profiles!conversations_seller_id_fkey(id, full_name, avatar_url, account_type), products(title, image_url), store_products(title, image_url, store_id, stores(id, name))")
        .or(`buyer_id.eq.${currentSession.user.id},seller_id.eq.${currentSession.user.id}`)
        .order("created_at", { ascending: false });

      if (error) {
        const fallback = await supabase
          .from("conversations")
          .select("*, buyer:profiles!conversations_buyer_id_fkey(id, full_name, avatar_url, account_type), seller:profiles!conversations_seller_id_fkey(id, full_name, avatar_url, account_type), products(title, image_url)")
          .or(`buyer_id.eq.${currentSession.user.id},seller_id.eq.${currentSession.user.id}`)
          .order("created_at", { ascending: false });

        data = fallback.data;
        error = fallback.error;
      }

      if (error) return;

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

  useEffect(() => {
    if (!supabase || !session?.user) return undefined;

    const activeConversationId = activeConversation?.id;
    const channel = supabase
      .channel(`chat-messages-${session.user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        loadUnreadCounts(session.user.id, conversations);
        if (activeConversationId) loadMessages(activeConversationId, session.user.id);
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [session?.user, conversations, activeConversation?.id, loadMessages, loadUnreadCounts]);

  async function sendMessage(event) {
    event.preventDefault();
    if (!supabase || !session?.user || !activeConversation || !message.trim()) return;

    const { error } = await supabase.from("messages").insert({
      conversation_id: activeConversation.id,
      sender_id: session.user.id,
      body: message.trim(),
    });

    if (error) {
      alert(error.message);
      return;
    }

    setMessage("");
    loadMessages(activeConversation.id, session.user.id);
  }

  async function submitReview(event) {
    event.preventDefault();
    if (!supabase || !session?.user || !activeConversation || !canReviewConversation(activeConversation)) return;

    const rating = Number(reviewDraft.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      alert("Escolha uma nota entre 1 e 5 estrelas.");
      return;
    }

    const isStoreReview = isStoreConversation(activeConversation);
    const storeId = activeConversation.store_products?.store_id || activeConversation.store_products?.stores?.id;
    if (isStoreReview && !storeId) {
      alert("Nao consegui identificar a loja dessa conversa.");
      return;
    }

    const reviewTable = isStoreReview ? "store_reviews" : "mother_reviews";
    const payload = isStoreReview ? {
      conversation_id: activeConversation.id,
      store_product_id: activeConversation.store_product_id,
      store_id: storeId,
      reviewer_id: session.user.id,
      rating,
      comment: reviewDraft.comment.trim() || null,
    } : {
        conversation_id: activeConversation.id,
        product_id: activeConversation.product_id,
        reviewer_id: session.user.id,
        reviewed_id: activeConversation.seller_id,
        rating,
        comment: reviewDraft.comment.trim() || null,
      };

    const { data, error } = await supabase
      .from(reviewTable)
      .insert(payload)
      .select()
      .maybeSingle();

    if (error) {
      if (error.code === "23505") {
        alert("Voce ja avaliou essa negociacao.");
        return;
      }
      alert(error.message.includes("reviews")
        ? `Execute o SQL ${isStoreReview ? "store-reviews-update.sql" : "mother-reviews-update.sql"} no Supabase para ativar avaliacoes.`
        : error.message);
      return;
    }

    setReviewsByConversation((current) => ({ ...current, [activeConversation.id]: { ...data, review_type: isStoreReview ? "store" : "mother" } }));
    setReviewDraft({ rating: 5, comment: "" });
    setIsReviewOpen(false);
  }

  const activeReview = activeConversation ? reviewsByConversation[activeConversation.id] : null;
  const activeCanReview = canReviewConversation(activeConversation);

  return (
    <div className="page-shell chat-layout">
      <section className="section-heading">
        <span className="eyebrow">Mensagens</span>
        <h1>Chat entre usuarias</h1>
        <p>Converse sobre retirada, preco e detalhes do produto com seguranca.</p>
      </section>

      <div className="chat-shell">
        <aside className="conversation-list">
          {conversations.length === 0 ? (
            <p className="empty-state">Nenhuma conversa ainda.</p>
          ) : conversations.map((conversation) => (
            <button
              className={activeConversation?.id === conversation.id ? "conversation active" : "conversation"}
              key={conversation.id}
              onClick={() => {
                setActiveConversation(conversation);
                loadMessages(conversation.id, session?.user?.id);
              }}
            >
              <span>{getConversationTitle(conversation)}</span>
              {unreadByConversation[conversation.id] > 0 && (
                <span className="conversation-unread">{unreadByConversation[conversation.id]}</span>
              )}
            </button>
          ))}
        </aside>

        <section className="message-panel">
          {activeConversation ? (
            <>
              {getOtherParticipant(activeConversation) && (
                <Link
                  className="chat-person-link"
                  to={isStoreConversation(activeConversation) && activeConversation.store_products?.stores?.id
                    ? `/lojas?store=${activeConversation.store_products.stores.id}`
                    : `/maes/${getOtherParticipant(activeConversation).id}`}
                >
                  <span className="chat-person-avatar">
                    {getOtherParticipant(activeConversation).avatar_url ? (
                      <img src={getOtherParticipant(activeConversation).avatar_url} alt="" />
                    ) : (
                      getOtherParticipant(activeConversation).full_name?.charAt(0) || "M"
                    )}
                  </span>
                  <span>
                    <small>Conversando com</small>
                    <strong>{getOtherParticipant(activeConversation).full_name || "Mae da comunidade"}</strong>
                  </span>
                  <span className="chat-profile-hint">{isStoreConversation(activeConversation) ? "Ver loja" : "Ver perfil"}</span>
                </Link>
              )}
              <div className="chat-product-strip">
                {getConversationProduct(activeConversation)?.image_url && <img src={getConversationProduct(activeConversation).image_url} alt="" />}
                <strong>{getConversationTitle(activeConversation)}</strong>
              </div>

              {activeCanReview && (
                <div className="review-nudge">
                  {activeReview ? (
                    <>
                      <strong>Voce avaliou essa {getReviewTargetType(activeConversation)} com {activeReview.rating} estrelas.</strong>
                      <span>Obrigada por ajudar outras maes a comprarem com mais seguranca.</span>
                    </>
                  ) : (
                    <>
                      <div>
                        <strong>O que voce achou dessa {getReviewTargetType(activeConversation)}?</strong>
                        <span>Avalie sua negociacao com {getReviewTargetName(activeConversation)}.</span>
                      </div>
                      <button className="primary-button small" onClick={() => setIsReviewOpen(true)}>Avaliar</button>
                    </>
                  )}
                </div>
              )}

              <div className="message-list">
                {messages.map((item) => (
                  <div className={item.sender_id === session?.user?.id ? "message sent" : "message received"} key={item.id}>
                    {item.body}
                  </div>
                ))}
              </div>

              <form className="message-input" onSubmit={sendMessage}>
                <input placeholder="Escreva uma mensagem" value={message} onChange={(event) => setMessage(event.target.value)} />
                <button className="primary-button small">Enviar</button>
              </form>

              {isReviewOpen && (
                <div className="review-modal-backdrop" role="presentation" onClick={() => setIsReviewOpen(false)}>
                  <form className="review-modal" onClick={(event) => event.stopPropagation()} onSubmit={submitReview}>
                    <span className="eyebrow">Avaliacao</span>
                    <h2>O que voce achou dessa {getReviewTargetType(activeConversation)}?</h2>
                    <p>Sua avaliacao aparece no perfil e ajuda outras maes da comunidade.</p>
                    <div className="star-picker" aria-label="Nota da avaliacao">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          aria-label={`${star} estrelas`}
                          className={star <= reviewDraft.rating ? "active" : ""}
                          key={star}
                          onClick={() => setReviewDraft((current) => ({ ...current, rating: star }))}
                          type="button"
                        >
                          ★
                        </button>
                      ))}
                    </div>
                    <textarea
                      maxLength="600"
                      placeholder="Conte como foi a negociacao"
                      value={reviewDraft.comment}
                      onChange={(event) => setReviewDraft((current) => ({ ...current, comment: event.target.value }))}
                    />
                    <div className="review-modal-actions">
                      <button className="ghost-button" type="button" onClick={() => setIsReviewOpen(false)}>Cancelar</button>
                      <button className="primary-button" type="submit">Enviar avaliacao</button>
                    </div>
                  </form>
                </div>
              )}
            </>
          ) : (
            <p className="empty-state">Clique em Tenho interesse em um anuncio para abrir uma conversa.</p>
          )}
        </section>
      </div>
    </div>
  );
}

export default Chat;
