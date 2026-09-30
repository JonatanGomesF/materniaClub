import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useToast } from "../lib/toastContext";

function PostCard({ post, onDelete, onInterest, onLike, onReport, onStatusChange, onUpdate, currentUserId }) {
  const navigate = useNavigate();
  const { toast, showConfirm } = useToast();
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentBody, setCommentBody] = useState("");
  const [editingPost, setEditingPost] = useState(false);
  const [editBody, setEditBody] = useState(post.body || post.texto || "");
  const [editPrice, setEditPrice] = useState(post.price || "");
  const [editCategory, setEditCategory] = useState(post.category || "promocao");
  const [editFile, setEditFile] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editingBody, setEditingBody] = useState("");
  const [loadingComments, setLoadingComments] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const isStorePublication = post.is_store_publication || post.profiles?.account_type === "store";
  const isStoreProduct = Boolean(post.store_product_id);
  const isUnavailable = post.status === "sold";
  const author = post.profiles?.full_name || "Mãe da comunidade";
  const city = post.profiles?.city || "Brasil";
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

  function openProfile(e) {
    if (e.target.closest("button") || e.target.closest("input") || e.target.closest("textarea") || e.target.closest("form")) {
      return;
    }

    if (isStorePublication) {
      const storeQuery = post.store_id ? `?store=${post.store_id}${post.store_product_id ? `&produto=${post.store_product_id}` : ""}` : "";
      navigate(`/lojas${storeQuery}`);
      return;
    }
    if (post.author_id) navigate(`/maes/${post.author_id}`);
  }

  async function loadComments() {
    if (!supabase || !post.id || isStoreProduct) {
      setLoadingComments(false);
      return;
    }
    setLoadingComments(true);
    const { data, error } = await supabase
      .from("comments")
      .select("*, profiles(full_name, avatar_url)")
      .eq("post_id", post.id)
      .eq("status", "published")
      .order("created_at", { ascending: true });

    if (error) {
      console.warn("Erro ao carregar comentários:", error.message);
    } else {
      setComments(data || []);
    }
    setLoadingComments(false);
  }

  useEffect(() => {
    if (!supabase || !post.id || isStoreProduct) return undefined;
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
      });

    return () => {
      active = false;
    };
  }, [isStoreProduct, post.id]);

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
    if (!currentUserId) {
      toast.info("Faça login para comentar nesta publicação.");
      return;
    }
    if (!commentBody.trim()) return;

    const { error } = await supabase.from("comments").insert({
      user_id: currentUserId,
      post_id: post.id,
      body: commentBody.trim(),
    });

    if (error) {
      toast.error("Erro ao enviar comentário: " + error.message);
      return;
    }

    toast.success("Comentário publicado!");
    setCommentBody("");
    loadComments();
  }

  async function saveComment(event, commentId) {
    event.preventDefault();
    event.stopPropagation();
    if (!editingBody.trim()) return;

    const { error } = await supabase.from("comments").update({ body: editingBody.trim() }).eq("id", commentId);
    if (error) {
      toast.error("Erro ao salvar comentário: " + error.message);
      return;
    }

    toast.success("Comentário editado!");
    setEditingId(null);
    setEditingBody("");
    loadComments();
  }

  async function deleteComment(event, commentId) {
    event.stopPropagation();
    const confirmed = await showConfirm("Excluir comentário", "Deseja realmente apagar este comentário?", "Excluir", "Cancelar", true);
    if (!confirmed) return;

    const { error } = await supabase.from("comments").delete().eq("id", commentId);
    if (error) {
      toast.error("Erro ao apagar: " + error.message);
      return;
    }

    toast.success("Comentário excluído.");
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
    <article
      className={`post-card clickable-card ${isUnavailable ? "unavailable-card" : ""} ${isStorePublication ? "store-sponsored-card" : ""}`}
      onClick={openProfile}
    >
      {/* HEADER */}
      <div className="card-header">
        <div className="avatar-wrapper">
          <div className="avatar">
            {post.profiles?.avatar_url ? <img src={post.profiles.avatar_url} alt="" /> : author.charAt(0)}
          </div>
          {isStorePublication && <span className="store-badge-indicator" title="Loja Verificada">✓</span>}
        </div>

        <div className="card-header-info">
          <div className="post-author-line">
            <strong>{author}</strong>
            {isStorePublication ? (
              <span className="verified-store-tag">Loja Verificada</span>
            ) : (
              <span className="user-city-tag">{city}</span>
            )}
          </div>
          <div className="post-meta-line">
            <span className="post-category-tag">{post.category || "Promoção"}</span>
            {date && <span className="post-date-tag">{date}</span>}
          </div>
        </div>

        {/* TOP ACTIONS */}
        <div className="card-header-actions" onClick={(e) => e.stopPropagation()}>
          {onReport && (
            <button
              type="button"
              className="ghost-button icon-btn-small"
              onClick={() => onReport(post)}
              title="Denunciar publicação"
            >
              ⚑
            </button>
          )}
          {isOwner && canEditPost && !editingPost && (
            <button
              type="button"
              className="ghost-button icon-btn-small"
              onClick={startPostEdit}
              title="Editar (disponível por 5 min)"
            >
              ✎
            </button>
          )}
          {isOwner && onDelete && (
            <button
              type="button"
              className="ghost-button danger-text icon-btn-small"
              onClick={() => onDelete(post)}
              title="Excluir publicação"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* EDIT FORM (INLINE) */}
      {editingPost ? (
        <form className="post-edit-inline" onSubmit={savePostEdit} onClick={(e) => e.stopPropagation()}>
          <textarea
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            required
            rows={3}
          />
          <div className="edit-inline-row">
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="Preço (opcional)"
              value={editPrice}
              onChange={(e) => setEditPrice(e.target.value)}
            />
            <select value={editCategory} onChange={(e) => setEditCategory(e.target.value)}>
              <option value="promocao">Promoção</option>
              <option value="duvida">Dúvida</option>
              <option value="desapego">Desapego</option>
              <option value="experiencia">Experiência</option>
            </select>
          </div>
          <div className="edit-inline-actions">
            <button type="submit" className="primary-button small">Salvar Alterações</button>
            <button type="button" className="ghost-button small" onClick={() => setEditingPost(false)}>Cancelar</button>
          </div>
        </form>
      ) : (
        /* POST CONTENT */
        <div className="post-content">
          <p className="post-text">{post.body || post.texto}</p>

          {price && (
            <div className="post-price-badge">
              <span className="price-label">Oferta:</span>
              <strong>{price}</strong>
            </div>
          )}

          {(post.image_url || post.imagem) && (
            <div className="post-image-box">
              <img src={post.image_url || post.imagem} alt="Foto da publicação" loading="lazy" />
            </div>
          )}
        </div>
      )}

      {/* ACTION BAR */}
      <div className="card-actions-bar" onClick={(e) => e.stopPropagation()}>
        {onLike && (
          <button
            type="button"
            className={`action-button ${post.liked_by_me ? "active-liked" : ""}`}
            onClick={() => onLike(post)}
          >
            <span className="action-icon">{post.liked_by_me ? "♥" : "♡"}</span>
            <span>{likesCount} {likesCount === 1 ? "Curtida" : "Curtidas"}</span>
          </button>
        )}

        {!isStoreProduct && (
          <button
            type="button"
            className="action-button"
            onClick={toggleComments}
          >
            <span className="action-icon">💬</span>
            <span>{comments.length} {comments.length === 1 ? "Comentário" : "Comentários"}</span>
          </button>
        )}

        {isStorePublication && (
          <button
            type="button"
            className="primary-button small store-buy-btn"
            onClick={() => {
              if (onInterest) onInterest(post);
              else openProfile({ target: {} });
            }}
          >
            {isStoreProduct ? "Comprar / Conversar com Loja" : "Ver Loja Parceira"}
          </button>
        )}

        {isOwner && onStatusChange && (
          <button
            type="button"
            className="soft-button small"
            onClick={() => onStatusChange(post, isUnavailable ? "published" : "sold")}
          >
            {isUnavailable ? "Reativar Publicação" : "Marcar Vendido"}
          </button>
        )}
      </div>

      {/* COMMENTS SECTION */}
      {commentsOpen && !isStoreProduct && (
        <div className="post-comments-wrapper" onClick={(e) => e.stopPropagation()}>
          <div className="comments-header">
            <h4>Comentários da Comunidade</h4>
          </div>

          {loadingComments ? (
            <p className="hint">Carregando comentários...</p>
          ) : comments.length === 0 ? (
            <p className="hint">Ainda não há comentários. Seja a primeira a responder!</p>
          ) : (
            <div className="comments-thread">
              {comments.map((comment) => (
                <div className="comment-bubble" key={comment.id}>
                  <div className="comment-avatar">
                    {comment.profiles?.avatar_url ? (
                      <img src={comment.profiles.avatar_url} alt="" />
                    ) : (
                      comment.profiles?.full_name?.charAt(0) || "M"
                    )}
                  </div>
                  <div className="comment-body-area">
                    <div className="comment-meta-user">
                      <strong>{comment.profiles?.full_name || "Mãe da comunidade"}</strong>
                    </div>

                    {editingId === comment.id ? (
                      <form className="comment-edit-inline" onSubmit={(e) => saveComment(e, comment.id)}>
                        <input
                          value={editingBody}
                          onChange={(e) => setEditingBody(e.target.value)}
                          autoFocus
                        />
                        <button className="primary-button small">Salvar</button>
                        <button type="button" className="ghost-button small" onClick={() => setEditingId(null)}>
                          Cancelar
                        </button>
                      </form>
                    ) : (
                      <p>{comment.body}</p>
                    )}

                    {comment.user_id === currentUserId && editingId !== comment.id && (
                      <div className="comment-inline-actions">
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
                          onClick={(e) => deleteComment(e, comment.id)}
                        >
                          Excluir
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <form className="comment-composer-inline" onSubmit={createComment}>
            <input
              placeholder={currentUserId ? "Escreva uma resposta carinhosa..." : "Entre para comentar"}
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              disabled={!currentUserId}
            />
            <button className="primary-button small" disabled={!currentUserId || !commentBody.trim()}>
              Enviar
            </button>
          </form>
        </div>
      )}
    </article>
  );
}

export default PostCard;
