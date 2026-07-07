import db from "../config/db.js";

export const sendMensagem = (req, res) => {

  const { remetente_id, destinatario_id, mensagem } = req.body;

  const sql = `
    INSERT INTO mensagens
    (remetente_id, destinatario_id, mensagem)
    VALUES (?, ?, ?)
  `;

  db.query(sql,
    [remetente_id, destinatario_id, mensagem],
    (err, result) => {

      if (err) {
        return res.status(500).json(err);
      }

      res.json({ message: "Mensagem enviada" });

  });

};

export const getMensagens = (req, res) => {

  db.query("SELECT * FROM mensagens", (err, result) => {

    if (err) {
      return res.status(500).json(err);
    }

    res.json(result);

  });

};