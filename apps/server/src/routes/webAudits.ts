import { existsSync, readFileSync } from "node:fs";
import { Router, type Router as ExpressRouter } from "express";
import { getProjectDetailed } from "../lib/config.js";
import { listRunRecords, readRunRecord } from "../lib/runRecords.js";
import { approveManagedRunGate } from "../lib/orchestrator.js";
import {
  readWebAuditEventsFromRoot,
  listProjectWebAuditRuns,
  readWebAuditEvents,
  readWebAuditRunDetailFromRoot,
  readWebAuditRunDetail,
  updateWebAuditRunRecord,
} from "../lib/webAudit.js";

const router: ExpressRouter = Router();

router.get("/:key/runs", async (req, res) => {
  const project = await getProjectDetailed(req.params.key);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  const unifiedRuns = listRunRecords(project.path, 100)
    .filter((record) => record.mode === "audit")
    .map((record) => readWebAuditRunDetailFromRoot(record.artifactRoot) ?? record)
    .filter(Boolean);
  if (unifiedRuns.length > 0) {
    return res.json({ runs: unifiedRuns });
  }

  return res.json({
    runs: listProjectWebAuditRuns(project.path, 50),
  });
});

router.get("/:key/runs/latest", async (req, res) => {
  const project = await getProjectDetailed(req.params.key);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  const latestUnified = listRunRecords(project.path, 100)
    .filter((record) => record.mode === "audit")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (latestUnified) {
    const detail = readWebAuditRunDetailFromRoot(latestUnified.artifactRoot);
    if (detail) {
      return res.json(detail);
    }
  }

  const latest = listProjectWebAuditRuns(project.path, 1)[0];
  if (!latest) {
    return res.status(404).json({ error: "No web audit runs found" });
  }

  const detail = readWebAuditRunDetail(project.path, latest.id);
  if (!detail) {
    return res.status(404).json({ error: "Run not found" });
  }

  return res.json(detail);
});

router.get("/:key/runs/:runId", async (req, res) => {
  const project = await getProjectDetailed(req.params.key);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  const unified = readRunRecord(project.path, req.params.runId);
  if (unified?.mode === "audit") {
    const detail = readWebAuditRunDetailFromRoot(unified.artifactRoot);
    if (!detail) {
      return res.status(404).json({ error: "Run not found" });
    }
    return res.json(detail);
  }

  const detail = readWebAuditRunDetail(project.path, req.params.runId);
  if (!detail) {
    return res.status(404).json({ error: "Run not found" });
  }

  return res.json(detail);
});

router.get("/:key/runs/:runId/events", async (req, res) => {
  const project = await getProjectDetailed(req.params.key);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  const unified = readRunRecord(project.path, req.params.runId);
  if (unified?.mode === "audit") {
    return res.json({
      events: readWebAuditEventsFromRoot(unified.artifactRoot),
    });
  }

  return res.json({
    events: readWebAuditEvents(project.path, req.params.runId),
  });
});

router.post("/:key/runs/:runId/approve", async (req, res) => {
  const project = await getProjectDetailed(req.params.key);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  const gate =
    typeof req.body?.gate === "string" && req.body.gate.trim().length > 0
      ? req.body.gate.trim()
      : "";
  if (!gate) {
    return res.status(400).json({ error: "gate is required" });
  }

  const unified = readRunRecord(project.path, req.params.runId);
  if (unified?.mode === "audit") {
    const record = await approveManagedRunGate({
      runId: req.params.runId,
      gate,
      approver: typeof req.body?.approver === "string" ? req.body.approver : undefined,
      note: typeof req.body?.note === "string" ? req.body.note : undefined,
    });
    if (!record) {
      return res.status(404).json({ error: "Run not found" });
    }
    return res.json({
      run: readWebAuditRunDetailFromRoot(record.artifactRoot) ?? record,
    });
  }

  const updated = updateWebAuditRunRecord(project.path, req.params.runId, (record) => {
    const escalationApprovals = {
      ...record.policy.escalationApprovals,
      [gate]: true,
    };
    const approvalsPending = record.approvalsPending.filter((item) => item !== gate);
    const currentApprovedGates = record.approvedGates ?? [];
    const approvedGates = currentApprovedGates.includes(gate)
      ? currentApprovedGates
      : [...currentApprovedGates, gate];

    return {
      ...record,
      status: "running",
      approvalsPending,
      approvedGates,
      policy: {
        ...record.policy,
        escalationApprovals,
      },
    };
  });

  if (!updated) {
    return res.status(404).json({ error: "Run not found" });
  }

  return res.json({ run: updated });
});

router.get("/:key/runs/:runId/export", async (req, res) => {
  const project = await getProjectDetailed(req.params.key);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  const detail = readWebAuditRunDetail(project.path, req.params.runId);
  if (!detail) {
    return res.status(404).json({ error: "Run not found" });
  }

  const format = typeof req.query.format === "string" ? req.query.format : "json";
  const exportPath =
    format === "html"
      ? detail.exports.html
      : format === "md"
        ? detail.exports.markdown
        : format === "pdf"
          ? detail.exports.pdf
          : detail.exports.json;

  if (!exportPath || !existsSync(exportPath)) {
    return res.status(404).json({ error: `Export not found for format ${format}` });
  }

  if (format === "json") {
    return res.json(JSON.parse(readFileSync(exportPath, "utf-8")));
  }

  if (format === "html") {
    return res.type("text/html").send(readFileSync(exportPath, "utf-8"));
  }

  if (format === "md") {
    return res.type("text/markdown").send(readFileSync(exportPath, "utf-8"));
  }

  if (format === "pdf") {
    return res.type("application/pdf").send(readFileSync(exportPath));
  }

  return res.status(400).json({ error: `Unsupported export format ${format}` });
});

export default router;
