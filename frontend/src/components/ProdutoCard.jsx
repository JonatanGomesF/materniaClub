import { useNavigate } from "react-router-dom";

function ProdutoCard({ currentUserId, onDelete, onInterest, onLike, onReport, produto, profilePath, userLocation }) {
  const navigate = useNavigate();
  const price = Number(produto.price ?? produto.preco ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
  const isOwner = currentUserId && produto.seller_id === currentUserId;

  function getDistanceLabel() {
    if (!userLocation || !produto.latitude || !produto.longitude) return null;

    const toRadians = (value) => (value * Math.PI) / 180;
    const earthRadiusKm = 6371;
    const dLat = toRadians(Number(produto.latitude) - userLocation.latitude);
    const dLon = toRadians(Number(produto.longitude) - userLocation.longitude);
    const lat1 = toRadians(userLocation.latitude);
    const lat2 = toRadians(Number(produto.latitude));
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    const distance = earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    if (distance < 1) return "a menos de 1 km de voce";
    return `a ${Math.round(distance)} km de voce`;
  }

  const distanceLabel = getDistanceLabel();

  function openProfile() {
    if (profilePath === null) return;
    if (profilePath) navigate(profilePath);
    else if (produto.seller_id) navigate(`/maes/${produto.seller_id}`);
  }

  return (
    <article className="market-card clickable-card" onClick={openProfile}>
      <div className="market-media">
        {produto.image_url || produto.imagem ? (
          <img src={produto.image_url || produto.imagem} alt={produto.title || produto.titulo} />
        ) : (
          <span>Sem foto</span>
        )}
        <span className="market-category">{produto.category || "produto"}</span>
      </div>

      <div className="market-info">
        <div className="market-title-row">
          <div>
            <h3>{produto.title || produto.titulo}</h3>
            <p>{produto.condition || "seminovo"} - {produto.city || "Brasil"}</p>
          </div>
          <strong>{price}</strong>
        </div>

        <div className="market-meta">
          {distanceLabel && <span>{distanceLabel}</span>}
          <span>{produto.likes_count || 0} curtidas</span>
        </div>

        <p className="seller-line">Publicado por {produto.profiles?.full_name || produto.nome || "uma usuaria"}</p>

        {(onLike || onInterest || onDelete || onReport) && (
          <div className="market-actions">
            {onLike && (
              <button className={produto.liked_by_me ? "soft-button active-like" : "soft-button"} onClick={(event) => {
                event.stopPropagation();
                onLike(produto);
              }}>
                Curtir
              </button>
            )}
            {!isOwner && onInterest && <button className="primary-button" onClick={(event) => {
              event.stopPropagation();
              onInterest(produto);
            }}>Tenho interesse</button>}
            {isOwner && onDelete && <button className="danger-button" onClick={(event) => {
              event.stopPropagation();
              onDelete(produto);
            }}>Excluir publicacao</button>}
            {onReport && <button className="ghost-button" onClick={(event) => {
              event.stopPropagation();
              onReport(produto);
            }}>Denunciar</button>}
          </div>
        )}
      </div>
    </article>
  );
}

export default ProdutoCard;
