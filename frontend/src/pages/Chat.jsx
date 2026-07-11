import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getCurrentSession, supabase } from "../lib/supabaseClient";

function Chat() {
  const [searchParams] = useSearchParams();
  const [session, setSession] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");

  function getConversationProduct(conversation) {
    return conversation?.products || conversation?.store_products || null;
  }

  function getConversationTitle(conversation) {
    const product = getConversationProduct(conversation);
    return product?.title || "Conversa do marketplace";
  }

  async function loadMessages(conversationId) {
    if (!supabase || !conversationId) return;

    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (!error) setMessages(data || []);
  }

  useEffect(() => {
    async function loadChat() {
      const { session: currentSession } = await getCurrentSession();
      setSession(currentSession);
      if (!supabase || !currentSession?.user) return;

      let { data, error } = await supabase
        .from("conversations")
        .select("*, products(title, image_url), store_products(title, image_url, stores(name))")
        .or(`buyer_id.eq.${currentSession.user.id},seller_id.eq.${currentSession.user.id}`)
        .order("created_at", { ascending: false });

      if (error) {
        const fallback = await supabase
          .from("conversations")
          .select("*, products(title, image_url)")
          .or(`buyer_id.eq.${currentSession.user.id},seller_id.eq.${currentSession.user.id}`)
          .order("created_at", { ascending: false });

        data = fallback.data;
        error = fallback.error;
      }

      if (error) return;

      const rows = data || [];
      setConversations(rows);

      const conversationId = searchParams.get("conversation");
      const selected = rows.find((item) => item.id === conversationId) || rows[0] || null;
      setActiveConversation(selected);
      if (selected) loadMessages(selected.id);
    }

    loadChat();
  }, [searchParams]);

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
    loadMessages(activeConversation.id);
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
                loadMessages(conversation.id);
              }}
            >
              {getConversationTitle(conversation)}
            </button>
          ))}
        </aside>

        <section className="message-panel">
          {activeConversation ? (
            <>
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
