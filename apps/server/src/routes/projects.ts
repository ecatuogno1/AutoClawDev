import { Router, type Router as ExpressRouter } from "express";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import type { ExecutionKind, ProjectExecutionModeSummary, ProjectExecutionSummary, RunRecord } from "@autoclawdev/types";
import { listProjects, getProject, getProjectDetailed } from "../lib/config.js";
import { getWorkspacePath, resolveCyclesDir } from "../lib/paths.js";
import { buildProjectStatsFromRuns, listProjectHistory, readLatestRunConsole } from "../lib/history.js";
import { getActiveRuns, parseRunnerLine } from "../lib/process.js";
import { runPreflight } from "../lib/preflight.js";
import { readWebAuditRunDetailFromRoot } from "../lib/webAudit.js";

const router: ExpressRouter = Router();

function isAuditBackedRecord(record: RunRecord | undefined): boolean {
  return Boolean(record?.artifactRoot && readWebAuditRunDetailFromRoot(record.artifactRoot));
}

function inferExecutionKind(record: RunRecord | undefined): ExecutionKind | undefined {
  if (!record) return undefined;
  if (record.mode === "run" || record.mode === "review" || record.mode === "build" || record.mode === "audit") {
    return record.mode;
  }
  if (isAuditBackedRecord(record)) {
    return "audit";
  }
  return undefined;
}

function latestRunForMode(runs: RunRecord[], mode: ExecutionKind): RunRecord | undefined {
  return [...runs]
    .filter((run) => run.mode === mode || (mode === "audit" && isAuditBackedRecord(run)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

function extractRunPhases(record: RunRecord | undefined): ProjectExecutionModeSummary["phases"] {
  if (!record || !Array.isArray(record.phases)) return [];
  return record.phases.map((phase) => ({
    name: phase.name,
    status: phase.status,
    detail: phase.detail,
  }));
}

function canResumeRun(mode: ExecutionKind, record: RunRecord | undefined): boolean {
  if (!record) return false;
  if (mode !== "review" && mode !== "audit") return false;
  return record.status !== "running" && record.status !== "queued" && record.status !== "completed";
}

function summarizeModeRecord(mode: ExecutionKind, record: RunRecord | undefined, activeRecord?: RunRecord): ProjectExecutionModeSummary {
  const auditDetail =
    mode === "audit" && record
      ? readWebAuditRunDetailFromRoot(record.artifactRoot)
      : undefined;
  const auditApprovalsPending = auditDetail?.approvalsPending ?? [];

  return {
    mode,
    runId: record?.id,
    status: auditDetail?.status ?? record?.status,
    summary: auditDetail?.summary ?? record?.summary,
    updatedAt: auditDetail?.updatedAt ?? record?.updatedAt,
    active: activeRecord?.id === record?.id,
    canResume: canResumeRun(mode, record),
    approvalsPending: auditApprovalsPending,
    phases: extractRunPhases(record),
  };
}

router.get("/", async (_req, res) => {
  const projects = await listProjects();
  const withStats = await Promise.all(
    projects.map(async (p) => {
      const runs = await listProjectHistory(p.key, 500);
      const stats = buildProjectStatsFromRuns(runs, { project: p.key });
      return { ...p, stats };
    }),
  );
  res.json(withStats);
});

router.get("/:key/preflight", async (req, res) => {
  const project = await getProjectDetailed(req.params.key);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.json(await runPreflight(project, "run"));
});

router.get("/:key", async (req, res) => {
  const project = await getProject(req.params.key);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const runs = await listProjectHistory(project.key, 500);
  const stats = buildProjectStatsFromRuns(runs, { project: project.key });
  res.json({
    ...project,
    stats,
    recentRuns: runs.slice(0, 20),
  });
});

router.get("/:key/history", async (req, res) => {
  const project = await getProjectDetailed(req.params.key);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const runs = await listProjectHistory(project.key, 250);
  res.json({ runs });
});

router.get("/:key/executions", async (req, res) => {
  const project = await getProjectDetailed(req.params.key);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const runs = await listProjectHistory(project.key, 250);
  const activeRun = getActiveRuns().find((run) => run.project === project.key);
  const activeRawRecord = activeRun?.runId
    ? runs.find((run) => run.id === activeRun.runId)
    : runs
        .filter((run) => run.status === "running" || run.status === "queued" || run.status === "awaiting_approval")
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const runSummary = summarizeModeRecord("run", latestRunForMode(runs, "run"), activeRawRecord);
  const reviewSummary = summarizeModeRecord("review", latestRunForMode(runs, "review"), activeRawRecord);
  const buildSummary = summarizeModeRecord("build", latestRunForMode(runs, "build"), activeRawRecord);
  const auditSummary = summarizeModeRecord("audit", latestRunForMode(runs, "audit"), activeRawRecord);
  const latestOverallRaw = [...runs]
    .filter((run) => Boolean(inferExecutionKind(run)))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const latestOverall = latestOverallRaw
    ? summarizeModeRecord(inferExecutionKind(latestOverallRaw) ?? "run", latestOverallRaw, activeRawRecord)
    : null;
  const activeRecord = activeRawRecord
    ? summarizeModeRecord(inferExecutionKind(activeRawRecord) ?? "run", activeRawRecord, activeRawRecord)
    : null;

  const payload: ProjectExecutionSummary = {
    projectKey: project.key,
    activeRun,
    activeRecord,
    latestOverall,
    latestByMode: {
      run: runSummary,
      review: reviewSummary,
      build: buildSummary,
      audit: auditSummary,
    },
  };

  res.json(payload);
});

router.get("/:key/cycles", async (req, res) => {
  const key = req.params.key;
  const project = await getProject(key);
  const cyclesDir = resolveCyclesDir(key, project?.path);
  if (!existsSync(cyclesDir)) {
    res.json([]);
    return;
  }
  const files = readdirSync(cyclesDir)
    .filter((f) => f.startsWith(`${key}-exp-`) && f.endsWith(".json"))
    .sort()
    .reverse()
    .slice(0, 20);
  const cycles = files
    .map((f) => {
      try {
        return JSON.parse(readFileSync(`${cyclesDir}/${f}`, "utf8"));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  res.json(cycles);
});

router.get("/:key/cycles/:cycleId", async (req, res) => {
  const { key, cycleId } = req.params;
  const file = getWorkspacePath("cycles", `${key}-${cycleId}.json`);
  if (!existsSync(file)) {
    res.status(404).json({ error: "Cycle not found" });
    return;
  }
  try {
    res.json(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    res.status(500).json({ error: "Failed to read cycle" });
  }
});

router.get("/:key/lastlog", async (req, res) => {
  const key = req.params.key;
  const project = await getProjectDetailed(key);
  if (project) {
    const latest = readLatestRunConsole(project.path);
    if (latest.source) {
      const events = latest.lines.map((line) => parseRunnerLine(key, line));
      res.json({ lines: latest.lines, events, source: latest.source });
      return;
    }
  }
  // Try project-specific log first, then generic
  const candidates = [
    getWorkspacePath(`run-${key}.log`),
    getWorkspacePath("run.log"),
    getWorkspacePath("nightly.log"),
  ];
  for (const logFile of candidates) {
    if (existsSync(logFile)) {
      try {
        const content = readFileSync(logFile, "utf8");
        const cleanedLines = content
          .replace(
            // eslint-disable-next-line no-control-regex
            /\x1b\[[0-9;]*[a-zA-Z]/g,
            "",
          )
          .split("\n")
          .map((line) => line.trimEnd())
          .filter((line) => line.trim().length > 0)
          .slice(-200);
        const events = cleanedLines.map((line) => parseRunnerLine(key, line));
        res.json({ lines: cleanedLines, events, source: logFile });
        return;
      } catch {
        continue;
      }
    }
  }
  res.json({ lines: [], events: [], source: null });
});

export default router;
