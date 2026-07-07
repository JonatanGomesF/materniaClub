import express from "express";
import cors from "cors";

import usersRoutes from "./routes/users.js";
import postsRoutes from "./routes/posts.js";
import produtosRoutes from "./routes/produtos.js";
import mensagensRoutes from "./routes/mensagens.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/users", usersRoutes);
app.use("/posts", postsRoutes);
app.use("/produtos", produtosRoutes);
app.use("/mensagens", mensagensRoutes);

const PORT = 5000;

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});