import { Router, type Router as ExpressRouter } from "express";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { DeepReviewDetail, DeepReviewManagedRun, DeepReviewSession, RunRecord } from "@autoclawdev/types";
import { getProject } from "../lib/config.js";
import { resolveReviewsDir } from "../lib/paths.js";
import { listRunRecords, readRunEvents } from "../lib/runRecords.js";

const router: ExpressRouter = Router();

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function safeReadFile(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return undefined;
  }
}

function parseMetaFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const eq = line.indexOf("=");
    if (eq > 0) {
      result[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
    }
  }
  return result;
}

function buildSessionFromMeta(
  meta: Record<string, string>,
  fallbackName: string,
  projectPath: string,
  artifacts: { hasAuditReport: boolean; hasExecutionPlan: boolean; hasProgress: boolean },
): DeepReviewSession {
  return {
    provider: meta.provider || "claude",
    sessionName: meta.session_name || fallbackName,
    startedAt: meta.started_at || "",
    endedAt: meta.ended_at,
    exitCode: meta.exit_code ? Number(meta.exit_code) : undefined,
    model: meta.model || "unknown",
    projectPath: meta.cwd || projectPath,
    ttyLog: meta.tty_log || "",
    jsonLog: meta.json_log,
    ...artifacts,
  };
}

async function getReviewArtifactFlags(logsDir: string) {
  return {
    hasAuditReport: await fileExists(join(logsDir, "audit-report.md")),
    hasExecutionPlan: await fileExists(join(logsDir, "execution-plan.md")),
    hasProgress: await fileExists(join(logsDir, "progress.md")),
  };
}

async function getSortedMetaFiles(logsDir: string): Promise<string[]> {
  const files = await readdir(logsDir);
  return files.filter((f) => f.endsWith(".meta.txt")).sort().reverse();
}

async function buildSessionFromUnifiedRun(run: {
  reviewDetail?: DeepReviewDetail | Record<string, unknown>;
  id?: string;
  status?: string;
  createdAt: string;
  artifactRoot: string;
  summary?: string;
}): Promise<DeepReviewSession> {
  const reviewDetail =
    run.reviewDetail && typeof run.reviewDetail === "object"
      ? run.reviewDetail
      : {};
  const auditReport = await fileExists(join(run.artifactRoot, "audit-report.md"));
  const executionPlan = await fileExists(join(run.artifactRoot, "execution-plan.md"));
  const progress = await fileExists(join(run.artifactRoot, "progress.md"));

  return {
    provider: typeof reviewDetail.provider === "string" ? reviewDetail.provider : "managed",
    sessionName:
      typeof reviewDetail.sessionName === "string"
        ? reviewDetail.sessionName
        : (run.summary || run.createdAt),
    startedAt: typeof reviewDetail.startedAt === "string" ? reviewDetail.startedAt : run.createdAt,
    endedAt: typeof reviewDetail.endedAt === "string" ? reviewDetail.endedAt : undefined,
    exitCode: typeof reviewDetail.exitCode === "number" ? reviewDetail.exitCode : undefined,
    runId: typeof run.id === "string" ? run.id : undefined,
    runStatus: typeof run.status === "string" ? run.status : undefined,
    model:
      typeof reviewDetail.model === "string"
        ? reviewDetail.model
        : "managed-control-plane",
    projectPath:
      typeof reviewDetail.projectPath === "string"
        ? reviewDetail.projectPath
        : run.artifactRoot,
    ttyLog:
      typeof reviewDetail.ttyLog === "string"
        ? reviewDetail.ttyLog
        : join(run.artifactRoot, "console.log"),
    jsonLog: typeof reviewDetail.jsonLog === "string" ? reviewDetail.jsonLog : undefined,
    promptSource:
      typeof reviewDetail.promptSource === "string" ? reviewDetail.promptSource : undefined,
    resumeHint:
      typeof reviewDetail.resumeHint === "string" ? reviewDetail.resumeHint : undefined,
    generatedReports: Array.isArray(reviewDetail.generatedReports)
      ? reviewDetail.generatedReports.filter((entry): entry is string => typeof entry === "string")
      : undefined,
    hasAuditReport: auditReport,
    hasExecutionPlan: executionPlan,
    hasProgress: progress,
  };
}

function buildManagedRunSnapshot(projectPath: string, run: RunRecord): DeepReviewManagedRun {
  const latestEvents = readRunEvents(projectPath, run.id)
    .slice(-8)
    .map((event) => ({
      type: event.type,
      message: event.message,
      timestamp: event.timestamp,
    }));

  return {
    runId: run.id,
    status: run.status,
    summary: run.summary,
    workflowType: run.workflowType,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    phases: run.phases.map((phase) => ({
      name: phase.name,
      status: phase.status,
      detail: phase.detail,
      startedAt: phase.startedAt,
      completedAt: phase.completedAt,
    })),
    latestEvents,
  };
}

// GET /api/projects/:key/reviews — list deep review sessions
router.get("/:key/reviews", async (req, res) => {
  const project = await getProject(req.params.key);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const unifiedRuns = listRunRecords(project.path, 100)
    .filter((record) => record.mode === "review");
  if (unifiedRuns.length > 0) {
    const reviews = await Promise.all(unifiedRuns.map((run) => buildSessionFromUnifiedRun(run)));
    return res.json({ reviews });
  }

  const logsDir = resolveReviewsDir(project.path);
  if (!(await fileExists(logsDir))) {
    return res.json({ reviews: [] });
  }

  try {
    const metaFiles = await getSortedMetaFiles(logsDir);
    const artifacts = await getReviewArtifactFlags(logsDir);

    const reviews: DeepReviewSession[] = [];
    for (const file of metaFiles) {
      const content = await safeReadFile(join(logsDir, file));
      if (!content) continue;
      const meta = parseMetaFile(content);
      reviews.push(buildSessionFromMeta(meta, file.replace(".meta.txt", ""), project.path, artifacts));
    }

    return res.json({ reviews });
  } catch {
    return res.json({ reviews: [] });
  }
});

// GET /api/projects/:key/reviews/latest — get latest review detail
router.get("/:key/reviews/latest", async (req, res) => {
  const project = await getProject(req.params.key);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const latestUnified = listRunRecords(project.path, 100)
    .filter((record) => record.mode === "review")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (latestUnified) {
    const auditReport = await safeReadFile(join(latestUnified.artifactRoot, "audit-report.md"));
    const executionPlan = await safeReadFile(join(latestUnified.artifactRoot, "execution-plan.md"));
    const progress = await safeReadFile(join(latestUnified.artifactRoot, "progress.md"));
    return res.json({
      ...(await buildSessionFromUnifiedRun(latestUnified)),
      auditReport,
      executionPlan,
      progress,
      managedRun: buildManagedRunSnapshot(project.path, latestUnified),
    } satisfies DeepReviewDetail);
  }

  const logsDir = resolveReviewsDir(project.path);
  if (!(await fileExists(logsDir))) {
    return res.status(404).json({ error: "No reviews found" });
  }

  try {
    const metaFiles = await getSortedMetaFiles(logsDir);
    if (metaFiles.length === 0) {
      return res.status(404).json({ error: "No reviews found" });
    }

    const content = await safeReadFile(join(logsDir, metaFiles[0]));
    const meta = content ? parseMetaFile(content) : {};

    const auditReport = await safeReadFile(join(logsDir, "audit-report.md"));
    const executionPlan = await safeReadFile(join(logsDir, "execution-plan.md"));
    const progress = await safeReadFile(join(logsDir, "progress.md"));

    return res.json({
      ...buildSessionFromMeta(meta, "", project.path, {
        hasAuditReport: !!auditReport,
        hasExecutionPlan: !!executionPlan,
        hasProgress: !!progress,
      }),
      auditReport,
      executionPlan,
      progress,
    });
  } catch {
    return res.status(500).json({ error: "Failed to read reviews" });
  }
});

export default router;
