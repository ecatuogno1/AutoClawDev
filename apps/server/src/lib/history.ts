import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import type {
  EventRecord,
  Experiment,
  ExperimentResult,
  PhaseStatus,
  ProjectStats,
  RunHistoryCompleteness,
  RunOutcome,
  RunOverrideReason,
  RunPhaseRecord,
  RunRecord,
  RunStatus,
} from "@autoclawdev/types";
import { getProjectDetailed, listProjectsDetailed } from "./config.js";
import {
  getLegacyExperimentsPath,
  getLegacyRunLogPath,
  getProjectRunEventsPath,
  getProjectRunConsolePath,
  getProjectRunDir,
  getProjectRunRecoverySummaryPath,
  resolveBuildsDir,
  resolveReviewsDir,
} from "./paths.js";
import {
  appendRunEvent,
  listRunRecords,
  readRunEvents,
  replaceRunEvents,
  writeRunRecord,
} from "./runRecords.js";

const ANSI_PATTERN =
  // eslint-disable-next-line no-control-regex
  /\x1b\[[0-9;]*[a-zA-Z]/g;

interface LegacyExperimentRow {
  id: string;
  timestamp?: string;
  directive?: string;
  description?: string;
  result?: string;
  commit?: string;
  elapsed?: number;
  tools?: unknown;
  domain?: string;
  gh_issue?: string | number;
}

interface ImportedHistoryProjectResult {
  key: string;
  dryRun: boolean;
  imported: number;
  skipped: number;
  legacyExperiments: number;
  fullHistory: number;
  partialHistory: number;
}

interface LegacyChunkDetails {
  lines: string[];
  overrideReason?: RunOverrideReason;
  degraded: boolean;
  mergeFailed: boolean;
  revertFailed: boolean;
  preservedBranch?: string;
  preservedWorktree?: string;
  commit?: string;
}

interface DerivedExecutionDescriptor {
  artifactRoot: string;
  consoleSources: string[];
  createdAt: string;
  events: EventRecord[];
  historyCompleteness: RunHistoryCompleteness;
  outcome: RunOutcome;
  phases: RunPhaseRecord[];
  record: RunRecord;
  runId: string;
  updatedAt: string;
}

function sanitizeLogLine(line: string): string {
  return line.replace(ANSI_PATTERN, "").trimEnd();
}

function safeReadText(path: string): string | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return undefined;
  }
}

function parseMetaFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    result[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return result;
}

function normalizeTimestamp(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function slugSegment(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function summarizeProgress(markdown?: string): string | undefined {
  if (!markdown) return undefined;
  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    return line.replace(/^[-*]\s+/, "").slice(0, 200);
  }
  return undefined;
}

function phaseRecord(args: {
  id: string;
  runId: string;
  name: string;
  status: PhaseStatus;
  startedAt?: string;
  completedAt?: string;
  detail?: string;
}): RunPhaseRecord {
  return {
    id: args.id,
    runId: args.runId,
    name: args.name,
    status: args.status,
    startedAt: args.startedAt,
    completedAt: args.completedAt,
    detail: args.detail,
  };
}

function phaseStatusFromRun(status: RunStatus): PhaseStatus {
  return status === "completed" ? "completed" : "failed";
}

function deriveExecutionStatus(meta: Record<string, string>, fallbackUpdatedAt: string): {
  historyCompleteness: RunHistoryCompleteness;
  outcome: RunOutcome;
  status: RunStatus;
  updatedAt: string;
} {
  const exitCodeRaw = meta.exit_code;
  const exitCode = exitCodeRaw !== undefined && exitCodeRaw !== ""
    ? Number(exitCodeRaw)
    : undefined;
  const hasEndedAt = Boolean(meta.ended_at);
  const updatedAt = normalizeTimestamp(meta.ended_at, fallbackUpdatedAt);

  if (Number.isFinite(exitCode)) {
    return {
      status: exitCode === 0 ? "completed" : "failed",
      outcome: exitCode === 0 ? "clean_pass" : "failed",
      historyCompleteness: "full",
      updatedAt,
    };
  }

  if (hasEndedAt) {
    return {
      status: "completed",
      outcome: "clean_pass",
      historyCompleteness: "full",
      updatedAt,
    };
  }

  return {
    status: "failed",
    outcome: "failed",
    historyCompleteness: "partial",
    updatedAt: fallbackUpdatedAt,
  };
}

function collectStampedLogs(dirPath: string, stamp: string): string[] {
  if (!existsSync(dirPath)) return [];
  return readdirSync(dirPath)
    .filter((entry) => entry.includes(stamp) && (entry.endsWith(".log") || entry.endsWith(".typescript")))
    .map((entry) => join(dirPath, entry))
    .filter((path) => existsSync(path))
    .sort();
}

function collectBuildMetaFiles(buildsDir: string): string[] {
  if (!existsSync(buildsDir)) return [];
  const stack = [buildsDir];
  const metaFiles: string[] = [];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const nextPath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(nextPath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".meta.txt")) {
        metaFiles.push(nextPath);
      }
    }
  }

  return metaFiles.sort();
}

function buildDerivedEvents(args: {
  projectKey: string;
  runId: string;
  mode: "review" | "build";
  createdAt: string;
  updatedAt: string;
  status: RunStatus;
  summary: string;
  consoleSources: string[];
  hasReport: boolean;
  sourcePath: string;
}): EventRecord[] {
  const mainPhase = args.mode === "review" ? "review" : "build";
  const reportMessage = args.mode === "review" ? "Review artifacts captured" : "Build report captured";
  const base: EventRecord[] = [
    {
      id: `${args.runId}-queued`,
      runId: args.runId,
      projectKey: args.projectKey,
      type: "queued",
      timestamp: args.createdAt,
      message: `${args.mode} artifact synced`,
      data: { sourcePath: args.sourcePath, derived: true },
    },
    {
      id: `${args.runId}-preflight-finished`,
      runId: args.runId,
      projectKey: args.projectKey,
      type: "phase_finished",
      timestamp: args.createdAt,
      message: "Preflight metadata captured",
      data: { phase: "preflight", status: "completed", derived: true },
    },
  ];

  if (args.consoleSources.length > 0) {
    base.push({
      id: `${args.runId}-log-started`,
      runId: args.runId,
      projectKey: args.projectKey,
      type: "log_started",
      timestamp: args.createdAt,
      message: "Console log copied into typed history",
      data: { sources: args.consoleSources, derived: true },
    });
  }

  base.push({
    id: `${args.runId}-${mainPhase}-finished`,
    runId: args.runId,
    projectKey: args.projectKey,
    type: "phase_finished",
    timestamp: args.updatedAt,
    message: args.summary,
    data: { phase: mainPhase, status: phaseStatusFromRun(args.status), derived: true },
  });

  if (args.hasReport) {
    base.push({
      id: `${args.runId}-report-finished`,
      runId: args.runId,
      projectKey: args.projectKey,
      type: "phase_finished",
      timestamp: args.updatedAt,
      message: reportMessage,
      data: { phase: "report", status: "completed", derived: true },
    });
  }

  if (args.consoleSources.length > 0) {
    base.push({
      id: `${args.runId}-log-completed`,
      runId: args.runId,
      projectKey: args.projectKey,
      type: "log_completed",
      timestamp: args.updatedAt,
      message: "Console log sync complete",
      data: { sources: args.consoleSources, derived: true },
    });
  }

  return base;
}

function writeDerivedArtifacts(
  projectPath: string,
  descriptor: DerivedExecutionDescriptor,
): void {
  mkdirSync(descriptor.artifactRoot, { recursive: true });
  writeRunRecord(projectPath, descriptor.record);
  replaceRunEvents(projectPath, descriptor.runId, descriptor.events);

  if (descriptor.consoleSources.length === 0) return;
  const content = descriptor.consoleSources
    .map((source) => safeReadText(source))
    .filter((text): text is string => Boolean(text))
    .map((text, index) => {
      const source = descriptor.consoleSources[index] ?? "unknown";
      return [`# Source: ${source}`, text.trimEnd()].join("\n");
    })
    .filter(Boolean)
    .join("\n\n");

  if (content) {
    writeFileSync(getProjectRunConsolePath(projectPath, descriptor.runId), `${content}\n`, "utf-8");
  }
}

function buildReviewHistoryDescriptor(args: {
  manifestSource: string;
  metaFile: string;
  projectKey: string;
  projectPath: string;
  reviewsDir: string;
}): DerivedExecutionDescriptor | undefined {
  const metaContent = safeReadText(args.metaFile);
  if (!metaContent) return undefined;
  const meta = parseMetaFile(metaContent);
  const baseName = basename(args.metaFile, ".meta.txt");
  const stats = statSync(args.metaFile);
  const createdAt = normalizeTimestamp(meta.started_at, stats.mtime.toISOString());
  const { historyCompleteness, outcome, status, updatedAt } = deriveExecutionStatus(meta, stats.mtime.toISOString());
  const runId = `review-${slugSegment(baseName)}`;
  const progress = safeReadText(join(args.reviewsDir, "progress.md"));
  const summary = summarizeProgress(progress) || `Deep review ${meta.session_name || baseName}`;
  const consoleSources = [
    meta.tty_log,
    ...collectStampedLogs(args.reviewsDir, baseName.split("-").slice(-1)[0] ?? baseName),
  ].filter((path, index, entries): path is string => Boolean(path) && entries.indexOf(path) === index && existsSync(path));
  const hasReport = ["audit-report.md", "execution-plan.md", "progress.md"]
    .some((name) => existsSync(join(args.reviewsDir, name)));
  const artifactRoot = getProjectRunDir(args.projectPath, runId);
  const phases = [
    phaseRecord({
      id: `${runId}-preflight`,
      runId,
      name: "preflight",
      status: "completed",
      startedAt: createdAt,
      completedAt: createdAt,
      detail: "Review metadata captured",
    }),
    phaseRecord({
      id: `${runId}-review`,
      runId,
      name: "review",
      status: phaseStatusFromRun(status),
      startedAt: createdAt,
      completedAt: updatedAt,
      detail: summary,
    }),
    phaseRecord({
      id: `${runId}-report`,
      runId,
      name: "report",
      status: hasReport ? "completed" : (status === "completed" ? "queued" : "failed"),
      startedAt: hasReport ? createdAt : undefined,
      completedAt: hasReport ? updatedAt : undefined,
      detail: hasReport ? "Review artifacts available" : "Review artifacts missing",
    }),
  ];
  const record: RunRecord = {
    id: runId,
    projectKey: args.projectKey,
    mode: "review",
    status,
    source: "native",
    cycles: 1,
    workflowType: "deep_review",
    teamProfile: meta.provider || "review",
    createdAt,
    updatedAt,
    artifactRoot,
    manifestSource: args.manifestSource,
    outcome,
    historyCompleteness,
    preflightOk: true,
    summary,
    phases,
  };

  return {
    runId,
    createdAt,
    updatedAt,
    historyCompleteness,
    outcome,
    phases,
    artifactRoot,
    consoleSources,
    events: buildDerivedEvents({
      projectKey: args.projectKey,
      runId,
      mode: "review",
      createdAt,
      updatedAt,
      status,
      summary,
      consoleSources,
      hasReport,
      sourcePath: args.metaFile,
    }),
    record,
  };
}

function buildBuildHistoryDescriptor(args: {
  buildsDir: string;
  manifestSource: string;
  metaFile: string;
  projectKey: string;
  projectPath: string;
}): DerivedExecutionDescriptor | undefined {
  const metaContent = safeReadText(args.metaFile);
  if (!metaContent) return undefined;
  const meta = parseMetaFile(metaContent);
  const stats = statSync(args.metaFile);
  const createdAt = normalizeTimestamp(meta.started_at, stats.mtime.toISOString());
  const { historyCompleteness, outcome, status, updatedAt } = deriveExecutionStatus(meta, stats.mtime.toISOString());
  const planDir = dirname(args.metaFile);
  const baseName = basename(args.metaFile, ".meta.txt");
  const stamp = baseName.replace(/^build-/, "");
  const planName = meta.plan || basename(planDir);
  const runId = `build-${slugSegment(planName)}-${slugSegment(stamp)}`;
  const progress = safeReadText(join(planDir, "progress.md"));
  const plan = safeReadText(join(planDir, "plan.md"));
  const summary = summarizeProgress(progress) || summarizeProgress(plan) || `Build ${planName}`;
  const consoleSources = collectStampedLogs(planDir, stamp);
  const hasReport = Boolean(progress) || Boolean(plan);
  const artifactRoot = getProjectRunDir(args.projectPath, runId);
  const phases = [
    phaseRecord({
      id: `${runId}-preflight`,
      runId,
      name: "preflight",
      status: "completed",
      startedAt: createdAt,
      completedAt: createdAt,
      detail: "Build metadata captured",
    }),
    phaseRecord({
      id: `${runId}-build`,
      runId,
      name: "build",
      status: phaseStatusFromRun(status),
      startedAt: createdAt,
      completedAt: updatedAt,
      detail: summary,
    }),
    phaseRecord({
      id: `${runId}-report`,
      runId,
      name: "report",
      status: hasReport ? "completed" : (status === "completed" ? "queued" : "failed"),
      startedAt: hasReport ? createdAt : undefined,
      completedAt: hasReport ? updatedAt : undefined,
      detail: hasReport ? "Build artifacts available" : "Build artifacts missing",
    }),
  ];
  const record: RunRecord = {
    id: runId,
    projectKey: args.projectKey,
    mode: "build",
    status,
    source: "native",
    cycles: 1,
    workflowType: "build_plan",
    teamProfile: meta.provider || "build",
    createdAt,
    updatedAt,
    artifactRoot,
    manifestSource: args.manifestSource,
    outcome,
    historyCompleteness,
    preflightOk: true,
    summary,
    phases,
  };

  return {
    runId,
    createdAt,
    updatedAt,
    historyCompleteness,
    outcome,
    phases,
    artifactRoot,
    consoleSources,
    events: buildDerivedEvents({
      projectKey: args.projectKey,
      runId,
      mode: "build",
      createdAt,
      updatedAt,
      status,
      summary,
      consoleSources,
      hasReport,
      sourcePath: args.metaFile,
    }),
    record,
  };
}

function syncDerivedExecutionHistory(projectKey: string, projectPath: string, manifestSource: string): void {
  const reviewsDir = resolveReviewsDir(projectPath);
  if (existsSync(reviewsDir)) {
    for (const metaFile of readdirSync(reviewsDir)
      .filter((entry) => entry.endsWith(".meta.txt"))
      .map((entry) => join(reviewsDir, entry))) {
      const descriptor = buildReviewHistoryDescriptor({
        manifestSource,
        metaFile,
        projectKey,
        projectPath,
        reviewsDir,
      });
      if (!descriptor) continue;
      writeDerivedArtifacts(projectPath, descriptor);
    }
  }

  const buildsDir = resolveBuildsDir(projectPath);
  if (existsSync(buildsDir)) {
    for (const metaFile of collectBuildMetaFiles(buildsDir)) {
      const descriptor = buildBuildHistoryDescriptor({
        buildsDir,
        manifestSource,
        metaFile,
        projectKey,
        projectPath,
      });
      if (!descriptor) continue;
      writeDerivedArtifacts(projectPath, descriptor);
    }
  }
}

function normalizeTools(input: unknown): string[] | undefined {
  const tools = Array.isArray(input)
    ? input.map(String)
    : typeof input === "string"
      ? input.split("+")
      : [];
  const normalized = tools
    .map((tool) => tool.trim().toLowerCase())
    .filter(Boolean);
  return normalized.length > 0 ? normalized : undefined;
}

function repairMalformedExperimentLine(line: string): string | null {
  const descriptionMarker = '"description":"';
  const resultMarker = '","result":"';
  const descriptionIndex = line.indexOf(descriptionMarker);
  if (descriptionIndex < 0) return null;
  const descriptionStart = descriptionIndex + descriptionMarker.length;
  const resultIndex = line.indexOf(resultMarker, descriptionStart);
  if (resultIndex < 0) return null;
  const rawDescription = line.slice(descriptionStart, resultIndex);
  const repairedDescription = JSON.stringify(rawDescription).slice(1, -1);
  return `${line.slice(0, descriptionStart)}${repairedDescription}${line.slice(resultIndex)}`;
}

function parseLegacyExperimentLine(line: string): LegacyExperimentRow | null {
  for (const candidate of [line, repairMalformedExperimentLine(line)]) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate) as LegacyExperimentRow;
      return {
        ...parsed,
        tools: normalizeTools(parsed.tools),
      };
    } catch {
      // Ignore malformed legacy lines.
    }
  }
  return null;
}

function readLegacyExperiments(projectKey: string): LegacyExperimentRow[] {
  const filePath = getLegacyExperimentsPath(projectKey);
  if (!existsSync(filePath)) return [];
  try {
    return readFileSync(filePath, "utf-8")
      .split("\n")
      .filter(Boolean)
      .map((line) => parseLegacyExperimentLine(line))
      .filter((row): row is LegacyExperimentRow => Boolean(row));
  } catch {
    return [];
  }
}

function readLegacyLogChunks(projectKey: string): Map<string, LegacyChunkDetails> {
  const logPath = getLegacyRunLogPath(projectKey);
  const chunks = new Map<string, LegacyChunkDetails>();
  if (!existsSync(logPath)) return chunks;

  let currentId: string | undefined;
  let current: LegacyChunkDetails | undefined;
  const content = readFileSync(logPath, "utf-8");
  for (const rawLine of content.split("\n")) {
    const line = sanitizeLogLine(rawLine);
    if (!line) continue;

    const cycleMatch = line.match(/CYCLE\s+\d+\s+\/\s+\d+\s+[-\u2014]\s+(exp-\d+)/i);
    if (cycleMatch) {
      currentId = cycleMatch[1];
      current = chunks.get(currentId) ?? {
        lines: [],
        degraded: false,
        mergeFailed: false,
        revertFailed: false,
      };
      chunks.set(currentId, current);
    }

    if (!currentId || !current) continue;
    current.lines.push(line);

    if (line.includes("Validation matched known baseline failures")) {
      current.overrideReason = "baseline_match";
      current.degraded = true;
    } else if (line.includes("Validation hit pre-existing unrelated test failures")) {
      current.overrideReason = "preexisting_unrelated_failure";
      current.degraded = true;
    } else if (line.includes("Validation hit environment-only issues")) {
      current.overrideReason = "environment_issue";
      current.degraded = true;
    } else if (line.includes("Validation surfaced broad repo-wide failures")) {
      current.overrideReason = "broad_repo_failure";
      current.degraded = true;
    } else if (line.includes("Non-blocking")) {
      current.degraded = true;
    }

    if (line.includes("Commit: Merge failed") || line.includes("Merge with strategy ort failed")) {
      current.mergeFailed = true;
    }
    if (line.includes("Revert:") && line.includes("failed")) {
      current.revertFailed = true;
    }

    const branchMatch = line.match(/Preserved branch:\s+(.+)$/);
    if (branchMatch) {
      current.preservedBranch = branchMatch[1];
    }
    const worktreeMatch = line.match(/Preserved worktree:\s+(.+)$/);
    if (worktreeMatch) {
      current.preservedWorktree = worktreeMatch[1];
    }
    const commitMatch = line.match(/commit\s+([0-9a-f]{7,40})/i);
    if (commitMatch) {
      current.commit = commitMatch[1];
    }
  }

  return chunks;
}

function normalizeOutcome(record: RunRecord): RunOutcome | undefined {
  if (record.outcome) return record.outcome;
  if (record.status === "completed") return "clean_pass";
  if (record.status === "failed" || record.status === "preflight_failed") return "failed";
  return undefined;
}

function hasOpenRecovery(record: RunRecord): boolean {
  return record.recovery?.required === true && (record.recovery.status ?? "open") === "open";
}

export function runOutcomeToExperimentResult(record: RunRecord): ExperimentResult {
  const outcome = normalizeOutcome(record);
  if (outcome === "clean_pass") return "pass";
  if (outcome === "degraded_pass") return "degraded_pass";
  return "fail";
}

export function isPassingExperiment(result: ExperimentResult): boolean {
  return result === "pass" || result === "degraded_pass";
}

function extractCommitFromEvents(events: EventRecord[]): string | undefined {
  for (const event of [...events].reverse()) {
    const commitHash = typeof event.data?.commitHash === "string"
      ? event.data.commitHash
      : undefined;
    if (commitHash) return commitHash;
  }
  return undefined;
}

function extractToolsFromEvents(events: EventRecord[]): string[] | undefined {
  const tools = new Set<string>();
  for (const event of events) {
    const agent = typeof event.data?.agent === "string" ? event.data.agent : undefined;
    if (agent) tools.add(agent.toLowerCase());
  }
  return tools.size > 0 ? [...tools] : undefined;
}

function summarizeRun(record: RunRecord): string {
  if (record.summary) return record.summary;
  const outcome = normalizeOutcome(record);
  if (outcome === "degraded_pass") return `${record.mode} completed with accepted overrides`;
  if (outcome === "recovery_required") return `${record.mode} requires recovery`;
  if (outcome === "clean_pass") return `${record.mode} completed cleanly`;
  return `${record.mode} run`;
}

export function runsToExperiments(
  runs: RunRecord[],
  options: { project?: string; eventsByRunId?: Map<string, EventRecord[]> } = {},
): Experiment[] {
  return runs
    .filter((record) => Boolean(normalizeOutcome(record)))
    .map((record) => {
      const events = options.eventsByRunId?.get(record.id) ?? [];
      const description = summarizeRun(record);
      const commit = extractCommitFromEvents(events);
      const elapsedSeconds = Math.max(
        0,
        Math.floor(
          (new Date(record.updatedAt).getTime() - new Date(record.createdAt).getTime()) / 1000,
        ),
      );
      return {
        id: record.id,
        timestamp: record.createdAt,
        directive: record.mode,
        description,
        result: runOutcomeToExperimentResult(record),
        commit,
        elapsed: Number.isFinite(elapsedSeconds) ? elapsedSeconds : undefined,
        tools: extractToolsFromEvents(events),
        project: options.project ?? record.projectKey,
      } satisfies Experiment;
    })
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp));
}

export function buildProjectStatsFromRuns(
  runs: RunRecord[],
  options: { project?: string } = {},
): ProjectStats {
  const experiments = runsToExperiments(runs, options);
  const cleanPassed = experiments.filter((entry) => entry.result === "pass").length;
  const degradedPassed = experiments.filter((entry) => entry.result === "degraded_pass").length;
  const recoveryRequired = runs.filter((record) => hasOpenRecovery(record)).length;
  const passed = cleanPassed + degradedPassed;
  const failed = Math.max(0, experiments.length - passed);
  return {
    total: experiments.length,
    passed,
    cleanPassed,
    degradedPassed,
    failed,
    recoveryRequired,
    passRate: experiments.length > 0 ? Math.round((passed / experiments.length) * 100) : 0,
    lastRun: runs[0] ?? null,
  };
}

export async function listProjectHistory(projectKey: string, limit = 250): Promise<RunRecord[]> {
  const manifest = await getProjectDetailed(projectKey);
  if (!manifest) return [];
  syncDerivedExecutionHistory(manifest.key, manifest.path, manifest.manifestSource);
  return listRunRecords(manifest.path, limit);
}

export async function listAllHistory(limit = 250): Promise<RunRecord[]> {
  const manifests = await listProjectsDetailed();
  for (const manifest of manifests) {
    syncDerivedExecutionHistory(manifest.key, manifest.path, manifest.manifestSource);
  }
  return manifests
    .flatMap((manifest) => listRunRecords(manifest.path, limit))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, limit);
}

export async function getAllProjectedExperiments(): Promise<Experiment[]> {
  const manifests = await listProjectsDetailed();
  const experiments = manifests.flatMap((manifest) => {
    syncDerivedExecutionHistory(manifest.key, manifest.path, manifest.manifestSource);
    const runs = listRunRecords(manifest.path, 500);
    return runsToExperiments(runs, { project: manifest.key });
  });
  return experiments.sort((left, right) => right.timestamp.localeCompare(left.timestamp));
}

export async function getProjectedExperiments(projectKey: string): Promise<Experiment[]> {
  const manifest = await getProjectDetailed(projectKey);
  if (!manifest) return [];
  syncDerivedExecutionHistory(manifest.key, manifest.path, manifest.manifestSource);
  const runs = listRunRecords(manifest.path, 500);
  return runsToExperiments(runs, { project: manifest.key });
}

function writeRecoverySummary(
  projectPath: string,
  runId: string,
  details: LegacyChunkDetails,
) {
  const summaryPath = getProjectRunRecoverySummaryPath(projectPath, runId);
  const lines = [
    `Recovery required for imported legacy run ${runId}`,
    details.preservedBranch ? `Preserved branch: ${details.preservedBranch}` : undefined,
    details.preservedWorktree ? `Preserved worktree: ${details.preservedWorktree}` : undefined,
    details.revertFailed ? "Revert also failed." : undefined,
  ].filter(Boolean);
  writeFileSync(summaryPath, `${lines.join("\n")}\n`, "utf-8");
  return summaryPath;
}

function buildImportedRunRecord(args: {
  projectKey: string;
  projectPath: string;
  manifestSource: string;
  experiment: LegacyExperimentRow;
  chunk?: LegacyChunkDetails;
}): RunRecord {
  const createdAt = args.experiment.timestamp || new Date().toISOString();
  const runId = `legacy-${args.projectKey}-${args.experiment.id}`;
  const historyCompleteness: RunHistoryCompleteness = args.chunk?.lines.length ? "full" : "partial";
  let outcome: RunOutcome = args.experiment.result === "pass" ? "clean_pass" : "failed";
  if (args.chunk?.degraded && outcome === "clean_pass") {
    outcome = "degraded_pass";
  }
  if (args.chunk?.mergeFailed || args.chunk?.revertFailed) {
    outcome = "recovery_required";
  }

  return {
    id: runId,
    projectKey: args.projectKey,
    mode: "run",
    status:
      outcome === "clean_pass" || outcome === "degraded_pass"
        ? "completed"
        : "failed",
    source: "legacy_import",
    cycles: 1,
    workflowType: "legacy",
    teamProfile: "legacy_import",
    createdAt,
    updatedAt: createdAt,
    artifactRoot: getProjectRunDir(args.projectPath, runId),
    manifestSource: args.manifestSource,
    outcome,
    historyCompleteness,
    overrideReason: args.chunk?.overrideReason,
    preflightOk: undefined,
    summary: args.experiment.description || args.experiment.directive || `Imported ${args.experiment.id}`,
    phases: [],
  };
}

export async function importLegacyHistory(options: {
  projectKey?: string;
  dryRun?: boolean;
} = {}): Promise<{
  generatedAt: string;
  dryRun: boolean;
  projects: ImportedHistoryProjectResult[];
}> {
  const manifests = options.projectKey
    ? [await getProjectDetailed(options.projectKey)].filter(Boolean)
    : await listProjectsDetailed();

  const results: ImportedHistoryProjectResult[] = [];

  for (const manifest of manifests) {
    if (!manifest) continue;
    const experiments = readLegacyExperiments(manifest.key);
    const chunks = readLegacyLogChunks(manifest.key);
    let imported = 0;
    let skipped = 0;
    let fullHistory = 0;
    let partialHistory = 0;

    for (const experiment of experiments) {
      const runId = `legacy-${manifest.key}-${experiment.id}`;
      const targetDir = getProjectRunDir(manifest.path, runId);
      const recordPath = join(targetDir, "run.json");
      if (existsSync(recordPath)) {
        skipped += 1;
        continue;
      }

      const chunk = chunks.get(experiment.id);
      const record = buildImportedRunRecord({
        projectKey: manifest.key,
        projectPath: manifest.path,
        manifestSource: manifest.manifestSource,
        experiment,
        chunk,
      });

      if (record.historyCompleteness === "full") {
        fullHistory += 1;
      } else {
        partialHistory += 1;
      }

      if (options.dryRun) {
        imported += 1;
        continue;
      }

      writeRunRecord(manifest.path, record);
      appendRunEvent(manifest.path, {
        id: `${record.id}-history-imported`,
        runId: record.id,
        projectKey: manifest.key,
        type: "history_imported",
        timestamp: record.createdAt,
        message: "Imported legacy experiment history",
        data: {
          legacyExperimentId: experiment.id,
          historyCompleteness: record.historyCompleteness,
          legacyLogPath: basename(getLegacyRunLogPath(manifest.key)),
        },
      });

      if (chunk?.lines.length) {
        mkdirSync(targetDir, { recursive: true });
        writeFileSync(getProjectRunConsolePath(manifest.path, record.id), `${chunk.lines.join("\n")}\n`, "utf-8");
      }

      if (record.outcome === "recovery_required" && chunk) {
        const summaryPath = writeRecoverySummary(manifest.path, record.id, chunk);
        writeRunRecord(manifest.path, {
          ...record,
          recovery: {
            required: true,
            branch: chunk.preservedBranch,
            worktree: chunk.preservedWorktree,
            summaryPath,
          },
        });
      }

      imported += 1;
    }

    results.push({
      key: manifest.key,
      dryRun: Boolean(options.dryRun),
      imported,
      skipped,
      legacyExperiments: experiments.length,
      fullHistory,
      partialHistory,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    dryRun: Boolean(options.dryRun),
    projects: results,
  };
}

export function resetImportedHistory(projectPath: string): void {
  const runs = listRunRecords(projectPath, 1000);
  for (const record of runs) {
    if (record.source !== "legacy_import") continue;
    rmSync(getProjectRunDir(projectPath, record.id), { recursive: true, force: true });
  }
}

export function readLatestRunConsole(projectPath: string): { source: string | null; lines: string[] } {
  const runs = listRunRecords(projectPath, 100);
  for (const record of runs) {
    const consolePath = getProjectRunConsolePath(projectPath, record.id);
    if (!existsSync(consolePath)) continue;
    const lines = readFileSync(consolePath, "utf-8")
      .split("\n")
      .map((line) => line.trimEnd())
      .filter((line) => line.trim().length > 0)
      .slice(-200);
    return { source: consolePath, lines };
  }
  return { source: null, lines: [] };
}

export function buildEventsByRunId(projectPath: string, runs: RunRecord[]): Map<string, EventRecord[]> {
  return new Map(runs.map((record) => [record.id, readRunEvents(projectPath, record.id)]));
}
