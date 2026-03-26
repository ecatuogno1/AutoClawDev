import { Router, type Router as ExpressRouter } from "express";
import { getAllExperiments } from "../lib/experiments.js";

const router: ExpressRouter = Router();

router.get("/", async (_req, res) => {
  try {
    const experiments = await getAllExperiments();
    res.json(experiments);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
