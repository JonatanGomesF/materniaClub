import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

function PostCard({ post, onDelete, onLike, onReport, onUpdate, currentUserId }) {
  const navigate = useNavigate();
  const [commentsOpen, setCommentsOpen] = useState(true);
  const [comments, setComments] = useState([]);
  const [commentBody, setCommentBody] = useState("");
  const [editingPost, setEditingPost] = useState(false);
  const [editBody, setEditBody] = useState(post.body || post.texto || "");
  const [editPrice, setEditPrice] = useState(post.price || "");
  const [editCategory, setEditCategory] = useState(post.category || "promocao");
  const [editFile, setEditFile] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editingBody, setEditingBody] = useState("");
  const [loadingComments, setLoadingComments] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const author = post.profiles?.full_name || "Mae da comunidade";
  const city = post.profiles?.city || "materniaClub";
  const date = post.created_at
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(post.created_at))
    : "";
  const likesCount = post.likes_count || 0;
  const isOwner = currentUserId && post.author_id === currentUserId;
  const createdAtMs = post.created_at ? new Date(post.created_at).getTime() : 0;
  const canEditPost = Boolean(isOwner && createdAtMs && now && now - createdAtMs <= 5 * 60 * 1000);
  const price = post.price || post.price === 0
    ? Number(post.price).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : null;

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

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

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

  function startPostEdit(event) {
    event.stopPropagation();
    setEditBody(post.body || post.texto || "");
    setEditPrice(post.price || "");
    setEditCategory(post.category || "promocao");
    setEditFile(null);
    setEditingPost(true);
  }

  async function savePostEdit(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!editBody.trim()) return;
    await onUpdate?.(post, {
      body: editBody,
      price: editPrice,
      category: editCategory,
      image_url: post.image_url || post.imagem || null,
    }, editFile);
    setEditingPost(false);
    setEditFile(null);
  }

  return (
    <article className="post-card clickable-card" onClick={openProfile}>
      <div className="card-header">
        <div className="avatar">
          {post.profiles?.avatar_url ? <img src={post.profiles.avatar_url} alt="" /> : author.charAt(0)}
        </div>
        <div>
          <h3>{author}</h3>
          <p>{city} · {date}</p>
        </div>
        <span className="tag">{post.category || "conversa"}</span>
      </div>

      {editingPost ? (
        <form className="post-edit-form" onClick={(event) => event.stopPropagation()} onSubmit={savePostEdit}>
          <textarea value={editBody} onChange={(event) => setEditBody(event.target.value)} />
          <div className="form-grid">
            <input type="number" min="0" step="0.01" placeholder="Valor do produto" value={editPrice} onChange={(event) => setEditPrice(event.target.value)} />
            <select value={editCategory} onChange={(event) => setEditCategory(event.target.value)}>
              <option value="promocao">Promocao</option>
              <option value="duvida">Duvida</option>
              <option value="desapego">Desapego</option>
              <option value="experiencia">Experiencia</option>
            </select>
          </div>
          <label className="image-picker">
            <input type="file" accept="image/*" onChange={(event) => setEditFile(event.target.files?.[0] || null)} />
            <span>{editFile ? editFile.name : "Trocar imagem da publicacao"}</span>
          </label>
          <div className="card-actions">
            <button className="primary-button small">Salvar edicao</button>
            <button className="ghost-button small" type="button" onClick={() => setEditingPost(false)}>Cancelar</button>
          </div>
        </form>
      ) : (
        <p className="post-body">{post.body || post.texto}</p>
      )}

      {price && <strong className="post-price">{price}</strong>}

      {post.image_url || post.imagem ? (
        <img className="post-image" src={post.image_url || post.imagem} alt="Publicacao da comunidade" />
      ) : null}

      <div className="card-actions">
        <span className="post-like-count">{likesCount} {likesCount === 1 ? "curtida" : "curtidas"}</span>
        {onLike && (
          <button className={post.liked_by_me ? "soft-button active-like" : "soft-button"} onClick={(event) => {
            event.stopPropagation();
            onLike(post);
          }}>
            {post.liked_by_me ? "Curtiu" : "Curtir"}
          </button>
        )}
        <button className="soft-button" onClick={toggleComments}>{commentsOpen ? "Ocultar comentarios" : "Ver comentarios"}</button>
        <button className="ghost-button" onClick={(event) => {
          event.stopPropagation();
          onReport?.(post);
        }}>Denunciar</button>
        {isOwner && canEditPost && onUpdate && <button className="soft-button" onClick={startPostEdit}>Editar publicacao</button>}
        {isOwner && onDelete && <button className="danger-button" onClick={(event) => {
          event.stopPropagation();
          onDelete(post);
        }}>Excluir publicacao</button>}
        {isOwner && !canEditPost && <span className="post-lock-note">Edicao encerrada</span>}
      </div>

      {commentsOpen && <section className="comments-panel" onClick={(event) => event.stopPropagation()}>
        <h4>Comentarios</h4>
        {loadingComments ? <p className="hint">Carregando comentarios...</p> : comments.length === 0 ? <p className="hint">Seja a primeira pessoa a comentar.</p> : <div className="comment-list">
          {comments.map((comment) => <article className="comment-item" key={comment.id}>
            <div className="comment-avatar">
              {comment.profiles?.avatar_url ? <img src={comment.profiles.avatar_url} alt="" /> : comment.profiles?.full_name?.charAt(0) || "M"}
            </div>
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
