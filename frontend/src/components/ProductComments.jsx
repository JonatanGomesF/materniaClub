import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

function ProductComments({ currentUserId, product }) {
  const [comments, setComments] = useState([]);
  const [body, setBody] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingBody, setEditingBody] = useState("");
  const [loading, setLoading] = useState(true);
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
    if (error) alert(error.message);
    else setComments(data || []);
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
    if (!currentUserId) return alert("Faca login para comentar.");
    if (!body.trim()) return;
    const { error } = await supabase.from("comments").insert({ user_id: currentUserId, [targetColumn]: product.id, body: body.trim() });
    if (error) return alert(error.message);
    setBody("");
    loadComments();
  }

  async function save(event, id) {
    event.preventDefault();
    event.stopPropagation();
    if (!editingBody.trim()) return;
    const { error } = await supabase.from("comments").update({ body: editingBody.trim() }).eq("id", id);
    if (error) return alert(error.message);
    setEditingId(null);
    setEditingBody("");
    loadComments();
  }

  async function remove(event, id) {
    event.stopPropagation();
    if (!window.confirm("Apagar este comentario?")) return;
    const { error } = await supabase.from("comments").delete().eq("id", id);
    if (error) return alert(error.message);
    setComments((items) => items.filter((comment) => comment.id !== id));
  }

  return <div className="product-comments" onClick={(event) => event.stopPropagation()}>
    <section className="comments-panel">
      <h4>Comentarios</h4>
      {loading ? <p className="hint">Carregando comentarios...</p> : comments.length === 0 ? <p className="hint">Este produto ainda nao tem comentarios.</p> : <div className="comment-list">
        {comments.map((comment) => <article className="comment-item" key={comment.id}>
          <div className="comment-avatar">{comment.profiles?.full_name?.charAt(0) || "M"}</div>
          <div className="comment-content">
            <strong>{comment.profiles?.full_name || "Mae da comunidade"}</strong>
            {editingId === comment.id ? <form className="comment-edit-form" onSubmit={(event) => save(event, comment.id)}>
              <input value={editingBody} onChange={(event) => setEditingBody(event.target.value)} autoFocus />
              <button className="primary-button small">Salvar</button>
              <button className="ghost-button" type="button" onClick={() => setEditingId(null)}>Cancelar</button>
            </form> : <p>{comment.body}</p>}
            {comment.user_id === currentUserId && editingId !== comment.id && <div className="comment-actions">
              <button className="ghost-button" onClick={() => { setEditingId(comment.id); setEditingBody(comment.body); }}>Editar</button>
              <button className="ghost-button danger-text" onClick={(event) => remove(event, comment.id)}>Apagar</button>
            </div>}
          </div>
        </article>)}
      </div>}
      <form className="comment-form" onSubmit={submit}>
        <input placeholder={currentUserId ? "Comente sobre este produto" : "Entre para comentar"} value={body} onChange={(event) => setBody(event.target.value)} disabled={!currentUserId} />
        <button className="primary-button small" disabled={!currentUserId || !body.trim()}>Enviar</button>
      </form>
    </section>
  </div>;
}

export default ProductComments;
