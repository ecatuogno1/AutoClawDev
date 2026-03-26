import { Router, type Router as ExpressRouter } from "express";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { ProjectHealth } from "@autoclawdev/types";
import { listProjects } from "../lib/config.js";
import { getExperiments } from "../lib/experiments.js";
import { getWorkspacePath, resolveReviewsDir, resolveMemoryDir, resolveLockPath } from "../lib/paths.js";

const router: ExpressRouter = Router();

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function computeTrend(
  experiments: Array<{ result: string }>,
): ProjectHealth["recentTrend"] {
  if (experiments.length < 4) return "unknown";
  const recent = experiments.slice(0, 5);
  const older = experiments.slice(5, 10);
  if (older.length === 0) return "unknown";
  const recentRate =
    recent.filter((e) => e.result === "pass").length / recent.length;
  const olderRate =
    older.filter((e) => e.result === "pass").length / older.length;
  if (recentRate > olderRate + 0.1) return "improving";
  if (recentRate < olderRate - 0.1) return "declining";
  return "stable";
}

// GET /api/health-matrix — cross-project health summary
router.get("/", async (_req, res) => {
  const projects = await listProjects();
  const lockDir = getWorkspacePath();

  const health: ProjectHealth[] = [];

  for (const project of projects) {
    const experiments = await getExperiments(project.key);
    const passed = experiments.filter((e) => e.result === "pass").length;
    const total = experiments.length;
    const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;

    // Check for deep review logs
    const reviewDir = resolveReviewsDir(project.path);
    let lastDeepReview: string | undefined;
    if (await fileExists(reviewDir)) {
      try {
        const files = await readdir(reviewDir);
        const metas = files
          .filter((f) => f.endsWith(".meta.txt"))
          .sort()
          .reverse();
        if (metas.length > 0) {
          const content = await readFile(join(reviewDir, metas[0]), "utf-8");
          const match = content.match(/started_at=(.+)/);
          if (match) lastDeepReview = match[1];
        }
      } catch {
        // ignore
      }
    }

    // Check memory
    const memDir = resolveMemoryDir(project.key, project.path);
    const hasMemory = await fileExists(memDir);

    // Check active run (check both new and legacy lock locations)
    const newLock = resolveLockPath(project.key, project.path);
    const legacyLock = join(lockDir, `.lock-${project.key}`);
    const activeRun = (await fileExists(newLock)) || (await fileExists(legacyLock));

    // Profile status (from last experiment metrics if available)
    const profiles: Record<string, "pass" | "fail" | "unknown"> = {};
    if (project.profile_validation) {
      for (const profileKey of Object.keys(project.profile_validation)) {
        profiles[profileKey] = "unknown";
      }
    }
    if (project.security_cmd) profiles.security = "unknown";
    if (project.performance_cmd) profiles.performance = "unknown";

    health.push({
      key: project.key,
      name: project.name,
      passRate,
      totalExperiments: total,
      recentTrend: computeTrend(experiments),
      lastRun: experiments[0]?.timestamp,
      lastDeepReview,
      hasMemory,
      profiles,
      activeRun,
    });
  }

  return res.json({ projects: health });
});

export default router;
