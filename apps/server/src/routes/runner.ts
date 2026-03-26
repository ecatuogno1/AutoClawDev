import { Router, type Router as ExpressRouter } from "express";
import { startRun, stopRun, getActiveRuns } from "../lib/process.js";

const router: ExpressRouter = Router();

router.post("/run", async (req, res) => {
  const { project, cycles = 1 } = req.body ?? {};
  if (!project) {
    res.status(400).json({ error: "project is required" });
    return;
  }
  const requestedCycles = Number(cycles);
  const normalizedCycles = Number.isFinite(requestedCycles)
    ? Math.min(25, Math.max(1, requestedCycles))
    : 1;

  const started = await startRun(project, normalizedCycles);
  if (!started) {
    res.status(409).json({ error: "Run already active or runner not found" });
    return;
  }
  res.json({ ok: true, project, cycles: normalizedCycles });
});

router.post("/stop", (req, res) => {
  const { project } = req.body ?? {};
  if (!project) {
    res.status(400).json({ error: "project is required" });
    return;
  }
  const stopped = stopRun(project);
  if (!stopped) {
    res.status(404).json({ error: "No active run found" });
    return;
  }
  res.json({ ok: true, project });
});

router.get("/active", (_req, res) => {
  res.json(getActiveRuns());
});

export default router;
