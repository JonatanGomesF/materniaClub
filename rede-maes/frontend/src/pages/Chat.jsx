function Chat() {
  return (
    <div className="page-shell chat-layout">
      <section className="section-heading">
        <span className="eyebrow">Mensagens</span>
        <h1>Chat entre usuarias</h1>
        <p>Espaco pensado para combinar retirada, tirar duvidas sobre produtos e criar apoio entre maes.</p>
      </section>

      <div className="chat-shell">
        <aside className="conversation-list">
          <button className="conversation active">Promocao de fraldas</button>
          <button className="conversation">Carrinho compacto</button>
          <button className="conversation">Grupo gestantes SP</button>
        </aside>
        <section className="message-panel">
          <div className="message received">Oi, ainda esta disponivel?</div>
          <div className="message sent">Sim. Posso reservar ate amanha.</div>
          <div className="message received">Perfeito, obrigada!</div>
          <div className="message-input">
            <input placeholder="Escreva uma mensagem" />
            <button className="primary-button small">Enviar</button>
          </div>
        </section>
      </div>
    </div>
  );
}

export default Chat;
