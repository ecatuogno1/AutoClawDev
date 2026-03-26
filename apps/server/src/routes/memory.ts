import { Router, type Router as ExpressRouter } from "express";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { getWorkspacePath } from "../lib/paths.js";
import { getProject } from "../lib/config.js";

const router: ExpressRouter = Router();

async function safeReadFile(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return undefined;
  }
}

async function safeReadJsonl(path: string): Promise<any[]> {
  const content = await safeReadFile(path);
  if (!content) return [];
  return content
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

// GET /api/projects/:key/memory — get project memory
router.get("/:key/memory", async (req, res) => {
  const project = await getProject(req.params.key);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const memDir = getWorkspacePath("memory", req.params.key);

  const projectMemoryRaw = await safeReadFile(join(memDir, "project-memory.json"));
  const projectMemory = projectMemoryRaw ? JSON.parse(projectMemoryRaw) : null;

  const findingMemory = await safeReadJsonl(join(memDir, "finding-memory.jsonl"));
  const fileMemory = await safeReadJsonl(join(memDir, "file-memory.jsonl"));

  // Parse project-memory.json into structured fields
  const summary = projectMemory?.summary || null;
  const updatedAt = projectMemory?.updated_at || null;
  const sourceCommit = projectMemory?.source_commit || null;
  const hotspots: Array<{ path: string; count: number }> = Array.isArray(projectMemory?.hotspots)
    ? projectMemory.hotspots
    : [];

  // Parse findings into structured format
  const findings = findingMemory.map((f: any) => ({
    title: f.title || f.finding || f.description || "",
    directive: f.directive || "unknown",
    domain: f.domain || "unknown",
    status: f.status || "unknown",
    targetFiles: Array.isArray(f.target_files) ? f.target_files : [],
    firstSeenExp: f.first_seen_exp || null,
    lastSeenExp: f.last_seen_exp || null,
    resolutionCommit: f.resolution_commit || null,
    notes: f.notes || null,
    updatedAt: f.updated_at || null,
  }));

  const openFindings = findings.filter((f: any) => f.status === "open");
  const resolvedFindings = findings.filter((f: any) => f.status !== "open");

  return res.json({
    project: req.params.key,
    summary,
    updatedAt,
    sourceCommit,
    hotspots,
    openFindings,
    resolvedFindings,
    fileMemoryCount: fileMemory.length,
    totalFindings: findings.length,
  });
});

// GET /api/memory/overview — cross-project memory summary
router.get("/overview", async (_req, res) => {
  const memBase = getWorkspacePath("memory");
  try {
    const dirs = await readdir(memBase);
    const summary: Array<{
      project: string;
      findingsCount: number;
      fileMemoryCount: number;
      hasProjectMemory: boolean;
    }> = [];

    for (const dir of dirs) {
      const projMem = await safeReadFile(
        join(memBase, dir, "project-memory.json"),
      );
      const findings = await safeReadJsonl(
        join(memBase, dir, "finding-memory.jsonl"),
      );
      const fileMem = await safeReadJsonl(
        join(memBase, dir, "file-memory.jsonl"),
      );

      summary.push({
        project: dir,
        findingsCount: findings.length,
        fileMemoryCount: fileMem.length,
        hasProjectMemory: !!projMem,
      });
    }

    return res.json({ projects: summary });
  } catch {
    return res.json({ projects: [] });
  }
});

export default router;
