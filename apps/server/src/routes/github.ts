import { Router, type Router as ExpressRouter } from "express";
import { execSync } from "node:child_process";
import { getProject } from "../lib/config.js";

const router: ExpressRouter = Router();

// ── In-memory TTL cache for GitHub API calls ─────────────────────────
interface CacheEntry {
  data: unknown;
  timestamp: number;
}

const ghCache = new Map<string, CacheEntry>();
const GH_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCached<T>(key: string): T | undefined {
  const entry = ghCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > GH_CACHE_TTL_MS) {
    ghCache.delete(key);
    return undefined;
  }
  return entry.data as T;
}

function setCache(key: string, data: unknown): void {
  ghCache.set(key, { data, timestamp: Date.now() });
}

function ghExec(args: string): unknown[] {
  try {
    const result = execSync(`gh ${args}`, {
      encoding: "utf-8",
      timeout: 15000,
    });
    return JSON.parse(result);
  } catch {
    return [];
  }
}

function cachedGhExec(cacheKey: string, args: string): unknown[] {
  const cached = getCached<unknown[]>(cacheKey);
  if (cached) return cached;
  const result = ghExec(args);
  setCache(cacheKey, result);
  return result;
}

router.get("/:key", async (req, res) => {
  const project = await getProject(req.params.key);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if (!project.gh_repo) {
    res.json({ issues: [], prs: [], upstreamIssues: [] });
    return;
  }

  const issues = cachedGhExec(
    `issues:${project.gh_repo}`,
    `issue list --repo ${project.gh_repo} --state open --json number,title,labels,createdAt --limit 20`,
  );
  const prs = cachedGhExec(
    `prs:${project.gh_repo}`,
    `pr list --repo ${project.gh_repo} --state all --json number,title,state,createdAt --limit 10`,
  );

  let upstreamIssues: unknown[] = [];
  if (project.gh_upstream) {
    upstreamIssues = cachedGhExec(
      `issues:${project.gh_upstream}`,
      `issue list --repo ${project.gh_upstream} --state open --json number,title,labels,createdAt --limit 20`,
    );
  }

  res.json({ issues, prs, upstreamIssues });
});

export default router;
