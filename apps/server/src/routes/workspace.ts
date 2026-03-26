import { Router, type Request, type Response, type Router as ExpressRouter } from "express";
import { readdir, readFile, writeFile, stat, mkdir } from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { getProject } from "../lib/config.js";

const router: ExpressRouter = Router();

// ── Helpers ──────────────────────────────────────────────────────────

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

async function resolveProjectBasePath(projectKey: string | undefined): Promise<string> {
  if (!projectKey) {
    return homedir();
  }

  const project = await getProject(projectKey);
  return project?.path || homedir();
}

function runGitCommand(args: string[], cwd: string) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf-8",
    timeout: 10000,
  });
}

interface ParsedGitFileStatus {
  status: string;
  path: string;
  originalPath: string | null;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  indexStatus: string;
  workingTreeStatus: string;
  label: string;
}

function parseGitStatusLine(line: string): ParsedGitFileStatus {
  const indexStatus = line[0] ?? " ";
  const workingTreeStatus = line[1] ?? " ";
  const rawPath = line.slice(3).trim();
  const renamed = rawPath.includes(" -> ");
  const [fromPath, toPath] = renamed
    ? rawPath.split(" -> ", 2)
    : [rawPath, rawPath];
  const path = toPath || rawPath;
  const originalPath = renamed && fromPath && fromPath !== path ? fromPath : null;
  const untracked = indexStatus === "?" && workingTreeStatus === "?";
  const staged = !untracked && indexStatus !== " ";
  const unstaged = untracked || workingTreeStatus !== " ";

  return {
    status: `${indexStatus}${workingTreeStatus}`,
    path,
    originalPath,
    staged,
    unstaged,
    untracked,
    indexStatus,
    workingTreeStatus,
    label: describeGitStatus(indexStatus, workingTreeStatus),
  };
}

function describeGitStatus(indexStatus: string, workingTreeStatus: string) {
  if (indexStatus === "?" && workingTreeStatus === "?") {
    return "Untracked";
  }

  if (indexStatus === "A" || workingTreeStatus === "A") {
    return "Added";
  }

  if (indexStatus === "M" || workingTreeStatus === "M") {
    return "Modified";
  }

  if (indexStatus === "D" || workingTreeStatus === "D") {
    return "Deleted";
  }

  if (indexStatus === "R" || workingTreeStatus === "R") {
    return "Renamed";
  }

  if (indexStatus === "C" || workingTreeStatus === "C") {
    return "Copied";
  }

  if (indexStatus === "U" || workingTreeStatus === "U") {
    return "Conflicted";
  }

  return "Changed";
}

function buildDiffForUntrackedFile(cwd: string, filePath: string) {
  try {
    return runGitCommand(["diff", "--no-index", "--", "/dev/null", filePath], cwd);
  } catch (error) {
    const diffOutput = extractGitCommandOutput(error);
    return typeof diffOutput === "string" ? diffOutput : "";
  }
}

function buildDiffForTrackedFile(cwd: string, filePath: string) {
  try {
    return runGitCommand(["diff", "--no-ext-diff", "HEAD", "--", filePath], cwd);
  } catch (error) {
    const diffOutput = extractGitCommandOutput(error);
    return typeof diffOutput === "string" ? diffOutput : "";
  }
}

function extractGitCommandOutput(error: unknown) {
  if (!error || typeof error !== "object") {
    return null;
  }

  const maybeStdout = "stdout" in error ? error.stdout : null;
  return typeof maybeStdout === "string" ? maybeStdout : null;
}

function getGitStatusSnapshot(cwd: string) {
  const statusOutput = runGitCommand(["status", "--porcelain"], cwd);
  const files = statusOutput
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map(parseGitStatusLine);

  const branch = runGitCommand(["rev-parse", "--abbrev-ref", "HEAD"], cwd).trim();
  const lastCommit = runGitCommand(["log", "--oneline", "-1"], cwd).trim();
  const staged = files.filter((file) => file.staged);
  const unstaged = files.filter((file) => file.unstaged && !file.untracked);
  const untracked = files.filter((file) => file.untracked);

  return {
    branch,
    lastCommit,
    clean: files.length === 0,
    counts: {
      total: files.length,
      staged: staged.length,
      unstaged: unstaged.length,
      untracked: untracked.length,
    },
    files,
    staged,
    unstaged,
    untracked,
  };
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

  const basePath = await resolveProjectBasePath(projectKey);

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

  const basePath = await resolveProjectBasePath(projectKey);

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

  const basePath = await resolveProjectBasePath(projectKey);

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

  const cwd = await resolveProjectBasePath(projectKey);

  try {
    return res.json(getGitStatusSnapshot(cwd));
  } catch {
    return res.json({
      branch: "unknown",
      lastCommit: "",
      files: [],
      staged: [],
      unstaged: [],
      untracked: [],
      counts: {
        total: 0,
        staged: 0,
        unstaged: 0,
        untracked: 0,
      },
      clean: true,
      error: "Not a git repo",
    });
  }
});

// ── Git diff ─────────────────────────────────────────────────────────

router.get("/git/diff", async (req: Request, res: Response) => {
  const projectKey = req.query.project as string | undefined;
  const filePath = req.query.file as string | undefined;

  const cwd = await resolveProjectBasePath(projectKey);

  try {
    if (!filePath) {
      const diff = buildDiffForTrackedFile(cwd, ".");
      return res.json({ diff, file: null });
    }

    const snapshot = getGitStatusSnapshot(cwd);
    const fileStatus = snapshot.files.find((entry) => entry.path === filePath);
    if (!fileStatus) {
      return res.json({ diff: "", file: null });
    }

    const diff = fileStatus.untracked
      ? buildDiffForUntrackedFile(cwd, filePath)
      : buildDiffForTrackedFile(cwd, filePath);

    return res.json({
      diff,
      file: fileStatus,
    });
  } catch {
    return res.json({ diff: "", file: null });
  }
});

// ── Git stage / unstage ──────────────────────────────────────────────

router.post("/git/stage", async (req: Request, res: Response) => {
  const {
    project: projectKey,
    paths,
    all,
    mode,
  }: {
    project?: string;
    paths?: string[];
    all?: boolean;
    mode?: "stage" | "unstage";
  } = req.body ?? {};

  const cwd = await resolveProjectBasePath(projectKey);
  const action = mode === "unstage" ? "unstage" : "stage";

  try {
    if (all) {
      if (action === "stage") {
        runGitCommand(["add", "--all"], cwd);
      } else {
        runGitCommand(["reset", "HEAD", "--", "."], cwd);
      }
    } else if (Array.isArray(paths) && paths.length > 0) {
      if (action === "stage") {
        runGitCommand(["add", "--", ...paths], cwd);
      } else {
        runGitCommand(["reset", "HEAD", "--", ...paths], cwd);
      }
    } else {
      return res.status(400).json({ error: "paths or all is required" });
    }

    return res.json({
      ok: true,
      mode: action,
      status: getGitStatusSnapshot(cwd),
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Unable to update staged files",
    });
  }
});

// ── Git commit ───────────────────────────────────────────────────────

router.post("/git/commit", async (req: Request, res: Response) => {
  const {
    project: projectKey,
    message,
    all,
  }: {
    project?: string;
    message?: string;
    all?: boolean;
  } = req.body ?? {};

  const cwd = await resolveProjectBasePath(projectKey);
  const commitMessage = message?.trim();

  if (!commitMessage) {
    return res.status(400).json({ error: "commit message is required" });
  }

  try {
    if (all) {
      runGitCommand(["add", "--all"], cwd);
    }

    runGitCommand(["commit", "-m", commitMessage], cwd);

    return res.json({
      ok: true,
      branch: runGitCommand(["rev-parse", "--abbrev-ref", "HEAD"], cwd).trim(),
      commit: runGitCommand(["rev-parse", "--short", "HEAD"], cwd).trim(),
      lastCommit: runGitCommand(["log", "--oneline", "-1"], cwd).trim(),
      status: getGitStatusSnapshot(cwd),
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Unable to create commit",
    });
  }
});

// ── Git log ──────────────────────────────────────────────────────────

router.get("/git/log", async (req: Request, res: Response) => {
  const projectKey = req.query.project as string | undefined;
  const limit = Math.min(Number(req.query.limit) || 20, 100);

  const cwd = await resolveProjectBasePath(projectKey);

  try {
    const raw = runGitCommand(
      ["log", "--oneline", `--format={\"hash\":\"%h\",\"message\":\"%s\",\"date\":\"%ci\",\"author\":\"%an\"}`, `-${limit}`],
      cwd,
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
