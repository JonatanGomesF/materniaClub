import { useNavigate } from "react-router-dom";

function PostCard({ post, onReport }) {
  const navigate = useNavigate();
  const author = post.profiles?.full_name || "Mae da comunidade";
  const city = post.profiles?.city || "materniaClub";
  const date = post.created_at
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(post.created_at))
    : "";

  function openProfile() {
    if (post.author_id) navigate(`/maes/${post.author_id}`);
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
        <button className="soft-button" onClick={(event) => event.stopPropagation()}>Comentar</button>
        <button className="ghost-button" onClick={(event) => {
          event.stopPropagation();
          onReport?.(post);
        }}>Denunciar</button>
      </div>
    </article>
  );
}

export default PostCard;
