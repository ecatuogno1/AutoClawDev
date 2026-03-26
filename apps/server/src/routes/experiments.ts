import { Router, type Router as ExpressRouter } from "express";
import { getAllExperiments } from "../lib/experiments.js";

const router: ExpressRouter = Router();

router.get("/", async (_req, res) => {
  const experiments = await getAllExperiments();
  res.json(experiments);
});

export default router;
