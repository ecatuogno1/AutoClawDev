import { Router, type Request, type Response, type Router as ExpressRouter } from "express";
import { readdir, readFile, writeFile, stat, mkdir } from "node:fs/promises";
import { join, relative, extname, basename } from "node:path";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { homedir } from "node:os";
import { getProject } from "../lib/config.js";

const router: ExpressRouter = Router();

// ── Helpers ──────────────────────────────────────────────────────────

function resolveProjectPath(projectKey: string | undefined): string {
  return homedir(); // default to home; project resolution happens in route handlers
}

async function safeStat(path: string) {
  try {
    return await stat(path);
  } catch {
    return null;
  }
}

function getLanguage(filename: string): string {
  const ext = extname(filename).toLowerCase();
  const map: Record<string, string> = {
    ".ts": "typescript", ".tsx": "typescript", ".js": "javascript", ".jsx": "javascript",
    ".json": "json", ".md": "markdown", ".css": "css", ".scss": "scss",
    ".html": "html", ".xml": "xml", ".yaml": "yaml", ".yml": "yaml",
    ".py": "python", ".rs": "rust", ".go": "go", ".rb": "ruby",
    ".sh": "bash", ".bash": "bash", ".zsh": "bash",
    ".sql": "sql", ".graphql": "graphql",
    ".toml": "toml", ".ini": "ini", ".env": "plaintext",
    ".swift": "swift", ".kt": "kotlin", ".java": "java",
    ".c": "c", ".cpp": "cpp", ".h": "c",
    ".vue": "vue", ".svelte": "svelte",
  };
  return map[ext] || "plaintext";
}

// ── File listing ─────────────────────────────────────────────────────

interface FileEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  language?: string;
}

router.get("/files", async (req: Request, res: Response) => {
  const projectKey = req.query.project as string | undefined;
  const dirPath = req.query.path as string | undefined;

  let basePath = homedir();
  if (projectKey) {
    const project = await getProject(projectKey);
    if (project?.path) basePath = project.path;
  }

  const targetDir = dirPath ? join(basePath, dirPath) : basePath;

  // Security: ensure we're not escaping the project root
  const resolved = join(targetDir);
  if (!resolved.startsWith(basePath)) {
    return res.status(403).json({ error: "Path escapes project root" });
  }

  if (!existsSync(resolved)) {
    return res.status(404).json({ error: "Directory not found" });
  }

  try {
    const entries = await readdir(resolved, { withFileTypes: true });
    const files: FileEntry[] = [];

    const skip = new Set([
      "node_modules", ".git", ".next", "dist", "build", ".output",
      ".cache", "__pycache__", ".DS_Store", ".autoclaw",
    ]);

    for (const entry of entries) {
      if (skip.has(entry.name)) continue;
      if (entry.name.startsWith(".") && entry.name !== ".env.example") continue;

      const entryPath = relative(basePath, join(resolved, entry.name));

      if (entry.isDirectory()) {
        files.push({ name: entry.name, path: entryPath, type: "directory" });
      } else {
        const s = await safeStat(join(resolved, entry.name));
        files.push({
          name: entry.name,
          path: entryPath,
          type: "file",
          size: s?.size,
          language: getLanguage(entry.name),
        });
      }
    }

    // Sort: directories first, then alphabetical
    files.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return res.json({ path: relative(basePath, resolved) || ".", entries: files });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

// ── File read ────────────────────────────────────────────────────────

router.get("/file", async (req: Request, res: Response) => {
  const projectKey = req.query.project as string | undefined;
  const filePath = req.query.path as string;

  if (!filePath) return res.status(400).json({ error: "path is required" });

  let basePath = homedir();
  if (projectKey) {
    const project = await getProject(projectKey);
    if (project?.path) basePath = project.path;
  }

  const resolved = join(basePath, filePath);
  if (!resolved.startsWith(basePath)) {
    return res.status(403).json({ error: "Path escapes project root" });
  }

  if (!existsSync(resolved)) {
    return res.status(404).json({ error: "File not found" });
  }

  try {
    const s = await stat(resolved);
    if (s.size > 2 * 1024 * 1024) {
      return res.status(413).json({ error: "File too large (>2MB)" });
    }

    const content = await readFile(resolved, "utf-8");
    return res.json({
      path: filePath,
      name: basename(resolved),
      content,
      language: getLanguage(basename(resolved)),
      size: s.size,
    });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

// ── File write ───────────────────────────────────────────────────────

router.post("/file", async (req: Request, res: Response) => {
  const { project: projectKey, path: filePath, content } = req.body ?? {};

  if (!filePath || content === undefined) {
    return res.status(400).json({ error: "path and content are required" });
  }

  let basePath = homedir();
  if (projectKey) {
    const proj = await getProject(projectKey);
    if (proj?.path) basePath = proj.path;
  }

  const resolved = join(basePath, filePath);
  if (!resolved.startsWith(basePath)) {
    return res.status(403).json({ error: "Path escapes project root" });
  }

  try {
    await mkdir(join(resolved, ".."), { recursive: true });
    await writeFile(resolved, content, "utf-8");
    return res.json({ ok: true, path: filePath });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

// ── Git status ───────────────────────────────────────────────────────

router.get("/git/status", async (req: Request, res: Response) => {
  const projectKey = req.query.project as string | undefined;

  let cwd = homedir();
  if (projectKey) {
    const project = await getProject(projectKey);
    if (project?.path) cwd = project.path;
  }

  try {
    const status = execSync("git status --porcelain", { cwd, encoding: "utf-8", timeout: 5000 });
    const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd, encoding: "utf-8", timeout: 5000 }).trim();
    const lastCommit = execSync("git log --oneline -1", { cwd, encoding: "utf-8", timeout: 5000 }).trim();

    const files = status.trim().split("\n").filter(Boolean).map((line) => ({
      status: line.slice(0, 2).trim(),
      path: line.slice(3),
    }));

    return res.json({ branch, lastCommit, files, clean: files.length === 0 });
  } catch {
    return res.json({ branch: "unknown", lastCommit: "", files: [], clean: true, error: "Not a git repo" });
  }
});

// ── Git diff ─────────────────────────────────────────────────────────

router.get("/git/diff", async (req: Request, res: Response) => {
  const projectKey = req.query.project as string | undefined;
  const filePath = req.query.file as string | undefined;

  let cwd = homedir();
  if (projectKey) {
    const project = await getProject(projectKey);
    if (project?.path) cwd = project.path;
  }

  try {
    const cmd = filePath ? `git diff -- "${filePath}"` : "git diff";
    const diff = execSync(cmd, { cwd, encoding: "utf-8", timeout: 10000 });
    return res.json({ diff });
  } catch {
    return res.json({ diff: "" });
  }
});

// ── Git log ──────────────────────────────────────────────────────────

router.get("/git/log", async (req: Request, res: Response) => {
  const projectKey = req.query.project as string | undefined;
  const limit = Math.min(Number(req.query.limit) || 20, 100);

  let cwd = homedir();
  if (projectKey) {
    const project = await getProject(projectKey);
    if (project?.path) cwd = project.path;
  }

  try {
    const raw = execSync(
      `git log --oneline --format='{"hash":"%h","message":"%s","date":"%ci","author":"%an"}' -${limit}`,
      { cwd, encoding: "utf-8", timeout: 10000 },
    );
    const commits = raw.trim().split("\n").filter(Boolean).map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
    return res.json({ commits });
  } catch {
    return res.json({ commits: [] });
  }
});

export default router;
