export const demoPosts = [
  {
    id: "demo-post-1",
    body: "Achei fralda tamanho M com 38% de desconto hoje. Vale muito olhar antes de acabar.",
    image_url: "https://images.unsplash.com/photo-1546015720-b8b30df5aa27?auto=format&fit=crop&w=900&q=80",
    category: "promocao",
    created_at: new Date().toISOString(),
    profiles: { full_name: "Camila Rocha", city: "Sao Paulo", status: "active" },
  },
  {
    id: "demo-post-2",
    body: "Minha bebe nao se adaptou a esta mamadeira. Alguem aqui usa esse modelo?",
    image_url: "https://images.unsplash.com/photo-1519689680058-324335c77eba?auto=format&fit=crop&w=900&q=80",
    category: "duvida",
    created_at: new Date(Date.now() - 3600000).toISOString(),
    profiles: { full_name: "Fernanda Lima", city: "Curitiba", status: "active" },
  },
];

export const demoProducts = [
  {
    id: "demo-product-1",
    title: "Carrinho compacto rose",
    price: 420,
    condition: "seminovo",
    category: "carrinho",
    city: "Sao Paulo",
    image_url: "https://images.unsplash.com/photo-1590649880765-91b1956b8276?auto=format&fit=crop&w=900&q=80",
    profiles: { full_name: "Juliana Prado" },
  },
  {
    id: "demo-product-2",
    title: "Bebe conforto ate 13kg",
    price: 260,
    condition: "usado",
    category: "bebe conforto",
    city: "Campinas",
    image_url: "https://images.unsplash.com/photo-1522771930-78848d9293e8?auto=format&fit=crop&w=900&q=80",
    profiles: { full_name: "Marina Alves" },
  },
  {
    id: "demo-product-3",
    title: "Kit mamadeiras anti-colica",
    price: 89.9,
    condition: "novo",
    category: "mamadeiras",
    city: "Rio de Janeiro",
    image_url: "https://images.unsplash.com/photo-1596870230751-ebdfce98ec42?auto=format&fit=crop&w=900&q=80",
    profiles: { full_name: "Bianca Torres" },
  },
];

export const demoStats = {
  users: 128,
  posts: 342,
  products: 76,
  reports: 9,
};
