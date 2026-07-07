import db from "../config/db.js";
import bcrypt from "bcrypt";

export const registerUser = async (req, res) => {

  const { nome, email, senha, cidade } = req.body;

  try {

    const senhaHash = await bcrypt.hash(senha, 10);

    const sql = `
      INSERT INTO users (nome, email, senha, cidade)
      VALUES (?, ?, ?, ?)
    `;

    db.query(sql, [nome, email, senhaHash, cidade], (err) => {

      if (err) return res.status(500).json(err);

      res.json({ message: "Usuário criado com sucesso" });

    });

  } catch (error) {
    res.status(500).json(error);
  }

};

export const loginUser = (req, res) => {

  const { email, senha } = req.body;

  const sql = "SELECT * FROM users WHERE email = ?";

  db.query(sql, [email], async (err, result) => {

    if (err) return res.status(500).json(err);

    if (result.length === 0) {
      return res.status(400).json({ message: "Usuário não encontrado" });
    }

    const user = result[0];

    const senhaValida = await bcrypt.compare(senha, user.senha);

    if (!senhaValida) {
      return res.status(400).json({ message: "Senha incorreta" });
    }

    res.json({
      message: "Login realizado",
      user: {
        id: user.id,
        nome: user.nome,
        email: user.email
      }
    });

  });

};

export const getUsers = (req, res) => {

  db.query("SELECT * FROM users", (err, result) => {

    if (err) return res.status(500).json(err);

    res.json(result);

  });

};