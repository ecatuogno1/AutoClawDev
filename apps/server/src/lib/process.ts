import { spawn, execFileSync, execSync, type ChildProcess } from "node:child_process";
import {
  closeSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  type WriteStream,
} from "node:fs";
import { join, dirname } from "node:path";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";
import type {
  ActiveRun as SharedActiveRun,
  EventRecord,
  ProjectConfig,
  RunMode,
  RunOverrideReason,
  RunOutputEvent,
  ValidationOverrideReason,
} from "@autoclawdev/types";
import {
  getProjectRunConsolePath,
  getProjectRunRecoverySummaryPath,
  getWorkspaceDir,
  getWorkspacePath,
} from "./paths.js";
import { getProject, getProjectDetailed } from "./config.js";
import { appendRunEvent, updateRunRecord } from "./runRecords.js";

const WORKSPACE_DIR = getWorkspaceDir();
const SERVER_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = process.env.AUTOCLAWDEV_REPO_ROOT || join(SERVER_DIR, "../../../../");
const ENABLE_LEGACY_EXTERNAL_RUN_SCAN = process.env.AUTOCLAWDEV_ENABLE_LEGACY_RUN_SCAN === "1";
const WORKSPACE_RUNNER = getWorkspacePath("runner.sh");
const RUNNER_SCRIPT = process.env.AUTOCLAWDEV_RUNNER || (
  existsSync(join(REPO_ROOT, "scripts", "runner.sh"))
    ? join(REPO_ROOT, "scripts", "runner.sh")
    : WORKSPACE_RUNNER
);
const RUN_LOG = getWorkspacePath("run.log");

interface ActiveRun extends SharedActiveRun {
  runId?: string;
  mode: RunMode;
  project: string;
  cycles: number;
  startedAt: string;
  projectPath?: string;
  artifactRoot?: string;
  mainPhase: string;
  validationPhase?: string;
  commitPhase?: string;
  reportPhase?: string;
  process: ChildProcess;
  logs: WriteStream[];
  stdoutBuffer: string;
  stderrBuffer: string;
  outputStarted: boolean;
  degraded: boolean;
  overrideReason?: RunOverrideReason;
  recoveryRequired: boolean;
  preservedBranch?: string;
  preservedWorktree?: string;
  allowedOverrideReasons: ValidationOverrideReason[];
  disallowedOverrideReason?: ValidationOverrideReason;
  nativeFinalization: boolean;
  finalizationDir?: string;
  processingFinalization: boolean;
  handledFinalizationRequests: Set<string>;
  finalizationTimer?: NodeJS.Timeout;
}

export interface ManagedExecutionSpec {
  project: string;
  cycles: number;
  mode: RunMode;
  runId?: string;
  artifactRoot?: string;
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  projectPath?: string;
  mainPhase: string;
  validationPhase?: string;
  commitPhase?: string;
  reportPhase?: string;
  nativeFinalization?: boolean;
}

interface ExternalRunObserver {
  project: string;
  pid: number;
  cycles: number;
  startedAt: string;
  logPath: string;
  offset: number;
  buffer: string;
}

interface FinalizationRequest {
  id: string;
  action: "merge" | "cleanup";
  project?: string;
  mergeMessage?: string;
  currentBranch?: string;
  currentWorktree?: string;
  sourceRepo?: string;
  landingRepo?: string;
  integrationBranch?: string;
  validationSummary?: string;
  validationProfile?: string;
  preserve?: boolean;
  detail?: string;
}

interface FinalizationResponse {
  id: string;
  ok: boolean;
  detail: string;
  commitHash?: string;
  preservedBranch?: string;
  preservedWorktree?: string;
}

export function parseRunnerLine(project: string, line: string): RunOutputEvent {
  const event: RunOutputEvent = {
    project,
    text: line,
    timestamp: new Date().toISOString(),
    kind: "line",
  };

  const trimmed = line.trim();

  let match = trimmed.match(/^──\s+(.+)\s+session\s+──$/);
  if (match) {
    event.kind = "session_start";
    event.session = match[1];
    event.agent = match[1].split("/")[0]?.toLowerCase();
    return event;
  }

  match = trimmed.match(/^──\s+end\s+(.+)\s+──$/);
  if (match) {
    event.kind = "session_end";
    event.session = match[1];
    event.agent = match[1].split("/")[0]?.toLowerCase();
    return event;
  }

  match = trimmed.match(/^│\s+([^:]+):\s?(.*)$/);
  if (match) {
    event.kind = "session_line";
    event.session = match[1];
    event.agent = match[1].split("/")[0]?.toLowerCase();
    event.text = match[2] || "";
    return event;
  }

  match = trimmed.match(/^([^\s]+)\s+([A-Za-z]+)\s+\[([^\]]+)\]\s+(.*)$/);
  if (match) {
    event.kind = "phase_start";
    event.agent = match[2];
    event.tool = match[3];
    event.text = match[4];
    event.status = "working";
    return event;
  }

  match = trimmed.match(/^[✓✗]\s+(Done|Fail)\s+([^:]+):\s*(.*)$/);
  if (match) {
    event.kind = "phase_done";
    event.agent = match[2];
    event.text = match[3];
    event.status = match[1] === "Done" ? "done" : "fail";
    return event;
  }

  if (trimmed.startsWith("Target:") || trimmed.startsWith("Criteria:") || trimmed.startsWith("Max rounds")) {
    event.kind = "phase_detail";
    return event;
  }

  if (trimmed.includes("CYCLE ")) {
    event.kind = "cycle";
    return event;
  }

  return event;
}

function appendLifecycleEvent(
  run: ActiveRun,
  type: EventRecord["type"],
  message: string,
  data?: Record<string, unknown>,
) {
  if (!run.runId || !run.projectPath) return;
  appendRunEvent(run.projectPath, {
    id: `${run.runId}-${Date.now()}-${type}`,
    runId: run.runId,
    projectKey: run.project,
    type,
    timestamp: new Date().toISOString(),
    message,
    data,
  });
}

function updateRecordedPhase(
  run: ActiveRun,
  phaseName: string | undefined,
  status: "queued" | "running" | "completed" | "failed" | "skipped",
  detail?: string,
) {
  if (!run.runId || !run.projectPath || !phaseName) return;
  const now = new Date().toISOString();
  updateRunRecord(run.projectPath, run.runId, (record) => ({
    ...record,
    phases: record.phases.map((phase) =>
      phase.name !== phaseName
        ? phase
        : {
            ...phase,
            status,
            startedAt:
              status === "running"
                ? phase.startedAt ?? now
                : phase.startedAt,
            completedAt:
              status === "completed" || status === "failed" || status === "skipped"
                ? now
                : phase.completedAt,
            detail: detail ?? phase.detail,
          },
    ),
  }));
}

function isValidationEvent(event: RunOutputEvent): boolean {
  if (!event.agent) return false;
  return (
    event.agent === "Tests" ||
    event.agent === "Lint" ||
    event.agent === "Visual" ||
    event.tool === "direct"
  );
}

function overrideReasonAllowed(run: ActiveRun, reason: ValidationOverrideReason): boolean {
  return run.allowedOverrideReasons.includes(reason);
}

interface ControlPlaneEventPayload {
  event: string;
  reason?: ValidationOverrideReason;
  detail?: string;
  commitHash?: string;
  branch?: string;
  worktree?: string;
}

function parseControlPlaneEvent(text: string): ControlPlaneEventPayload | null {
  const prefix = "[AUTOCLAWDEV_EVENT] ";
  if (!text.startsWith(prefix)) return null;
  try {
    return JSON.parse(text.slice(prefix.length)) as ControlPlaneEventPayload;
  } catch {
    return null;
  }
}

function sanitizeFileSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "-");
}

function acquireLockDir(lockDir: string, timeoutMs = 600_000): boolean {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    try {
      mkdirSync(lockDir);
      return true;
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String((error as { code?: unknown }).code)
          : "";
      if (code !== "EEXIST") {
        return false;
      }
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
  }
  return false;
}

function releaseLockDir(lockDir: string) {
  rmSync(lockDir, { recursive: true, force: true });
}

function cleanupEphemeralMergeArtifacts(repoPath: string) {
  const tracked = execFileSync("git", ["-C", repoPath, "ls-files", "-m", "-z", "--", "*.tsbuildinfo"], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "ignore"],
  }).split("\0").filter(Boolean);

  if (tracked.length > 0) {
    execFileSync("git", ["-C", repoPath, "restore", "--source=HEAD", "--worktree", "--", ...tracked], {
      stdio: ["ignore", "ignore", "ignore"],
    });
  }

  const candidates = execFileSync(
    "find",
    [repoPath, "-type", "f", "-name", "*.tsbuildinfo", "-not", "-path", "*/node_modules/*", "-print0"],
    { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] },
  ).split("\0").filter(Boolean);

  for (const absPath of candidates) {
    const relPath = absPath.startsWith(`${repoPath}/`) ? absPath.slice(repoPath.length + 1) : absPath;
    try {
      execFileSync("git", ["-C", repoPath, "ls-files", "--error-unmatch", relPath], {
        stdio: ["ignore", "ignore", "ignore"],
      });
    } catch {
      rmSync(absPath, { force: true });
    }
  }
}

function storeValidationBaseline(request: FinalizationRequest, mergedRef: string) {
  if (!request.project || !request.validationSummary) return;
  const safeProject = sanitizeFileSegment(request.project);
  const safeProfile = sanitizeFileSegment(request.validationProfile || "reliability");
  const baselinesDir = join(WORKSPACE_DIR, "validation-baselines");
  mkdirSync(baselinesDir, { recursive: true });

  const byRef = join(baselinesDir, `${safeProject}-${mergedRef}-${safeProfile}.json`);
  writeFileSync(byRef, `${request.validationSummary}\n`, "utf-8");

  if (request.integrationBranch) {
    const safeBranch = sanitizeFileSegment(request.integrationBranch);
    const byBranch = join(baselinesDir, `${safeProject}-branch-${safeBranch}-${safeProfile}.json`);
    writeFileSync(byBranch, `${request.validationSummary}\n`, "utf-8");
  }
}

function executeFinalizationRequest(run: ActiveRun, request: FinalizationRequest): FinalizationResponse {
  if (request.action === "merge") {
    const landingRepo = request.landingRepo;
    const currentBranch = request.currentBranch;
    const integrationBranch = request.integrationBranch;
    const mergeMessage = request.mergeMessage;
    if (!landingRepo || !currentBranch || !integrationBranch || !mergeMessage) {
      return {
        id: request.id,
        ok: false,
        detail: "Merge request missing required fields",
        preservedBranch: currentBranch,
        preservedWorktree: request.currentWorktree,
      };
    }

    const mergeLockDir = join(WORKSPACE_DIR, `.merge-lock-${run.project}`);
    if (!acquireLockDir(mergeLockDir, 600_000)) {
      return {
        id: request.id,
        ok: false,
        detail: `Timed out waiting for merge lock ${mergeLockDir}`,
        preservedBranch: currentBranch,
        preservedWorktree: request.currentWorktree,
      };
    }

    try {
      cleanupEphemeralMergeArtifacts(landingRepo);
      execFileSync("git", ["-C", landingRepo, "merge", "--no-ff", currentBranch, "-m", mergeMessage], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      const mergedRef = execFileSync("git", ["-C", landingRepo, "rev-parse", "HEAD"], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      const commitHash = execFileSync("git", ["-C", landingRepo, "rev-parse", "--short", "HEAD"], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      storeValidationBaseline(request, mergedRef);
      return {
        id: request.id,
        ok: true,
        detail: `Merged ${currentBranch} into ${integrationBranch}`,
        commitHash,
      };
    } catch (error) {
      try {
        execFileSync("git", ["-C", landingRepo, "merge", "--abort"], {
          stdio: ["ignore", "ignore", "ignore"],
        });
      } catch {
        // Ignore best-effort abort errors.
      }
      const stderr =
        typeof error === "object" && error !== null && "stderr" in error
          ? String((error as { stderr?: unknown }).stderr ?? "").trim()
          : "";
      const stdout =
        typeof error === "object" && error !== null && "stdout" in error
          ? String((error as { stdout?: unknown }).stdout ?? "").trim()
          : "";
      return {
        id: request.id,
        ok: false,
        detail: stderr || stdout || `Failed to merge ${currentBranch} into ${integrationBranch}`,
        preservedBranch: currentBranch,
        preservedWorktree: request.currentWorktree,
      };
    } finally {
      releaseLockDir(mergeLockDir);
    }
  }

  const sourceRepo = request.sourceRepo;
  if (!sourceRepo) {
    return {
      id: request.id,
      ok: false,
      detail: "Cleanup request missing source repo",
      preservedBranch: request.currentBranch,
      preservedWorktree: request.currentWorktree,
    };
  }

  if (request.preserve) {
    return {
      id: request.id,
      ok: false,
      detail: request.detail || "Cycle workspace preserved for recovery",
      preservedBranch: request.currentBranch,
      preservedWorktree: request.currentWorktree,
    };
  }

  try {
    if (request.currentWorktree) {
      try {
        execFileSync("git", ["-C", sourceRepo, "worktree", "remove", "--force", request.currentWorktree], {
          stdio: ["ignore", "ignore", "pipe"],
        });
      } catch {
        rmSync(request.currentWorktree, { recursive: true, force: true });
      }
    }

    if (request.currentBranch) {
      execFileSync("git", ["-C", sourceRepo, "branch", "-D", request.currentBranch], {
        stdio: ["ignore", "ignore", "ignore"],
      });
    }

    return {
      id: request.id,
      ok: true,
      detail: "Cycle workspace cleaned up",
    };
  } catch (error) {
    const stderr =
      typeof error === "object" && error !== null && "stderr" in error
        ? String((error as { stderr?: unknown }).stderr ?? "").trim()
        : "";
    return {
      id: request.id,
      ok: false,
      detail: stderr || request.detail || "Failed to clean up cycle workspace",
      preservedBranch: request.currentBranch,
      preservedWorktree: request.currentWorktree,
    };
  }
}

function serviceFinalizationRequests(run: ActiveRun) {
  if (!run.nativeFinalization || !run.finalizationDir || run.processingFinalization || !existsSync(run.finalizationDir)) {
    return;
  }

  let requests: string[] = [];
  try {
    requests = readdirSync(run.finalizationDir)
      .filter((entry) => entry.startsWith("request-") && entry.endsWith(".json"))
      .sort();
  } catch {
    return;
  }

  if (requests.length === 0) return;
  run.processingFinalization = true;

  try {
    for (const entry of requests) {
      const requestPath = join(run.finalizationDir, entry);
      let request: FinalizationRequest | undefined;
      try {
        request = JSON.parse(readFileSync(requestPath, "utf-8")) as FinalizationRequest;
      } catch {
        continue;
      }
      if (!request?.id || run.handledFinalizationRequests.has(request.id)) continue;

      const response = executeFinalizationRequest(run, request);
      const responsePath = join(run.finalizationDir, `response-${request.id}.json`);
      const tempPath = `${responsePath}.tmp`;
      writeFileSync(tempPath, `${JSON.stringify(response)}\n`, "utf-8");
      renameSync(tempPath, responsePath);
      run.handledFinalizationRequests.add(request.id);
    }
  } finally {
    run.processingFinalization = false;
  }
}

function markDegraded(
  run: ActiveRun,
  reason: RunOverrideReason | undefined,
  message: string,
) {
  if (reason && !overrideReasonAllowed(run, reason)) {
    run.disallowedOverrideReason = reason;
    run.recoveryRequired = false;
    appendLifecycleEvent(run, "system", "Validation override rejected by manifest policy", {
      overrideReason: reason,
      allowedOverrideReasons: run.allowedOverrideReasons,
    });
    return;
  }
  run.degraded = true;
  if (reason) {
    run.overrideReason = reason;
    appendLifecycleEvent(run, "validation_override_accepted", message, {
      overrideReason: reason,
    });
  } else {
    appendLifecycleEvent(run, "system", message, {
      degraded: true,
    });
  }
}

function writeRecoverySummary(run: ActiveRun, detail: string) {
  if (!run.runId || !run.projectPath) return undefined;
  const summaryPath = getProjectRunRecoverySummaryPath(run.projectPath, run.runId);
  const lines = [
    `Run ${run.runId} requires manual recovery.`,
    `Project: ${run.project}`,
    `Detail: ${detail}`,
    run.preservedBranch ? `Preserved branch: ${run.preservedBranch}` : undefined,
    run.preservedWorktree ? `Preserved worktree: ${run.preservedWorktree}` : undefined,
  ].filter(Boolean);
  writeFileSync(summaryPath, `${lines.join("\n")}\n`, "utf-8");
  return summaryPath;
}

function updateRecordedOutcome(run: ActiveRun, options: {
  status?: "queued" | "preflight_failed" | "running" | "completed" | "failed" | "stopped";
  summary?: string;
}) {
  if (!run.runId || !run.projectPath) return;
  updateRunRecord(run.projectPath, run.runId, (record) => {
    const recoverySummaryPath = run.recoveryRequired
      ? writeRecoverySummary(run, options.summary ?? record.summary ?? "Recovery required")
      : record.recovery?.summaryPath;
    const nextOutcome =
      run.disallowedOverrideReason
        ? "failed"
        : run.recoveryRequired
        ? "recovery_required"
        : run.degraded
          ? "degraded_pass"
          : options.status === "completed"
            ? "clean_pass"
            : record.status === "completed" && record.outcome
              ? record.outcome
              : options.status === "preflight_failed" || options.status === "failed" || options.status === "stopped"
                ? "failed"
                : record.outcome;

    return {
      ...record,
      status: options.status ?? record.status,
      summary: options.summary ?? record.summary,
      outcome: nextOutcome,
      overrideReason: run.overrideReason ?? record.overrideReason,
      recovery: run.recoveryRequired
        ? {
            required: true,
            status: "open",
            branch: run.preservedBranch ?? record.recovery?.branch,
            worktree: run.preservedWorktree ?? record.recovery?.worktree,
            summaryPath: recoverySummaryPath,
            note: record.recovery?.note,
            resolvedAt: record.recovery?.resolvedAt,
          }
        : record.recovery,
    };
  });
}

function handleLifecycleSignals(run: ActiveRun, text: string) {
  const controlEvent = parseControlPlaneEvent(text);
  if (controlEvent) {
    switch (controlEvent.event) {
      case "override_accepted":
        if (controlEvent.reason) {
          markDegraded(run, controlEvent.reason, controlEvent.detail ?? `Validation override accepted: ${controlEvent.reason}`);
        }
        return;
      case "override_rejected":
        if (controlEvent.reason) {
          run.disallowedOverrideReason = controlEvent.reason;
          appendLifecycleEvent(run, "system", "Validation override rejected by runner policy", {
            overrideReason: controlEvent.reason,
          });
        }
        return;
      case "merge_started":
        appendLifecycleEvent(run, "merge_started", controlEvent.detail ?? "Merge started");
        return;
      case "merge_succeeded":
        appendLifecycleEvent(run, "committed", controlEvent.detail ?? "Merge completed", {
          commitHash: controlEvent.commitHash,
        });
        return;
      case "merge_failed":
        run.recoveryRequired = true;
        run.preservedBranch = controlEvent.branch ?? run.preservedBranch;
        run.preservedWorktree = controlEvent.worktree ?? run.preservedWorktree;
        appendLifecycleEvent(run, "merge_failed", controlEvent.detail ?? "Merge failed", {
          branch: controlEvent.branch,
          worktree: controlEvent.worktree,
        });
        return;
      case "revert_started":
        appendLifecycleEvent(run, "revert_started", controlEvent.detail ?? "Revert started");
        return;
      case "revert_failed":
        run.recoveryRequired = true;
        appendLifecycleEvent(run, "revert_failed", controlEvent.detail ?? "Revert failed");
        return;
      case "revert_succeeded":
        appendLifecycleEvent(run, "reverted", controlEvent.detail ?? "Revert completed");
        return;
      default:
        return;
    }
  }

  if (text.includes("Validation matched known baseline failures")) {
    markDegraded(run, "baseline_match", "Validation override accepted: baseline match");
    return;
  }
  if (text.includes("Validation hit pre-existing unrelated test failures")) {
    markDegraded(run, "preexisting_unrelated_failure", "Validation override accepted: pre-existing unrelated failure");
    return;
  }
  if (text.includes("Validation hit environment-only issues")) {
    markDegraded(run, "environment_issue", "Validation override accepted: environment issue");
    return;
  }
  if (text.includes("Validation surfaced broad repo-wide failures")) {
    markDegraded(run, "broad_repo_failure", "Validation override accepted: broad repository failure");
    return;
  }
  if (text.includes("Non-blocking")) {
    markDegraded(run, undefined, "Non-blocking validation/tooling issue recorded");
    return;
  }
  const branchMatch = text.match(/Preserved branch:\s+(.+)$/);
  if (branchMatch) {
    run.recoveryRequired = true;
    run.preservedBranch = branchMatch[1];
    return;
  }
  const worktreeMatch = text.match(/Preserved worktree:\s+(.+)$/);
  if (worktreeMatch) {
    run.recoveryRequired = true;
    run.preservedWorktree = worktreeMatch[1];
  }
}

function classifyLifecycleEvent(run: ActiveRun, event: RunOutputEvent, text: string) {
  handleLifecycleSignals(run, text);

  if (event.kind === "phase_start") {
    if (isValidationEvent(event)) {
      updateRecordedPhase(run, run.validationPhase, "running", text);
      appendLifecycleEvent(run, "phase_started", "Validation phase started", {
        phase: run.validationPhase,
        agent: event.agent,
        tool: event.tool,
      });
      return;
    }

    if (event.agent === "Commit") {
      updateRecordedPhase(run, run.commitPhase, "running", text);
      appendLifecycleEvent(run, "merge_started", "Commit phase started", {
        phase: run.commitPhase,
      });
      return;
    }

    if (event.agent === "Revert") {
      appendLifecycleEvent(run, "revert_started", "Revert phase started", {
        phase: "revert",
      });
    }
  }

  if (event.kind === "phase_done") {
    if (isValidationEvent(event)) {
      const status = event.status === "fail" ? "failed" : "completed";
      updateRecordedPhase(run, run.validationPhase, status, text);
      if (event.status === "fail") {
        appendLifecycleEvent(run, "validation_failed", "Validation failed", {
          phase: run.validationPhase,
          agent: event.agent,
          detail: text,
        });
      } else {
        appendLifecycleEvent(run, "phase_finished", "Validation phase finished", {
          phase: run.validationPhase,
          agent: event.agent,
        });
      }
      return;
    }

    if (event.agent === "Commit") {
      const status = event.status === "fail" ? "failed" : "completed";
      updateRecordedPhase(run, run.commitPhase, status, text);
      if (event.status === "fail") {
        run.recoveryRequired = true;
        appendLifecycleEvent(run, "merge_failed", "Commit phase failed", {
          phase: run.commitPhase,
          detail: text,
        });
      } else {
        const commitHash = text.match(/\(([0-9a-f]{7,40})\)/i)?.[1];
        appendLifecycleEvent(run, "committed", "Commit phase finished", {
          phase: run.commitPhase,
          commitHash,
          detail: text,
        });
      }
      return;
    }

    if (event.agent === "Revert") {
      if (event.status === "fail") {
        run.recoveryRequired = true;
        appendLifecycleEvent(run, "revert_failed", "Revert phase failed", {
          detail: text,
        });
      } else {
        appendLifecycleEvent(run, "reverted", "Changes reverted", {
          detail: text,
        });
      }
    }
  }
}

function flushBufferedOutput(run: ActiveRun, project: string, source: "stdout" | "stderr", chunk: Buffer) {
  if (!run.outputStarted) {
    run.outputStarted = true;
    appendLifecycleEvent(run, "system", "Provider output started", { source });
  }
  const bufferKey = source === "stdout" ? "stdoutBuffer" : "stderrBuffer";
  const normalized = chunk.toString().replace(/\r/g, "\n");
  run[bufferKey] += normalized;

  const parts = run[bufferKey].split("\n");
  run[bufferKey] = parts.pop() ?? "";

  for (const part of parts) {
    const text = part.replace(
      // eslint-disable-next-line no-control-regex
      /\x1b\[[0-9;]*[a-zA-Z]/g,
      "",
    );
    if (!text.trim()) continue;
    const event = {
      ...parseRunnerLine(project, text),
      runId: run.runId,
    };
    runEvents.emit("output", event);
    classifyLifecycleEvent(run, event, text);
    if (run.disallowedOverrideReason) {
      run.process.kill("SIGTERM");
    }
    if (run.runId && run.projectPath) {
      const outputEvent: EventRecord = {
        id: `${run.runId}-${Date.now()}-output`,
        runId: run.runId,
        projectKey: project,
        type: "output",
        timestamp: event.timestamp,
        message: text,
        data: {
          source,
          kind: event.kind,
          agent: event.agent,
          status: event.status,
        },
      };
      appendRunEvent(run.projectPath, outputEvent);
    }
  }
}

function flushPendingBuffers(run: ActiveRun, project: string) {
  for (const bufferKey of ["stdoutBuffer", "stderrBuffer"] as const) {
    const pending = run[bufferKey].replace(
      // eslint-disable-next-line no-control-regex
      /\x1b\[[0-9;]*[a-zA-Z]/g,
      "",
    ).trim();
    if (pending) {
      const event = {
        ...parseRunnerLine(project, pending),
        runId: run.runId,
      };
      runEvents.emit("output", event);
      classifyLifecycleEvent(run, event, pending);
      if (run.runId && run.projectPath) {
        appendRunEvent(run.projectPath, {
          id: `${run.runId}-${Date.now()}-output`,
          runId: run.runId,
          projectKey: project,
          type: "output",
          timestamp: event.timestamp,
          message: pending,
          data: {
            kind: event.kind,
            agent: event.agent,
            status: event.status,
            source: bufferKey,
          },
        });
      }
    }
    run[bufferKey] = "";
  }
}

const activeRuns = new Map<string, ActiveRun>();
const externalRunObservers = new Map<string, ExternalRunObserver>();
export const runEvents = new EventEmitter();
let lastExternalRunWarning: string | null = null;
let externalRunScanDisabled = false;

function warnExternalRunIssue(message: string) {
  if (message === lastExternalRunWarning) {
    return;
  }
  lastExternalRunWarning = message;
  console.warn(message);
}

function clearExternalRunWarning() {
  lastExternalRunWarning = null;
}

function resolveExternalRunCycles(pid: number): number {
  if (!Number.isInteger(pid) || pid <= 0) return 1;
  try {
    const command = execSync(`ps -p ${pid} -o command=`, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const match = command.match(/runner\.sh\s+(\d+)\s+/);
    if (match) {
      const cycles = Number(match[1]);
      if (Number.isFinite(cycles) && cycles > 0) return cycles;
    }
  } catch {
    // Ignore missing or exited processes.
  }
  return 1;
}

function getExternalActiveRuns(): SharedActiveRun[] {
  if (!ENABLE_LEGACY_EXTERNAL_RUN_SCAN) {
    return [];
  }
  return listExternalRunMetadata().map(({ project, cycles, startedAt }) => ({
    project,
    cycles,
    startedAt,
  }));
}

function listExternalRunMetadata(): Array<{
  project: string;
  runId?: string;
  pid: number;
  cycles: number;
  startedAt: string;
  logPath: string;
}> {
  if (!ENABLE_LEGACY_EXTERNAL_RUN_SCAN) return [];
  if (externalRunScanDisabled || !existsSync(WORKSPACE_DIR)) return [];

  let entries: string[] = [];
  try {
    entries = readdirSync(WORKSPACE_DIR);
    clearExternalRunWarning();
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code)
        : null;
    const message = error instanceof Error ? error.message : String(error);
    if (code === "EMFILE") {
      externalRunScanDisabled = true;
      warnExternalRunIssue(
        `Disabling external run scan for ${WORKSPACE_DIR} after EMFILE: ${message}`,
      );
      return [];
    }
    warnExternalRunIssue(`Skipping external run scan for ${WORKSPACE_DIR}: ${message}`);
    return [];
  }

  const runs: Array<{
    project: string;
    runId?: string;
    pid: number;
    cycles: number;
    startedAt: string;
    logPath: string;
  }> = [];

  for (const entry of entries) {
    if (!entry.startsWith(".lock-")) continue;
    const project = entry.slice(".lock-".length);
    if (!project) continue;
    if (activeRuns.has(project)) continue;

    const lockfile = join(WORKSPACE_DIR, entry);

    try {
      const pidText = readFileSync(lockfile, "utf-8").trim();
      const pid = Number(pidText);
      if (!Number.isFinite(pid) || pid <= 0) continue;

      process.kill(pid, 0);

      const projectLog = getWorkspacePath(`run-${project}.log`);
      const logPath = existsSync(projectLog) ? projectLog : RUN_LOG;

      runs.push({
        project,
        pid,
        cycles: resolveExternalRunCycles(pid),
        startedAt: statSync(lockfile).mtime.toISOString(),
        logPath,
      });
    } catch {
      // Ignore stale lockfiles and transient process races.
    }
  }

  return runs;
}

function flushExternalObserverBuffer(observer: ExternalRunObserver) {
  const pending = observer.buffer.replace(
    // eslint-disable-next-line no-control-regex
    /\x1b\[[0-9;]*[a-zA-Z]/g,
    "",
  ).trim();
  if (pending) {
    runEvents.emit("output", parseRunnerLine(observer.project, pending));
  }
  observer.buffer = "";
}

function emitExternalOutputChunk(observer: ExternalRunObserver, chunk: Buffer) {
  const normalized = chunk.toString().replace(/\r/g, "\n");
  observer.buffer += normalized;

  const parts = observer.buffer.split("\n");
  observer.buffer = parts.pop() ?? "";

  for (const part of parts) {
    const text = part.replace(
      // eslint-disable-next-line no-control-regex
      /\x1b\[[0-9;]*[a-zA-Z]/g,
      "",
    );
    if (!text.trim()) continue;
    runEvents.emit("output", parseRunnerLine(observer.project, text));
  }
}

function readExternalLogDelta(observer: ExternalRunObserver) {
  if (!existsSync(observer.logPath)) return;

  let size = 0;
  try {
    size = statSync(observer.logPath).size;
  } catch {
    return;
  }

  if (size < observer.offset) {
    observer.offset = 0;
    observer.buffer = "";
  }

  if (size === observer.offset) return;

  let fd: number | null = null;
  try {
    fd = openSync(observer.logPath, "r");
    const length = size - observer.offset;
    const chunk = Buffer.alloc(length);
    const bytesRead = readSync(fd, chunk, 0, length, observer.offset);
    observer.offset = size;
    if (bytesRead > 0) {
      emitExternalOutputChunk(observer, chunk.subarray(0, bytesRead));
    }
    clearExternalRunWarning();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnExternalRunIssue(`Skipping external log read for ${observer.logPath}: ${message}`);
  } finally {
    if (fd !== null) {
      closeSync(fd);
    }
  }
}

function syncExternalRunObservers() {
  if (!ENABLE_LEGACY_EXTERNAL_RUN_SCAN) {
    externalRunObservers.clear();
    return;
  }

  if (externalRunScanDisabled) {
    return;
  }

  let metadata: ReturnType<typeof listExternalRunMetadata> = [];
  try {
    metadata = listExternalRunMetadata();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnExternalRunIssue(`External run observer sync failed: ${message}`);
    return;
  }
  const seen = new Set<string>();

  for (const run of metadata) {
    seen.add(run.project);

    let observer = externalRunObservers.get(run.project);
    if (!observer) {
      observer = {
        ...run,
        offset: 0,
        buffer: "",
      };
      externalRunObservers.set(run.project, observer);
      runEvents.emit("start", {
        runId: run.runId,
        project: run.project,
        cycles: run.cycles,
        timestamp: run.startedAt,
      });
    } else {
      observer.pid = run.pid;
      observer.cycles = run.cycles;
      observer.startedAt = run.startedAt;
      observer.logPath = run.logPath;
    }

    readExternalLogDelta(observer);
  }

  for (const [project, observer] of externalRunObservers.entries()) {
    if (seen.has(project)) continue;
    readExternalLogDelta(observer);
    flushExternalObserverBuffer(observer);
    runEvents.emit("done", {
      runId: undefined,
      project,
      timestamp: new Date().toISOString(),
    });
    externalRunObservers.delete(project);
  }
}

if (ENABLE_LEGACY_EXTERNAL_RUN_SCAN) {
  syncExternalRunObservers();
  const externalRunMonitor = setInterval(syncExternalRunObservers, 1000);
  externalRunMonitor.unref();
}

function buildProjectEnv(config: ProjectConfig): Record<string, string> {
  const env: Record<string, string> = {};
  const map: Array<[keyof ProjectConfig, string]> = [
    ["path", "AUTOCLAWDEV_REPO"],
    ["name", "AUTOCLAWDEV_NAME"],
    ["test_cmd", "AUTOCLAWDEV_TEST_CMD"],
    ["lint_cmd", "AUTOCLAWDEV_LINT_CMD"],
    ["security_cmd", "AUTOCLAWDEV_SECURITY_CMD"],
    ["security_dependency_cmd", "AUTOCLAWDEV_SECURITY_DEPENDENCY_CMD"],
    ["performance_cmd", "AUTOCLAWDEV_PERFORMANCE_CMD"],
    ["team_profile", "AUTOCLAWDEV_TEAM_PROFILE"],
    ["speed_profile", "AUTOCLAWDEV_SPEED_PROFILE"],
    ["workflow_type", "AUTOCLAWDEV_WORKFLOW_TYPE"],
    ["base_branch", "AUTOCLAWDEV_BASE_BRANCH"],
    ["integration_branch", "AUTOCLAWDEV_INTEGRATION_BRANCH"],
    ["landing_repo", "AUTOCLAWDEV_LANDING_REPO"],
    ["dev_url", "AUTOCLAWDEV_DEV_URL"],
    ["gh_repo", "AUTOCLAWDEV_GH_REPO"],
    ["research_model", "AUTOCLAWDEV_RESEARCH_MODEL"],
    ["planning_model", "AUTOCLAWDEV_PLANNING_MODEL"],
    ["impl_model", "AUTOCLAWDEV_IMPL_MODEL"],
    ["review_model", "AUTOCLAWDEV_REVIEW_MODEL"],
    ["codex_model", "AUTOCLAWDEV_CODEX_MODEL"],
    ["codex_fix_model", "AUTOCLAWDEV_CODEX_FIX_MODEL"],
  ];
  for (const [field, envVar] of map) {
    const val = config[field];
    if (val != null && val !== "") env[envVar] = String(val);
  }
  if (Array.isArray(config.allowed_override_reasons) && config.allowed_override_reasons.length > 0) {
    env.AUTOCLAWDEV_ALLOWED_OVERRIDE_REASONS = config.allowed_override_reasons.join(",");
  }
  if (config.default_cycles != null) env.AUTOCLAWDEV_DEFAULT_CYCLES = String(config.default_cycles);
  if (config.max_parallel_cycles != null) env.AUTOCLAWDEV_MAX_PARALLEL_CYCLES = String(config.max_parallel_cycles);
  if (config.batch_research_count != null) env.AUTOCLAWDEV_BATCH_RESEARCH_COUNT = String(config.batch_research_count);
  if (config.profile_validation) {
    env.AUTOCLAWDEV_PROFILE_VALIDATION_JSON = JSON.stringify(config.profile_validation);
  }
  env.AUTOCLAWDEV_MEMORY_ENABLED = "1";
  return env;
}

export async function startRun(
  spec: ManagedExecutionSpec,
): Promise<boolean> {
  const { project, cycles, runId } = spec;
  if (activeRuns.has(project)) return false;
  if (spec.command.includes("/") && !existsSync(spec.command)) {
    console.error(`Execution command not found: ${spec.command}`);
    return false;
  }
  mkdirSync(WORKSPACE_DIR, { recursive: true });

  const projectConfig = await getProjectDetailed(project) ?? await getProject(project);
  const configEnv = projectConfig ? buildProjectEnv(projectConfig) : {};
  const nativeFinalization = Boolean(spec.nativeFinalization ?? (spec.mode === "run" && spec.commitPhase));
  const finalizationDir =
    nativeFinalization && runId && (spec.projectPath ?? projectConfig?.path)
      ? join(dirname(getProjectRunConsolePath(spec.projectPath ?? projectConfig?.path ?? WORKSPACE_DIR, runId)), "finalization")
      : undefined;
  const logs: WriteStream[] = [
    createWriteStream(getWorkspacePath(`run-${project}.log`), { flags: "a" }),
    createWriteStream(RUN_LOG, { flags: "a" }),
  ];
  if (runId && spec.projectPath) {
    const consolePath = getProjectRunConsolePath(spec.projectPath, runId);
    mkdirSync(dirname(consolePath), { recursive: true });
    logs.unshift(createWriteStream(consolePath, { flags: "a" }));
  }
  if (finalizationDir) {
    mkdirSync(finalizationDir, { recursive: true });
  }

  const proc = spawn(spec.command, spec.args, {
    cwd: spec.cwd ?? WORKSPACE_DIR,
    env: {
      ...process.env,
      ...configEnv,
      ...spec.env,
      AUTOCLAWDEV_PROJECT: project,
      AUTOCLAWDEV_WORKSPACE: WORKSPACE_DIR,
      ...(runId ? { AUTOCLAWDEV_RUN_ID: runId } : {}),
      ...(spec.artifactRoot ? { AUTOCLAWDEV_RUN_ARTIFACT_ROOT: spec.artifactRoot } : {}),
      ...(nativeFinalization && finalizationDir
        ? {
            AUTOCLAWDEV_NATIVE_FINALIZATION: "1",
            AUTOCLAWDEV_FINALIZATION_DIR: finalizationDir,
          }
        : {}),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const run: ActiveRun = {
    runId,
    mode: spec.mode,
    project,
    cycles,
    startedAt: new Date().toISOString(),
    projectPath: spec.projectPath ?? projectConfig?.path,
    artifactRoot:
      runId && (spec.projectPath ?? projectConfig?.path)
        ? dirname(getProjectRunConsolePath(spec.projectPath ?? projectConfig?.path ?? WORKSPACE_DIR, runId))
        : undefined,
    mainPhase: spec.mainPhase,
    validationPhase: spec.validationPhase,
    commitPhase: spec.commitPhase,
    reportPhase: spec.reportPhase,
    process: proc,
    logs,
    stdoutBuffer: "",
    stderrBuffer: "",
    outputStarted: false,
    degraded: false,
    recoveryRequired: false,
    allowedOverrideReasons: Array.isArray(projectConfig?.allowed_override_reasons)
      ? projectConfig.allowed_override_reasons
      : [],
    nativeFinalization,
    finalizationDir,
    processingFinalization: false,
    handledFinalizationRequests: new Set<string>(),
  };
  activeRuns.set(project, run);
  if (nativeFinalization) {
    run.finalizationTimer = setInterval(() => {
      serviceFinalizationRequests(run);
    }, 200);
    run.finalizationTimer.unref();
  }

  proc.stdout?.on("data", (data: Buffer) => {
    for (const log of logs) log.write(data.toString());
    flushBufferedOutput(run, project, "stdout", data);
  });
  proc.stderr?.on("data", (data: Buffer) => {
    for (const log of logs) log.write(data.toString());
    flushBufferedOutput(run, project, "stderr", data);
  });

  let logsClosed = false;
  const closeLogs = () => {
    if (logsClosed) return;
    logsClosed = true;
    for (const log of logs) log.end();
  };

  proc.on("error", () => {
    activeRuns.delete(project);
    if (run.finalizationTimer) clearInterval(run.finalizationTimer);
    if (run.runId && run.projectPath) {
      updateRecordedOutcome(run, {
        status: "failed",
        summary: "Managed command errored",
      });
      updateRecordedPhase(run, run.mainPhase, "failed", "Managed command errored");
      appendLifecycleEvent(run, "system", "Managed command emitted an error", {
        mode: run.mode,
      });
      appendLifecycleEvent(run, "log_completed", "Run logging completed", {
        status: "failed",
      });
    }
    closeLogs();
  });

  proc.on("close", (code) => {
    activeRuns.delete(project);
    if (run.finalizationTimer) clearInterval(run.finalizationTimer);
    serviceFinalizationRequests(run);
    flushPendingBuffers(run, project);
    closeLogs();
    if (run.runId && run.projectPath) {
      updateRecordedPhase(
        run,
        run.mainPhase,
        code === 0 ? "completed" : "failed",
        code === 0 ? "Managed command finished successfully" : `Exit code ${code ?? -1}`,
      );
      if (run.reportPhase) {
        updateRecordedPhase(
          run,
          run.reportPhase,
          code === 0 ? "completed" : "failed",
          code === 0 ? "Execution report finalized" : `Exit code ${code ?? -1}`,
        );
      }
      updateRecordedOutcome(run, {
        status: code === 0 && !run.disallowedOverrideReason ? "completed" : "failed",
        summary: run.disallowedOverrideReason
          ? `Managed execution rejected disallowed override: ${run.disallowedOverrideReason}`
          : code === 0
          ? (run.degraded ? "Managed execution completed with accepted overrides" : "Managed execution completed")
          : run.recoveryRequired
            ? `Managed execution requires recovery after exit code ${code ?? -1}`
            : `Managed execution exited with code ${code ?? -1}`,
      });
      appendLifecycleEvent(run, "phase_finished", code === 0 ? "Managed execution completed" : "Managed execution failed", {
        phase: run.mainPhase,
        code: code ?? -1,
      });
      appendLifecycleEvent(run, "log_completed", "Run logging completed", {
        status: code === 0 ? "completed" : "failed",
      });
    }
    runEvents.emit("done", {
      runId: run.runId,
      project,
      code,
      timestamp: new Date().toISOString(),
    });
  });

  runEvents.emit("start", {
    runId,
    project,
    cycles,
    timestamp: new Date().toISOString(),
  });

  if (run.runId && run.projectPath) {
    updateRecordedOutcome(run, {
      status: "running",
      summary: "Managed execution started",
    });
    updateRecordedPhase(run, run.mainPhase, "running", "Managed command started");
    appendLifecycleEvent(run, "log_started", "Run logging started", {
      artifactRoot: run.artifactRoot,
    });
    appendLifecycleEvent(run, "phase_started", "Managed execution started", {
      phase: run.mainPhase,
      cycles,
      mode: run.mode,
    });
  }

  return true;
}

export function stopRun(project: string): boolean {
  const run = activeRuns.get(project);
  if (!run) return false;
  activeRuns.delete(project);
  run.process.kill("SIGTERM");
  if (run.runId && run.projectPath) {
    updateRecordedPhase(run, run.mainPhase, "failed", "Run stopped by operator");
    updateRecordedOutcome(run, {
      status: "stopped",
      summary: "Run stopped by operator",
    });
    appendLifecycleEvent(run, "stopped", "Run stopped by operator");
    appendLifecycleEvent(run, "log_completed", "Run logging completed", {
      status: "stopped",
    });
  }
  runEvents.emit("stop", { project, timestamp: new Date().toISOString() });
  return true;
}

export function getActiveRuns(): SharedActiveRun[] {
  const serverRuns = Array.from(activeRuns.values()).map(({ project, cycles, startedAt }) => ({
    runId: activeRuns.get(project)?.runId,
    project,
    cycles,
    startedAt,
  }));

  return [...serverRuns, ...getExternalActiveRuns()];
}

export function readRecentRunEvents(project: string, lines = 120): RunOutputEvent[] {
  const candidates = [
    join(WORKSPACE_DIR, `run-${project}.log`),
    RUN_LOG,
  ];

  for (const logFile of candidates) {
    if (!existsSync(logFile)) continue;
    try {
      const content = readFileSync(logFile, "utf8");
      const cleanedLines = content
        .replace(
          // eslint-disable-next-line no-control-regex
          /\x1b\[[0-9;]*[a-zA-Z]/g,
          "",
        )
        .split("\n")
        .map((line) => line.trimEnd())
        .filter((line) => line.trim().length > 0)
        .slice(-lines);
      return cleanedLines.map((line) => parseRunnerLine(project, line));
    } catch {
      continue;
    }
  }

  return [];
}

export function tailRunLog(lines = 200): string {
  if (!existsSync(RUN_LOG)) return "";
  try {
    return execSync(`tail -n ${lines} "${RUN_LOG}"`, {
      encoding: "utf-8",
    });
  } catch {
    return "";
  }
}
