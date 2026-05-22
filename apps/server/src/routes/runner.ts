import { Router, type Router as ExpressRouter } from "express";
import type { RunMode } from "@autoclawdev/types";
import { getActiveRuns } from "../lib/process.js";
import { startManagedRun, stopManagedRun } from "../lib/orchestrator.js";

const router: ExpressRouter = Router();

function isSupportedMode(mode: unknown): mode is RunMode {
  return mode === "run" || mode === "review" || mode === "build" || mode === "audit";
}

router.post("/run", async (req, res) => {
  const { project, cycles = 1, dryRun = false, mode = "run" } = req.body ?? {};
  if (!project) {
    res.status(400).json({ error: "project is required" });
    return;
  }
  if (!isSupportedMode(mode)) {
    res.status(400).json({ error: "mode must be run, review, build, or audit" });
    return;
  }
  const requestedCycles = Number(cycles);
  const normalizedCycles = Number.isFinite(requestedCycles)
    ? Math.min(25, Math.max(1, requestedCycles))
    : 1;

  const result = await startManagedRun({
    projectKey: String(project),
    cycles: normalizedCycles,
    mode,
    dryRun: Boolean(dryRun),
    target: typeof req.body?.target === "string" ? req.body.target : undefined,
    auditMode: req.body?.auditMode === "deep" ? "deep" : "triage",
    ownedTarget: Boolean(req.body?.ownedTarget),
    authorizationNote:
      typeof req.body?.authorizationNote === "string"
        ? req.body.authorizationNote
        : undefined,
  });
  if (!result.ok) {
    res.status(result.preflight.ok ? 409 : 412).json(result);
    return;
  }
  res.json(result);
});

router.post("/stop", async (req, res) => {
  const { project } = req.body ?? {};
  if (!project) {
    res.status(400).json({ error: "project is required" });
    return;
  }
  const stopped = await stopManagedRun(String(project));
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
