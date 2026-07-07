import express from "express";
import { createProduto, getProdutos } from "../controllers/produtosController.js";

const router = express.Router();

router.post("/", createProduto);
router.get("/", getProdutos);

export default router;