import { Router, type Router as ExpressRouter } from "express";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { MemoryFinding, ProjectMemory } from "@autoclawdev/types";
import { getWorkspacePath, resolveMemoryDir } from "../lib/paths.js";
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

  const memDir = resolveMemoryDir(req.params.key, project.path);

  const projectMemoryRaw = await safeReadFile(join(memDir, "project-memory.json"));
  let projectMemory: Record<string, unknown> | null = null;
  if (projectMemoryRaw) {
    try {
      projectMemory = JSON.parse(projectMemoryRaw);
    } catch {
      return res.status(500).json({ error: "Corrupted project-memory.json" });
    }
  }

  const findingMemory = await safeReadJsonl(join(memDir, "finding-memory.jsonl"));
  const fileMemory = await safeReadJsonl(join(memDir, "file-memory.jsonl"));

  // Parse project-memory.json into structured fields
  const summary =
    typeof projectMemory?.summary === "string" ? projectMemory.summary : null;
  const updatedAt =
    typeof projectMemory?.updated_at === "string" ? projectMemory.updated_at : null;
  const sourceCommit =
    typeof projectMemory?.source_commit === "string" ? projectMemory.source_commit : null;
  const hotspots: ProjectMemory["hotspots"] = Array.isArray(projectMemory?.hotspots)
    ? projectMemory.hotspots
    : [];

  // Parse findings into structured format
  const findings: MemoryFinding[] = findingMemory.map((f: Record<string, unknown>) => ({
    title: (f.title || f.finding || f.description || "") as string,
    directive: (f.directive || "unknown") as string,
    domain: (f.domain || "unknown") as string,
    status: (f.status || "unknown") as string,
    targetFiles: Array.isArray(f.target_files) ? f.target_files : [],
    firstSeenExp: (f.first_seen_exp || null) as string | null,
    lastSeenExp: (f.last_seen_exp || null) as string | null,
    resolutionCommit: (f.resolution_commit || null) as string | null,
    notes: (f.notes || null) as string | null,
    updatedAt: (f.updated_at || null) as string | null,
  }));

  const openFindings = findings.filter((f) => f.status === "open");
  const resolvedFindings = findings.filter((f) => f.status !== "open");

  const memory: ProjectMemory = {
    project: req.params.key,
    summary,
    updatedAt,
    sourceCommit,
    hotspots,
    openFindings,
    resolvedFindings,
    fileMemoryCount: fileMemory.length,
    totalFindings: findings.length,
  };

  return res.json(memory);
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
