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

  useEffect(() => {
    async function loadChat() {
      const { session: currentSession } = await getCurrentSession();
      setSession(currentSession);
      if (!supabase || !currentSession?.user) return;

      let { data, error } = await supabase
        .from("conversations")
        .select("*, buyer:profiles!conversations_buyer_id_fkey(id, full_name, avatar_url), seller:profiles!conversations_seller_id_fkey(id, full_name, avatar_url), products(title, image_url), store_products(title, image_url, stores(name))")
        .or(`buyer_id.eq.${currentSession.user.id},seller_id.eq.${currentSession.user.id}`)
        .order("created_at", { ascending: false });

      if (error) {
        const fallback = await supabase
          .from("conversations")
          .select("*, buyer:profiles!conversations_buyer_id_fkey(id, full_name, avatar_url), seller:profiles!conversations_seller_id_fkey(id, full_name, avatar_url), products(title, image_url)")
          .or(`buyer_id.eq.${currentSession.user.id},seller_id.eq.${currentSession.user.id}`)
          .order("created_at", { ascending: false });

        data = fallback.data;
        error = fallback.error;
      }

      if (error) return;

      const rows = data || [];
      setConversations(rows);
      loadUnreadCounts(currentSession.user.id, rows);

      const conversationId = searchParams.get("conversation");
      const selected = rows.find((item) => item.id === conversationId) || rows[0] || null;
      setActiveConversation(selected);
      if (selected) loadMessages(selected.id, currentSession.user.id);
    }

    loadChat();
  }, [loadMessages, loadUnreadCounts, searchParams]);

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
                <Link className="chat-person-link" to={`/maes/${getOtherParticipant(activeConversation).id}`}>
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
                  <span className="chat-profile-hint">Ver perfil</span>
                </Link>
              )}
              <div className="chat-product-strip">
                {getConversationProduct(activeConversation)?.image_url && <img src={getConversationProduct(activeConversation).image_url} alt="" />}
                <strong>{getConversationTitle(activeConversation)}</strong>
              </div>

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
