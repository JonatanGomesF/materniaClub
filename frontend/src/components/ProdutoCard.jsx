import { useNavigate } from "react-router-dom";
import ProductComments from "./ProductComments";

function ProdutoCard({
  currentUserId,
  interestLabel = "Tenho interesse",
  onDelete,
  onInterest,
  onLike,
  onOpenDetails,
  onReport,
  onStatusChange,
  produto,
  profilePath,
  userLocation,
}) {
  const navigate = useNavigate();
  const price = Number(produto.price ?? produto.preco ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
  const isOwner = currentUserId && produto.seller_id === currentUserId;
  const likesCount = produto.likes_count || 0;
  const isUnavailable = produto.status === "sold";

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

    if (distance < 1) return "📍 a menos de 1 km";
    return `📍 a ${Math.round(distance)} km`;
  }

  const distanceLabel = getDistanceLabel();

  function handleClick(e) {
    if (e.target.closest("button") || e.target.closest("input") || e.target.closest("textarea") || e.target.closest("form")) {
      return;
    }

    if (onOpenDetails) {
      onOpenDetails(produto);
      return;
    }
    if (profilePath === null) return;
    if (profilePath) navigate(profilePath);
    else if (produto.seller_id) navigate(`/maes/${produto.seller_id}`);
  }

  return (
    <article
      className={`market-card clickable-card ${isUnavailable ? "unavailable-card" : ""}`}
      onClick={handleClick}
    >
      <div className="market-media">
        {produto.image_url || produto.imagem ? (
          <img src={produto.image_url || produto.imagem} alt={produto.title || produto.titulo} loading="lazy" />
        ) : (
          <div className="no-media-placeholder">
            <span>Sem foto</span>
          </div>
        )}
        <span className="market-category">{produto.category || "Desapego"}</span>
        {isUnavailable && <span className="unavailable-ribbon">Vendido</span>}
      </div>

      <div className="market-info">
        <div className="market-title-row">
          <div>
            <h3>{produto.title || produto.titulo}</h3>
            <p className="market-condition-city">
              <span className="condition-tag">{produto.condition || "Seminovo"}</span>
              <span>{produto.city || "Brasil"}</span>
            </p>
          </div>
          <strong className="market-price-tag">{price}</strong>
        </div>

        <div className="market-meta">
          {distanceLabel && <span className="distance-badge">{distanceLabel}</span>}
          <span className="likes-badge">♥ {likesCount}</span>
        </div>

        <p className="seller-line">
          Por <strong>{produto.profiles?.full_name || produto.nome || "Mãe do clube"}</strong>
        </p>

        {(onLike || onInterest || onDelete || onReport || onStatusChange) && (
          <div className="market-actions" onClick={(e) => e.stopPropagation()}>
            {onLike && (
              <button
                type="button"
                className={`soft-button ${produto.liked_by_me ? "active-like" : ""}`}
                onClick={() => onLike(produto)}
              >
                {produto.liked_by_me ? "♥ Salvo" : "♡ Salvar"}
              </button>
            )}

            {!isOwner && onInterest && !isUnavailable && (
              <button
                type="button"
                className="primary-button"
                onClick={() => onInterest(produto)}
              >
                {interestLabel}
              </button>
            )}

            {isOwner && onStatusChange && (
              <button
                type="button"
                className="soft-button"
                onClick={() => onStatusChange(produto, isUnavailable ? "active" : "sold")}
              >
                {isUnavailable ? "Liberar Venda" : "Marcar Vendido"}
              </button>
            )}

            {isOwner && onDelete && (
              <button
                type="button"
                className="danger-button"
                onClick={() => onDelete(produto)}
              >
                Excluir
              </button>
            )}

            {onReport && !isOwner && (
              <button
                type="button"
                className="ghost-button icon-btn-small"
                onClick={() => onReport(produto)}
                title="Denunciar anúncio"
              >
                ⚑
              </button>
            )}
          </div>
        )}

        <ProductComments currentUserId={currentUserId} product={produto} />
      </div>
    </article>
  );
}

export default ProdutoCard;
