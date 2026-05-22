import { Router, type Router as ExpressRouter } from "express";
import { existsSync, readFileSync } from "node:fs";
import type { RunMode } from "@autoclawdev/types";
import { getActiveRuns } from "../lib/process.js";
import {
  approveManagedRunGate,
  getRunRecordById,
  getRunEventsById,
  listAllRunRecords,
  resumeManagedRun,
  startManagedRun,
  updateRunRecoveryState,
} from "../lib/orchestrator.js";
import {
  readWebAuditEventsFromRoot,
  readWebAuditRunDetailFromRoot,
} from "../lib/webAudit.js";

const router: ExpressRouter = Router();

function isSupportedMode(mode: unknown): mode is RunMode {
  return mode === "run" || mode === "review" || mode === "build" || mode === "audit";
}

router.get("/", async (_req, res) => {
  const runs = await listAllRunRecords(250);
  res.json({
    active: getActiveRuns(),
    runs,
  });
});

router.post("/", async (req, res) => {
  const { project, cycles = 1, dryRun = false, mode = "run" } = req.body ?? {};
  if (!project) {
    res.status(400).json({ error: "project is required" });
    return;
  }
  if (!isSupportedMode(mode)) {
    res.status(400).json({ error: "mode must be run, review, build, or audit" });
    return;
  }

  try {
    const result = await startManagedRun({
      projectKey: String(project),
      cycles: Number(cycles),
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
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to start run",
    });
  }
});

router.get("/:runId", async (req, res) => {
  const located = await getRunRecordById(req.params.runId);
  if (!located) {
    res.status(404).json({ error: "Run not found" });
    return;
  }

  const events = await getRunEventsById(req.params.runId);
  if (located.record.mode === "audit") {
    const auditDetail = readWebAuditRunDetailFromRoot(located.record.artifactRoot);
    return res.json({
      run: located.record,
      events,
      auditDetail,
    });
  }

  res.json({
    run: located.record,
    events,
  });
});

router.get("/:runId/events", async (req, res) => {
  const located = await getRunRecordById(req.params.runId);
  if (!located) {
    res.status(404).json({ error: "Run not found" });
    return;
  }

  const events = located.record.mode === "audit"
    ? readWebAuditEventsFromRoot(located.record.artifactRoot)
    : await getRunEventsById(req.params.runId);
  if (events.length === 0) {
    res.status(404).json({ error: "Run events not found" });
    return;
  }
  res.json({ events });
});

router.post("/:runId/approve", async (req, res) => {
  const gate =
    typeof req.body?.gate === "string" && req.body.gate.trim().length > 0
      ? req.body.gate.trim()
      : "";
  if (!gate) {
    res.status(400).json({ error: "gate is required" });
    return;
  }

  const record = await approveManagedRunGate({
    runId: req.params.runId,
    gate,
    approver: typeof req.body?.approver === "string" ? req.body.approver : undefined,
    note: typeof req.body?.note === "string" ? req.body.note : undefined,
  });

  if (!record) {
    res.status(404).json({ error: "Run not found" });
    return;
  }

  res.json({ run: record });
});

router.post("/:runId/resume", async (req, res) => {
  const result = await resumeManagedRun({
    runId: req.params.runId,
    approveGates: Array.isArray(req.body?.approveGates)
      ? req.body.approveGates
          .map((entry: unknown) => String(entry).trim())
          .filter(Boolean)
      : undefined,
  });

  if (!result.ok) {
    res.status(409).json(result);
    return;
  }

  res.json(result);
});

router.get("/:runId/recovery-summary", async (req, res) => {
  const located = await getRunRecordById(req.params.runId);
  if (!located) {
    res.status(404).json({ error: "Run not found" });
    return;
  }

  const summaryPath = located.record.recovery?.summaryPath;
  if (!summaryPath || !existsSync(summaryPath)) {
    res.status(404).json({ error: "Recovery summary not found" });
    return;
  }

  res.type("text/plain").send(readFileSync(summaryPath, "utf-8"));
});

router.post("/:runId/recovery", async (req, res) => {
  const action = req.body?.action;
  if (action !== "resolve" && action !== "abandon") {
    res.status(400).json({ error: "action must be resolve or abandon" });
    return;
  }

  const record = await updateRunRecoveryState({
    runId: req.params.runId,
    action,
    note: typeof req.body?.note === "string" ? req.body.note : undefined,
  });

  if (!record) {
    res.status(404).json({ error: "Run not found" });
    return;
  }

  res.json({ run: record });
});

export default router;
