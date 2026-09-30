import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useToast } from "../lib/toastContext";

function ProductComments({ currentUserId, product }) {
  const { toast, showConfirm } = useToast();
  const [comments, setComments] = useState([]);
  const [body, setBody] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingBody, setEditingBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const targetColumn = product.store_id ? "store_product_id" : "product_id";

  async function loadComments() {
    if (!supabase || !product.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("comments")
      .select("*, profiles(full_name, avatar_url)")
      .eq(targetColumn, product.id)
      .eq("status", "published")
      .order("created_at", { ascending: true });

    if (error) {
      console.warn("Erro ao carregar comentários:", error.message);
    } else {
      setComments(data || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!supabase || !product.id) return;
    let active = true;

    supabase
      .from("comments")
      .select("*, profiles(full_name, avatar_url)")
      .eq(targetColumn, product.id)
      .eq("status", "published")
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (!active) return;
        if (!error) setComments(data || []);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [product.id, targetColumn]);

  async function submit(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!currentUserId) {
      toast.info("Faça login para comentar neste produto.");
      return;
    }
    if (!body.trim()) return;

    const { error } = await supabase.from("comments").insert({
      user_id: currentUserId,
      [targetColumn]: product.id,
      body: body.trim(),
    });

    if (error) {
      toast.error("Erro ao enviar comentário: " + error.message);
      return;
    }

    toast.success("Comentário publicado!");
    setBody("");
    loadComments();
    setExpanded(true);
  }

  async function save(event, id) {
    event.preventDefault();
    event.stopPropagation();
    if (!editingBody.trim()) return;

    const { error } = await supabase.from("comments").update({ body: editingBody.trim() }).eq("id", id);
    if (error) {
      toast.error("Erro ao salvar: " + error.message);
      return;
    }

    toast.success("Comentário atualizado.");
    setEditingId(null);
    setEditingBody("");
    loadComments();
  }

  async function remove(event, id) {
    event.stopPropagation();
    const confirmed = await showConfirm(
      "Excluir comentário",
      "Deseja realmente apagar este comentário?",
      "Excluir",
      "Cancelar",
      true
    );
    if (!confirmed) return;

    const { error } = await supabase.from("comments").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao apagar: " + error.message);
      return;
    }

    toast.success("Comentário excluído.");
    setComments((items) => items.filter((comment) => comment.id !== id));
  }

  return (
    <div className="product-comments" onClick={(event) => event.stopPropagation()}>
      <div className="comments-toggle-row">
        <button
          type="button"
          className="ghost-button toggle-comments-btn"
          onClick={() => setExpanded(!expanded)}
        >
          <span>💬 Perguntas & Comentários ({comments.length})</span>
          <span>{expanded ? "▲ Ocultar" : "▼ Ver"}</span>
        </button>
      </div>

      {expanded && (
        <section className="comments-panel">
          {loading ? (
            <p className="hint">Carregando comentários...</p>
          ) : comments.length === 0 ? (
            <p className="hint">Nenhuma pergunta feita ainda. Tire suas dúvidas com a vendedora!</p>
          ) : (
            <div className="comment-list">
              {comments.map((comment) => (
                <article className="comment-item" key={comment.id}>
                  <div className="comment-avatar">
                    {comment.profiles?.avatar_url ? (
                      <img src={comment.profiles.avatar_url} alt="" />
                    ) : (
                      comment.profiles?.full_name?.charAt(0) || "M"
                    )}
                  </div>
                  <div className="comment-content">
                    <strong>{comment.profiles?.full_name || "Mãe da comunidade"}</strong>
                    {editingId === comment.id ? (
                      <form className="comment-edit-form" onSubmit={(event) => save(event, comment.id)}>
                        <input
                          value={editingBody}
                          onChange={(event) => setEditingBody(event.target.value)}
                          autoFocus
                        />
                        <button className="primary-button small">Salvar</button>
                        <button
                          className="ghost-button small"
                          type="button"
                          onClick={() => setEditingId(null)}
                        >
                          Cancelar
                        </button>
                      </form>
                    ) : (
                      <p>{comment.body}</p>
                    )}
                    {comment.user_id === currentUserId && editingId !== comment.id && (
                      <div className="comment-actions">
                        <button
                          type="button"
                          className="ghost-button text-btn"
                          onClick={() => {
                            setEditingId(comment.id);
                            setEditingBody(comment.body);
                          }}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="ghost-button text-btn danger-text"
                          onClick={(event) => remove(event, comment.id)}
                        >
                          Apagar
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}

          <form className="comment-form" onSubmit={submit}>
            <input
              placeholder={currentUserId ? "Pergunte sobre estado, entrega, tamanho..." : "Entre para perguntar"}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              disabled={!currentUserId}
            />
            <button className="primary-button small" disabled={!currentUserId || !body.trim()}>
              Enviar
            </button>
          </form>
        </section>
      )}
    </div>
  );
}

export default ProductComments;
