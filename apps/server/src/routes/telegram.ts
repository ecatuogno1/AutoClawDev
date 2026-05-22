import { Router, type Router as ExpressRouter } from "express";
import { telegramControlService } from "../integrations/telegram/service.js";

const router: ExpressRouter = Router();

router.get("/status", (_req, res) => {
  res.json(telegramControlService.getStatus());
});

export default router;
