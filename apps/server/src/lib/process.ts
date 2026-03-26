import { spawn, execSync, type ChildProcess } from "node:child_process";
import {
  closeSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  readFileSync,
  readdirSync,
  statSync,
  type WriteStream,
} from "node:fs";
import { join, dirname } from "node:path";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";
import type {
  ActiveRun as SharedActiveRun,
  ProjectConfig,
  RunOutputEvent,
} from "@autoclawdev/types";
import { getWorkspaceDir, getWorkspacePath } from "./paths.js";
import { getProject } from "./config.js";

const WORKSPACE_DIR = getWorkspaceDir();
const SERVER_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = process.env.AUTOCLAWDEV_REPO_ROOT || join(SERVER_DIR, "../../../../");
const WORKSPACE_RUNNER = getWorkspacePath("runner.sh");
const RUNNER_SCRIPT = process.env.AUTOCLAWDEV_RUNNER || (
  existsSync(join(REPO_ROOT, "scripts", "runner.sh"))
    ? join(REPO_ROOT, "scripts", "runner.sh")
    : WORKSPACE_RUNNER
);
const RUN_LOG = getWorkspacePath("run.log");

interface ActiveRun extends SharedActiveRun {
  project: string;
  cycles: number;
  startedAt: string;
  process: ChildProcess;
  logs: WriteStream[];
  stdoutBuffer: string;
  stderrBuffer: string;
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

function flushBufferedOutput(run: ActiveRun, project: string, source: "stdout" | "stderr", chunk: Buffer) {
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
    runEvents.emit("output", parseRunnerLine(project, text));
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
      runEvents.emit("output", parseRunnerLine(project, pending));
    }
    run[bufferKey] = "";
  }
}

const activeRuns = new Map<string, ActiveRun>();
const externalRunObservers = new Map<string, ExternalRunObserver>();
export const runEvents = new EventEmitter();

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
  return listExternalRunMetadata().map(({ project, cycles, startedAt }) => ({
    project,
    cycles,
    startedAt,
  }));
}

function listExternalRunMetadata(): Array<{
  project: string;
  pid: number;
  cycles: number;
  startedAt: string;
  logPath: string;
}> {
  if (!existsSync(WORKSPACE_DIR)) return [];

  const runs: Array<{
    project: string;
    pid: number;
    cycles: number;
    startedAt: string;
    logPath: string;
  }> = [];

  for (const entry of readdirSync(WORKSPACE_DIR)) {
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

  const fd = openSync(observer.logPath, "r");
  try {
    const length = size - observer.offset;
    const chunk = Buffer.alloc(length);
    const bytesRead = readSync(fd, chunk, 0, length, observer.offset);
    observer.offset = size;
    if (bytesRead > 0) {
      emitExternalOutputChunk(observer, chunk.subarray(0, bytesRead));
    }
  } finally {
    closeSync(fd);
  }
}

function syncExternalRunObservers() {
  const metadata = listExternalRunMetadata();
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
      project,
      timestamp: new Date().toISOString(),
    });
    externalRunObservers.delete(project);
  }
}

syncExternalRunObservers();
const externalRunMonitor = setInterval(syncExternalRunObservers, 1000);
externalRunMonitor.unref();

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
  if (config.default_cycles != null) env.AUTOCLAWDEV_DEFAULT_CYCLES = String(config.default_cycles);
  if (config.max_parallel_cycles != null) env.AUTOCLAWDEV_MAX_PARALLEL_CYCLES = String(config.max_parallel_cycles);
  if (config.batch_research_count != null) env.AUTOCLAWDEV_BATCH_RESEARCH_COUNT = String(config.batch_research_count);
  if (config.profile_validation) {
    env.AUTOCLAWDEV_PROFILE_VALIDATION_JSON = JSON.stringify(config.profile_validation);
  }
  env.AUTOCLAWDEV_MEMORY_ENABLED = "1";
  return env;
}

export async function startRun(project: string, cycles: number): Promise<boolean> {
  if (activeRuns.has(project)) return false;
  if (!existsSync(RUNNER_SCRIPT)) {
    console.error(`Runner script not found: ${RUNNER_SCRIPT}`);
    return false;
  }
  mkdirSync(WORKSPACE_DIR, { recursive: true });

  const projectConfig = await getProject(project);
  const configEnv = projectConfig ? buildProjectEnv(projectConfig) : {};

  const logs = [
    createWriteStream(getWorkspacePath(`run-${project}.log`), { flags: "w" }),
    createWriteStream(RUN_LOG, { flags: "w" }),
  ];

  const proc = spawn("bash", [RUNNER_SCRIPT, String(cycles), "", project], {
    cwd: WORKSPACE_DIR,
    env: {
      ...process.env,
      ...configEnv,
      AUTOCLAWDEV_PROJECT: project,
      AUTOCLAWDEV_RUNNER: RUNNER_SCRIPT,
      AUTOCLAWDEV_WORKSPACE: WORKSPACE_DIR,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const run: ActiveRun = {
    project,
    cycles,
    startedAt: new Date().toISOString(),
    process: proc,
    logs,
    stdoutBuffer: "",
    stderrBuffer: "",
  };
  activeRuns.set(project, run);

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
    closeLogs();
  });

  proc.on("close", (code) => {
    activeRuns.delete(project);
    flushPendingBuffers(run, project);
    closeLogs();
    runEvents.emit("done", {
      project,
      code,
      timestamp: new Date().toISOString(),
    });
  });

  runEvents.emit("start", {
    project,
    cycles,
    timestamp: new Date().toISOString(),
  });

  return true;
}

export function stopRun(project: string): boolean {
  const run = activeRuns.get(project);
  if (!run) return false;
  activeRuns.delete(project);
  run.process.kill("SIGTERM");
  runEvents.emit("stop", { project, timestamp: new Date().toISOString() });
  return true;
}

export function getActiveRuns(): SharedActiveRun[] {
  const serverRuns = Array.from(activeRuns.values()).map(({ project, cycles, startedAt }) => ({
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
