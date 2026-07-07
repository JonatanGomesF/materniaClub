function ProdutoCard({ produto, currentUserId, onDelete, onReport, userLocation }) {
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

  return (
    <article className="product-card">
      <div className="product-media">
        {produto.image_url || produto.imagem ? (
          <img src={produto.image_url || produto.imagem} alt={produto.title || produto.titulo} />
        ) : (
          <span>Sem foto</span>
        )}
      </div>
      <div className="product-info">
        <div>
          <span className="tag">{produto.category || "produto"}</span>
          <h3>{produto.title || produto.titulo}</h3>
          <p>{produto.condition || "seminovo"} - {produto.city || "Brasil"}</p>
          {distanceLabel && <p className="distance-pill">{distanceLabel}</p>}
        </div>
        <strong>{price}</strong>
        <p>Publicado por {produto.profiles?.full_name || produto.nome || "uma usuaria"}</p>
        <div className="card-actions">
          <button className="primary-button">Tenho interesse</button>
          {isOwner && <button className="danger-button" onClick={() => onDelete?.(produto)}>Excluir publicacao</button>}
          <button className="ghost-button" onClick={() => onReport?.(produto)}>Denunciar</button>
        </div>
      </div>
    </article>
  );
}

export default ProdutoCard;
