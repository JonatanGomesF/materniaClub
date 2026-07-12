import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

function PostCard({ post, onReport, currentUserId }) {
  const navigate = useNavigate();
  const [commentsOpen, setCommentsOpen] = useState(true);
  const [comments, setComments] = useState([]);
  const [commentBody, setCommentBody] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingBody, setEditingBody] = useState("");
  const [loadingComments, setLoadingComments] = useState(true);
  const author = post.profiles?.full_name || "Mae da comunidade";
  const city = post.profiles?.city || "materniaClub";
  const date = post.created_at
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(post.created_at))
    : "";

  function openProfile() {
    if (post.author_id) navigate(`/maes/${post.author_id}`);
  }

  async function loadComments() {
    if (!supabase || !post.id) return;
    setLoadingComments(true);
    const { data, error } = await supabase.from("comments").select("*, profiles(full_name, avatar_url)").eq("post_id", post.id).eq("status", "published").order("created_at", { ascending: true });
    if (error) alert(error.message);
    else setComments(data || []);
    setLoadingComments(false);
  }

  useEffect(() => {
    if (!supabase || !post.id) return;
    let active = true;
    supabase
      .from("comments")
      .select("*, profiles(full_name, avatar_url)")
      .eq("post_id", post.id)
      .eq("status", "published")
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (!active) return;
        if (!error) setComments(data || []);
        setLoadingComments(false);
      });

    return () => {
      active = false;
    };
  }, [post.id]);

  async function toggleComments(event) {
    event.stopPropagation();
    const willOpen = !commentsOpen;
    setCommentsOpen(willOpen);
    if (willOpen) await loadComments();
  }

  async function createComment(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!currentUserId) return alert("Faca login para comentar.");
    if (!commentBody.trim()) return;
    const { error } = await supabase.from("comments").insert({ user_id: currentUserId, post_id: post.id, body: commentBody.trim() });
    if (error) return alert(error.message);
    setCommentBody("");
    loadComments();
  }

  async function saveComment(event, commentId) {
    event.preventDefault();
    event.stopPropagation();
    if (!editingBody.trim()) return;
    const { error } = await supabase.from("comments").update({ body: editingBody.trim() }).eq("id", commentId);
    if (error) return alert(error.message);
    setEditingId(null);
    setEditingBody("");
    loadComments();
  }

  async function deleteComment(event, commentId) {
    event.stopPropagation();
    if (!window.confirm("Apagar este comentario?")) return;
    const { error } = await supabase.from("comments").delete().eq("id", commentId);
    if (error) return alert(error.message);
    setComments((current) => current.filter((comment) => comment.id !== commentId));
  }

  return (
    <article className="post-card clickable-card" onClick={openProfile}>
      <div className="card-header">
        <div className="avatar">{author.charAt(0)}</div>
        <div>
          <h3>{author}</h3>
          <p>{city} · {date}</p>
        </div>
        <span className="tag">{post.category || "conversa"}</span>
      </div>

      <p className="post-body">{post.body || post.texto}</p>

      {post.image_url || post.imagem ? (
        <img className="post-image" src={post.image_url || post.imagem} alt="Publicacao da comunidade" />
      ) : null}

      <div className="card-actions">
        <button className="soft-button" onClick={(event) => event.stopPropagation()}>Curtir</button>
        <button className="soft-button" onClick={toggleComments}>{commentsOpen ? "Ocultar comentarios" : "Ver comentarios"}</button>
        <button className="ghost-button" onClick={(event) => {
          event.stopPropagation();
          onReport?.(post);
        }}>Denunciar</button>
      </div>

      {commentsOpen && <section className="comments-panel" onClick={(event) => event.stopPropagation()}>
        <h4>Comentarios</h4>
        {loadingComments ? <p className="hint">Carregando comentarios...</p> : comments.length === 0 ? <p className="hint">Seja a primeira pessoa a comentar.</p> : <div className="comment-list">
          {comments.map((comment) => <article className="comment-item" key={comment.id}>
            <div className="comment-avatar">{comment.profiles?.full_name?.charAt(0) || "M"}</div>
            <div className="comment-content">
              <strong>{comment.profiles?.full_name || "Mae da comunidade"}</strong>
              {editingId === comment.id ? <form className="comment-edit-form" onSubmit={(event) => saveComment(event, comment.id)}>
                <input value={editingBody} onChange={(event) => setEditingBody(event.target.value)} autoFocus />
                <button className="primary-button small">Salvar</button>
                <button className="ghost-button" type="button" onClick={() => setEditingId(null)}>Cancelar</button>
              </form> : <p>{comment.body}</p>}
              {comment.user_id === currentUserId && editingId !== comment.id && <div className="comment-actions">
                <button className="ghost-button" onClick={() => { setEditingId(comment.id); setEditingBody(comment.body); }}>Editar</button>
                <button className="ghost-button danger-text" onClick={(event) => deleteComment(event, comment.id)}>Apagar</button>
              </div>}
            </div>
          </article>)}
        </div>}
        <form className="comment-form" onSubmit={createComment}>
          <input placeholder={currentUserId ? "Escreva um comentario" : "Entre para comentar"} value={commentBody} onChange={(event) => setCommentBody(event.target.value)} disabled={!currentUserId} />
          <button className="primary-button small" disabled={!currentUserId || !commentBody.trim()}>Enviar</button>
        </form>
      </section>}
    </article>
  );
}

export default PostCard;
