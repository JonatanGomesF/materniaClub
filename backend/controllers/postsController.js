import db from "../config/db.js";

export const createPost = (req, res) => {

  const { user_id, texto, imagem } = req.body;

  const sql = `
    INSERT INTO posts (user_id, texto, imagem)
    VALUES (?, ?, ?)
  `;

  db.query(sql, [user_id, texto, imagem], (err, result) => {

    if (err) {
      return res.status(500).json(err);
    }

    res.json({ message: "Post criado" });

  });

};

export const getPosts = (req, res) => {

  const sql = `
  SELECT posts.*, users.nome
  FROM posts
  JOIN users ON posts.user_id = users.id
  ORDER BY posts.created_at DESC
  `;

  db.query(sql, (err, result) => {

    if (err) {
      return res.status(500).json(err);
    }

    res.json(result);

  });

};