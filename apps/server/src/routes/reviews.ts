import { Router, type Router as ExpressRouter } from "express";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { getProject } from "../lib/config.js";

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

// GET /api/projects/:key/reviews — list deep review sessions
router.get("/:key/reviews", async (req, res) => {
  const project = await getProject(req.params.key);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const logsDir = join(project.path, ".deep-review-logs");
  if (!(await fileExists(logsDir))) {
    return res.json({ reviews: [] });
  }

  try {
    const files = await readdir(logsDir);
    const metaFiles = files
      .filter((f) => f.endsWith(".meta.txt"))
      .sort()
      .reverse();

    const reviews: DeepReviewSession[] = [];
    for (const file of metaFiles) {
      const content = await safeReadFile(join(logsDir, file));
      if (!content) continue;
      const meta = parseMetaFile(content);

      reviews.push({
        provider: meta.provider || "claude",
        sessionName: meta.session_name || file.replace(".meta.txt", ""),
        startedAt: meta.started_at || "",
        endedAt: meta.ended_at,
        exitCode: meta.exit_code ? Number(meta.exit_code) : undefined,
        model: meta.model || "unknown",
        projectPath: meta.cwd || project.path,
        ttyLog: meta.tty_log || "",
        jsonLog: meta.json_log,
        hasAuditReport: await fileExists(join(logsDir, "audit-report.md")),
        hasExecutionPlan: await fileExists(join(logsDir, "execution-plan.md")),
        hasProgress: await fileExists(join(logsDir, "progress.md")),
      });
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

  const logsDir = join(project.path, ".deep-review-logs");
  if (!(await fileExists(logsDir))) {
    return res.status(404).json({ error: "No reviews found" });
  }

  const auditReport = await safeReadFile(join(logsDir, "audit-report.md"));
  const executionPlan = await safeReadFile(join(logsDir, "execution-plan.md"));
  const progress = await safeReadFile(join(logsDir, "progress.md"));

  // Find latest meta file
  try {
    const files = await readdir(logsDir);
    const metaFiles = files
      .filter((f) => f.endsWith(".meta.txt"))
      .sort()
      .reverse();

    if (metaFiles.length === 0) {
      return res.status(404).json({ error: "No reviews found" });
    }

    const content = await safeReadFile(join(logsDir, metaFiles[0]));
    const meta = content ? parseMetaFile(content) : {};

    return res.json({
      provider: meta.provider || "claude",
      sessionName: meta.session_name || "",
      startedAt: meta.started_at || "",
      endedAt: meta.ended_at,
      exitCode: meta.exit_code ? Number(meta.exit_code) : undefined,
      model: meta.model || "unknown",
      projectPath: meta.cwd || project.path,
      ttyLog: meta.tty_log || "",
      jsonLog: meta.json_log,
      hasAuditReport: !!auditReport,
      hasExecutionPlan: !!executionPlan,
      hasProgress: !!progress,
      auditReport,
      executionPlan,
      progress,
    });
  } catch {
    return res.status(500).json({ error: "Failed to read reviews" });
  }
});

export default router;
