import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";

// ── Global home ──────────────────────────────────────────────────────
// New: ~/.autoclawdev/
// Legacy: ~/.openclaw/workspace/autoresearch/

export function getGlobalDir(): string {
  return process.env.AUTOCLAWDEV_HOME || join(homedir(), ".autoclawdev");
}

export function getGlobalPath(...segments: string[]): string {
  return join(getGlobalDir(), ...segments);
}

// Legacy workspace (for backward compatibility reads)
function getLegacyWorkspaceDir(): string {
  return (
    process.env.AUTOCLAWDEV_WORKSPACE ||
    join(homedir(), ".openclaw", "workspace", "autoresearch")
  );
}

export function getLegacyExperimentsPath(key: string): string {
  return join(getLegacyWorkspaceDir(), `experiments-${key}.jsonl`);
}

export function getLegacyRunLogPath(key: string): string {
  return join(getLegacyWorkspaceDir(), `run-${key}.log`);
}

// Legacy project configs dir
function getLegacyProjectsDir(): string {
  return (
    process.env.AUTOCLAWDEV_PROJECTS_DIR ||
    join(homedir(), ".local", "lib", "autoclawdev", "projects")
  );
}

// ── Per-project paths ────────────────────────────────────────────────
// New: <project>/.autoclaw/
// Legacy: scattered across workspace

export function getProjectAutoClawDir(projectPath: string): string {
  return join(projectPath, ".autoclaw");
}

export function getProjectConfigPath(projectPath: string): string {
  return join(getProjectAutoClawDir(projectPath), "config.json");
}

export function getProjectExperimentsPath(projectPath: string): string {
  return join(getProjectAutoClawDir(projectPath), "experiments.jsonl");
}

export function getProjectMemoryDir(projectPath: string): string {
  return join(getProjectAutoClawDir(projectPath), "memory");
}

export function getProjectCyclesDir(projectPath: string): string {
  return join(getProjectAutoClawDir(projectPath), "cycles");
}

export function getProjectReviewsDir(projectPath: string): string {
  return join(getProjectAutoClawDir(projectPath), "reviews");
}

export function getProjectBuildsDir(projectPath: string): string {
  return join(getProjectAutoClawDir(projectPath), "builds");
}

export function getProjectRunsDir(projectPath: string): string {
  return join(getProjectAutoClawDir(projectPath), "runs");
}

export function getProjectWebAuditsDir(projectPath: string): string {
  return join(getProjectAutoClawDir(projectPath), "web-audits");
}

export function getProjectWebAuditRunDir(projectPath: string, runId: string): string {
  return join(getProjectWebAuditsDir(projectPath), runId);
}

export function getProjectWebAuditRecordPath(projectPath: string, runId: string): string {
  return join(getProjectWebAuditRunDir(projectPath, runId), "run.json");
}

export function getProjectWebAuditEventsPath(projectPath: string, runId: string): string {
  return join(getProjectWebAuditRunDir(projectPath, runId), "events.jsonl");
}

export function getProjectWebAuditFindingsPath(projectPath: string, runId: string): string {
  return join(getProjectWebAuditRunDir(projectPath, runId), "findings.json");
}

export function getProjectWebAuditEvidencePath(projectPath: string, runId: string): string {
  return join(getProjectWebAuditRunDir(projectPath, runId), "evidence.json");
}

export function getProjectWebAuditHypothesesPath(projectPath: string, runId: string): string {
  return join(getProjectWebAuditRunDir(projectPath, runId), "hypotheses.json");
}

export function getProjectWebAuditOperatorCommandsPath(projectPath: string, runId: string): string {
  return join(getProjectWebAuditRunDir(projectPath, runId), "operator-commands.json");
}

export function getProjectRunDir(projectPath: string, runId: string): string {
  return join(getProjectRunsDir(projectPath), runId);
}

export function getProjectRunRecordPath(projectPath: string, runId: string): string {
  return join(getProjectRunDir(projectPath, runId), "run.json");
}

export function getProjectRunEventsPath(projectPath: string, runId: string): string {
  return join(getProjectRunDir(projectPath, runId), "events.jsonl");
}

export function getProjectRunConsolePath(projectPath: string, runId: string): string {
  return join(getProjectRunDir(projectPath, runId), "console.log");
}

export function getProjectRunRecoverySummaryPath(projectPath: string, runId: string): string {
  return join(getProjectRunDir(projectPath, runId), "recovery-summary.txt");
}

export function getSessionSecretPath(): string {
  return getGlobalPath("session-secret");
}

export function getProjectProgramPath(projectPath: string): string {
  return join(getProjectAutoClawDir(projectPath), "program.md");
}

export function getProjectLockPath(projectPath: string): string {
  return join(getProjectRunsDir(projectPath), ".lock");
}

// ── Resolution with fallback ─────────────────────────────────────────
// Try new location first, fall back to legacy

export function resolveExperimentsPath(key: string, projectPath?: string): string {
  // Prefer new per-project location
  if (projectPath) {
    const newPath = getProjectExperimentsPath(projectPath);
    if (existsSync(newPath)) return newPath;
  }
  // Fall back to legacy workspace path
  const legacyPath = getLegacyExperimentsPath(key);
  if (existsSync(legacyPath)) return legacyPath;
  // Default to new location for writes
  return projectPath
    ? getProjectExperimentsPath(projectPath)
    : legacyPath;
}

export function resolveMemoryDir(key: string, projectPath?: string): string {
  if (projectPath) {
    const newDir = getProjectMemoryDir(projectPath);
    if (existsSync(newDir)) return newDir;
  }
  const legacyDir = join(getLegacyWorkspaceDir(), "memory", key);
  if (existsSync(legacyDir)) return legacyDir;
  return projectPath ? getProjectMemoryDir(projectPath) : legacyDir;
}

export function resolveCyclesDir(key: string, projectPath?: string): string {
  if (projectPath) {
    const newDir = getProjectCyclesDir(projectPath);
    if (existsSync(newDir)) return newDir;
  }
  const legacyDir = join(getLegacyWorkspaceDir(), "cycles");
  if (existsSync(legacyDir)) return legacyDir;
  return projectPath ? getProjectCyclesDir(projectPath) : legacyDir;
}

export function resolveReviewsDir(projectPath: string): string {
  const newDir = getProjectReviewsDir(projectPath);
  if (existsSync(newDir)) return newDir;
  // Legacy fallback
  const legacyDir = join(projectPath, ".deep-review-logs");
  if (existsSync(legacyDir)) return legacyDir;
  return newDir;
}

export function resolveBuildsDir(projectPath: string): string {
  return getProjectBuildsDir(projectPath);
}

export function resolveRunLogPath(key: string, projectPath?: string): string {
  if (projectPath) {
    const newLog = join(getProjectRunsDir(projectPath), "run.log");
    if (existsSync(newLog)) return newLog;
  }
  const legacyLog = getLegacyRunLogPath(key);
  if (existsSync(legacyLog)) return legacyLog;
  return projectPath
    ? join(getProjectRunsDir(projectPath), "run.log")
    : legacyLog;
}

export function resolveLockPath(key: string, projectPath?: string): string {
  if (projectPath) {
    const newLock = getProjectLockPath(projectPath);
    if (existsSync(newLock)) return newLock;
  }
  return join(getLegacyWorkspaceDir(), `.lock-${key}`);
}

// ── Legacy compat (used by existing code that hasn't migrated) ───────

export function getWorkspaceDir(): string {
  return getLegacyWorkspaceDir();
}

export function getProjectsDir(): string {
  return getLegacyProjectsDir();
}

export function getWorkspacePath(...segments: string[]): string {
  return join(getWorkspaceDir(), ...segments);
}

export function getProjectsPath(...segments: string[]): string {
  return join(getProjectsDir(), ...segments);
}
