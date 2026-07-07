import express from "express";
import { sendMensagem, getMensagens } from "../controllers/mensagensController.js";

const router = express.Router();

router.post("/", sendMensagem);
router.get("/", getMensagens);

export default router;