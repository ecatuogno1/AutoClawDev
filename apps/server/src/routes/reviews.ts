import { Router, type Router as ExpressRouter } from "express";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { getProject } from "../lib/config.js";
import { resolveReviewsDir } from "../lib/paths.js";

const router: ExpressRouter = Router();

export interface DeepReviewSession {
  provider: string;
  sessionName: string;
  startedAt: string;
  endedAt?: string;
  exitCode?: number;
  model: string;
  projectPath: string;
  ttyLog: string;
  jsonLog?: string;
  hasAuditReport: boolean;
  hasExecutionPlan: boolean;
  hasProgress: boolean;
}

export interface DeepReviewDetail extends DeepReviewSession {
  auditReport?: string;
  executionPlan?: string;
  progress?: string;
}

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

// GET /api/projects/:key/reviews — list deep review sessions
router.get("/:key/reviews", async (req, res) => {
  const project = await getProject(req.params.key);
  if (!project) return res.status(404).json({ error: "Project not found" });

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
