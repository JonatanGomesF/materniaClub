import db from "../config/db.js";

export const createProduto = (req, res) => {

  const { user_id, titulo, descricao, preco, tipo, categoria, cidade } = req.body;

  const sql = `
    INSERT INTO produtos
    (user_id, titulo, descricao, preco, tipo, categoria, cidade)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(sql,
    [user_id, titulo, descricao, preco, tipo, categoria, cidade],
    (err, result) => {

      if (err) {
        return res.status(500).json(err);
      }

      res.json({ message: "Produto criado" });

  });

};

export const getProdutos = (req, res) => {

  const sql = `
    SELECT produtos.*, users.nome
    FROM produtos
    LEFT JOIN users ON produtos.user_id = users.id
    ORDER BY produtos.created_at DESC
  `;

  db.query(sql, (err, result) => {

    if (err) return res.status(500).json(err);

    res.json(result);

  });

};

