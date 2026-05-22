import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ExecutionApproval,
  EventRecord,
  PortfolioAuditRow,
  PreflightReport,
  ProjectReadiness,
  RunMode,
  RunPlan,
  RunRecord,
} from "@autoclawdev/types";
import { getActiveRuns, startRun, stopRun, type ManagedExecutionSpec } from "./process.js";
import { getProjectDetailed, listProjectsDetailed } from "./config.js";
import { buildProjectStatsFromRuns, listProjectHistory } from "./history.js";
import { resolveMemoryDir, resolveReviewsDir } from "./paths.js";
import {
  buildPortfolioAuditRow,
  buildProjectReadinessEntry,
} from "./portfolio.js";
import { runPreflight } from "./preflight.js";
import {
  appendRunEvent,
  createRunId,
  listRunRecords,
  readRunRecord,
  readRunEvents,
  updateRunRecord,
  writeRunRecord,
} from "./runRecords.js";
import { updateWebAuditRunRecordFromRoot } from "./webAudit.js";

const SERVER_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT =
  process.env.AUTOCLAWDEV_REPO_ROOT || join(SERVER_DIR, "../../../../");
const LEGACY_RUNNER =
  process.env.AUTOCLAWDEV_RUNNER || join(REPO_ROOT, "scripts", "runner.sh");
const REVIEW_WORKER_DIST = join(REPO_ROOT, "apps", "server", "dist", "workers", "reviewWorker.js");
const REVIEW_WORKER_SRC = join(REPO_ROOT, "apps", "server", "src", "workers", "reviewWorker.ts");
const LEGACY_BUILD = join(REPO_ROOT, "scripts", "build.sh");
const STRUCTURED_WEB_AUDIT =
  process.env.AUTOCLAWDEV_WEB_AUDIT || join(REPO_ROOT, "scripts", "web_audit_v2.py");

function resolvePlanPhases(mode: RunMode): string[] {
  switch (mode) {
    case "run":
      return ["preflight", "workflow", "validation", "commit"];
    case "review":
      return ["preflight", "audit", "fix", "validate", "report"];
    case "build":
      return ["preflight", "build", "report"];
    case "audit":
      return ["preflight", "audit", "report"];
  }
}

function resolveWorkflowTypeForMode(mode: RunMode, workflowType: string | undefined): string {
  if (mode === "audit") return "audit";
  if (mode === "review") return "deep-review";
  if (mode === "build") return workflowType ?? "standard";
  if (workflowType === "audit") return "standard";
  return workflowType ?? "standard";
}

function buildRunPlan(
  projectKey: string,
  cycles: number,
  mode: RunMode,
  workflowType: string,
  teamProfile: string,
  artifactRoot: string,
  validationProfiles: RunPlan["validationProfiles"],
): RunPlan {
  return {
    projectKey,
    mode,
    cycles,
    workflowType,
    teamProfile,
    phases: resolvePlanPhases(mode),
    validationProfiles,
    artifactRoot,
  };
}

export function buildExecutionSpec(options: {
  mode: RunMode;
  projectKey: string;
  cycles: number;
  artifactRoot?: string;
  target?: string;
  auditMode?: "triage" | "deep";
  ownedTarget?: boolean;
  authorizationNote?: string;
}): ManagedExecutionSpec {
  switch (options.mode) {
    case "run":
      return {
        project: options.projectKey,
        cycles: options.cycles,
        mode: "run",
        artifactRoot: options.artifactRoot,
        command: "bash",
        args: [LEGACY_RUNNER, String(options.cycles), "", options.projectKey],
        cwd: REPO_ROOT,
        env: {
          AUTOCLAWDEV_RUNNER: LEGACY_RUNNER,
        },
        mainPhase: "workflow",
        validationPhase: "validation",
        commitPhase: "commit",
        nativeFinalization: true,
      };
    case "review":
      {
      const command = existsSync(REVIEW_WORKER_DIST) ? process.execPath : "pnpm";
      const args = existsSync(REVIEW_WORKER_DIST)
        ? [REVIEW_WORKER_DIST, options.projectKey]
        : ["--filter", "@autoclawdev/server", "exec", "tsx", REVIEW_WORKER_SRC, options.projectKey];
      return {
        project: options.projectKey,
        cycles: options.cycles,
        mode: "review",
        artifactRoot: options.artifactRoot,
        command,
        args,
        cwd: REPO_ROOT,
        mainPhase: "audit",
        validationPhase: "validate",
        reportPhase: "report",
      };
      }
    case "build":
      return {
        project: options.projectKey,
        cycles: options.cycles,
        mode: "build",
        artifactRoot: options.artifactRoot,
        command: "bash",
        args: [LEGACY_BUILD, options.projectKey],
        cwd: REPO_ROOT,
        mainPhase: "build",
        reportPhase: "report",
      };
    case "audit": {
      if (!options.target) {
        throw new Error("Audit target URL is required");
      }
      if (!options.artifactRoot) {
        throw new Error("Audit artifact root is required");
      }
      const args = [
        STRUCTURED_WEB_AUDIT,
        "run",
        options.target,
        "--output",
        options.artifactRoot,
        "--mode",
        options.auditMode ?? "triage",
      ];
      if (options.ownedTarget) {
        args.push("--owned-target");
      }
      if (options.authorizationNote) {
        args.push("--authorization-note", options.authorizationNote);
      }

      return {
        project: options.projectKey,
        cycles: options.cycles,
        mode: "audit",
        artifactRoot: options.artifactRoot,
        command: "python3",
        args,
        cwd: REPO_ROOT,
        env: {
          AUTOCLAWDEV_WEB_AUDIT: STRUCTURED_WEB_AUDIT,
        },
        mainPhase: "audit",
        reportPhase: "report",
      };
    }
  }
}

function createEvent(
  run: RunRecord,
  type: EventRecord["type"],
  message?: string,
  data?: Record<string, unknown>,
): EventRecord {
  return {
    id: `${run.id}-${Date.now()}-${type}`,
    runId: run.id,
    projectKey: run.projectKey,
    type,
    timestamp: new Date().toISOString(),
    message,
    data,
  };
}

export async function resolveRunRequest(options: {
  projectKey: string;
  cycles?: number;
  mode?: RunMode;
  target?: string;
  auditMode?: "triage" | "deep";
  ownedTarget?: boolean;
  authorizationNote?: string;
}): Promise<{
  plan: RunPlan;
  preflight: PreflightReport;
  record: RunRecord;
}> {
  const manifest = await getProjectDetailed(options.projectKey);
  if (!manifest) {
    throw new Error(`Unknown project: ${options.projectKey}`);
  }

  const mode = options.mode ?? "run";
  const cycles = Math.min(25, Math.max(1, Number(options.cycles ?? manifest.default_cycles ?? 1) || 1));
  const runId = createRunId(manifest.key);
  const artifactRoot = join(manifest.path, ".autoclaw", "runs", runId);
  const target = options.target ?? manifest.audit_url ?? manifest.dev_url;
  if (mode === "audit" && !target) {
    throw new Error(`Audit mode requires a target URL or dev_url for ${manifest.key}`);
  }
  const preflight = await runPreflight(manifest, mode, { target });
  const plan = buildRunPlan(
    manifest.key,
    cycles,
    mode,
    resolveWorkflowTypeForMode(mode, manifest.workflow_type),
    manifest.team_profile ?? "reliability",
    artifactRoot,
    manifest.validationProfiles,
  );

  const now = new Date().toISOString();
  const record: RunRecord = {
    id: runId,
    projectKey: manifest.key,
    mode,
    status: preflight.ok ? "queued" : "preflight_failed",
    source: "native",
    cycles,
    workflowType: plan.workflowType,
    teamProfile: plan.teamProfile,
    createdAt: now,
    updatedAt: now,
    artifactRoot,
    manifestSource: manifest.manifestSource,
    outcome: preflight.ok ? undefined : "failed",
    historyCompleteness: "full",
    preflightOk: preflight.ok,
    summary: `${mode} request for ${manifest.key}`,
    phases: plan.phases.map((name, index) => ({
      id: `${runId}-phase-${index + 1}`,
      runId,
      name,
      status: name === "preflight" ? (preflight.ok ? "completed" : "failed") : "queued",
      startedAt: name === "preflight" ? now : undefined,
      completedAt: name === "preflight" ? now : undefined,
      detail: name === "preflight"
        ? `${preflight.blockingCount} blocking, ${preflight.warningCount} warnings`
        : undefined,
    })),
    artifacts: {
      root: artifactRoot,
      items: [],
    },
    approvals: mode === "audit" ? [] : undefined,
  };

  writeRunRecord(manifest.path, record);
  appendRunEvent(
    manifest.path,
    createEvent(record, "queued", "Run request queued", {
      plan,
    }),
  );

  appendRunEvent(
    manifest.path,
    createEvent(
      record,
      preflight.ok ? "preflight_passed" : "preflight_failed",
      preflight.ok ? "Preflight passed" : "Preflight failed",
      { preflight },
    ),
  );

  return { plan, preflight, record };
}

export async function startManagedRun(options: {
  projectKey: string;
  cycles?: number;
  mode?: RunMode;
  dryRun?: boolean;
  target?: string;
  auditMode?: "triage" | "deep";
  ownedTarget?: boolean;
  authorizationNote?: string;
}): Promise<{
  ok: boolean;
  plan: RunPlan;
  preflight: PreflightReport;
  record: RunRecord;
  reason?: string;
}> {
  const resolved = await resolveRunRequest(options);
  const manifest = await getProjectDetailed(options.projectKey);
  if (!manifest) {
    throw new Error(`Unknown project: ${options.projectKey}`);
  }

  if (options.dryRun) {
    return { ok: resolved.preflight.ok, ...resolved };
  }

  if (!resolved.preflight.ok) {
    return {
      ok: false,
      ...resolved,
      reason: "Preflight failed",
    };
  }

  const started = await startRun({
    ...buildExecutionSpec({
      mode: resolved.record.mode,
      projectKey: options.projectKey,
      cycles: resolved.record.cycles,
      artifactRoot: resolved.record.artifactRoot,
      target: options.target ?? manifest.audit_url ?? manifest.dev_url,
      auditMode: options.auditMode,
      ownedTarget: options.ownedTarget,
      authorizationNote: options.authorizationNote,
    }),
    runId: resolved.record.id,
    projectPath: manifest.path,
  });

  if (!started) {
    updateRunRecord(manifest.path, resolved.record.id, (record) => ({
      ...record,
      status: "failed",
      outcome: "failed",
      summary: "Run failed to start",
    }));
    appendRunEvent(
      manifest.path,
      createEvent(resolved.record, "system", "Run failed to start"),
    );
    return {
      ok: false,
      ...resolved,
      reason: "Run already active or runner not found",
    };
  }

  updateRunRecord(manifest.path, resolved.record.id, (record) => ({
    ...record,
    status: "running",
    summary: `Managed ${resolved.record.mode} execution started`,
  }));

  return {
    ok: true,
    ...resolved,
  };
}

export async function stopManagedRun(projectKey: string): Promise<boolean> {
  return stopRun(projectKey);
}

function buildApprovalRecord(gate: string, approver?: string, note?: string): ExecutionApproval {
  const now = new Date().toISOString();
  return {
    gate,
    status: "approved",
    requestedAt: now,
    approvedAt: now,
    approver,
    note,
  };
}

export async function approveManagedRunGate(options: {
  runId: string;
  gate: string;
  approver?: string;
  note?: string;
}): Promise<RunRecord | undefined> {
  const located = await getRunRecordById(options.runId);
  if (!located) return undefined;

  const updated = updateRunRecord(located.manifestPath, options.runId, (record) => {
    const approvals = [...(record.approvals ?? [])];
    const existingIndex = approvals.findIndex((entry) => entry.gate === options.gate);
    const approval = buildApprovalRecord(options.gate, options.approver, options.note);
    if (existingIndex >= 0) {
      approvals[existingIndex] = approval;
    } else {
      approvals.push(approval);
    }
    const pendingApprovals = approvals.filter((entry) => entry.status === "pending");
    return {
      ...record,
      status:
        record.mode === "audit"
          ? (pendingApprovals.length > 0 ? "awaiting_approval" : "running")
          : record.status,
      approvals,
      summary: `Gate approved: ${options.gate}`,
    };
  });

  if (updated) {
    if (updated.mode === "audit") {
      updateWebAuditRunRecordFromRoot(updated.artifactRoot, (record) => {
        const approvalsPending = (record.approvalsPending ?? []).filter((item) => item !== options.gate);
        const approvedGates = record.approvedGates.includes(options.gate)
          ? record.approvedGates
          : [...record.approvedGates, options.gate];
        return {
          ...record,
          status: approvalsPending.length > 0 ? "awaiting_approval" : "running",
          approvalsPending,
          approvedGates,
          policy: {
            ...record.policy,
            escalationApprovals: {
              ...record.policy.escalationApprovals,
              [options.gate]: true,
            },
          },
        };
      });
    }
    appendRunEvent(located.manifestPath, {
      id: `${updated.id}-${Date.now()}-approval_granted`,
      runId: updated.id,
      projectKey: updated.projectKey,
      type: "approval_granted",
      timestamp: new Date().toISOString(),
      message: `Approved gate ${options.gate}`,
      data: {
        gate: options.gate,
        approver: options.approver,
        note: options.note,
      },
    });
  }

  return updated;
}

export async function resumeManagedRun(options: {
  runId: string;
  approveGates?: string[];
}): Promise<{
  ok: boolean;
  record?: RunRecord;
  reason?: string;
}> {
  const located = await getRunRecordById(options.runId);
  if (!located) {
    return { ok: false, reason: "Run not found" };
  }

  if (located.record.mode === "review") {
    const incompleteReviewPhases = located.record.phases.filter(
      (phase) => phase.name !== "preflight" && phase.status !== "completed" && phase.status !== "skipped",
    );
    if (incompleteReviewPhases.length === 0 || located.record.status === "completed") {
      return { ok: false, record: located.record, reason: "Review run is already complete; start a new review instead" };
    }
  }

  const manifest = await getProjectDetailed(located.record.projectKey);
  if (!manifest) {
    return { ok: false, reason: `Unknown project: ${located.record.projectKey}` };
  }

  let started = false;
  if (located.record.mode === "audit") {
    const args = [
      STRUCTURED_WEB_AUDIT,
      "resume",
      located.record.artifactRoot,
    ];
    for (const gate of options.approveGates ?? []) {
      args.push("--approve-gate", gate);
    }

    started = await startRun({
      project: located.record.projectKey,
      cycles: located.record.cycles,
      mode: "audit",
      command: "python3",
      args,
      cwd: REPO_ROOT,
      env: {
        AUTOCLAWDEV_WEB_AUDIT: STRUCTURED_WEB_AUDIT,
      },
      runId: located.record.id,
      projectPath: manifest.path,
      mainPhase: "audit",
      reportPhase: "report",
    });
  } else if (located.record.mode === "review") {
    const execution = buildExecutionSpec({
      mode: "review",
      projectKey: located.record.projectKey,
      cycles: located.record.cycles,
      artifactRoot: located.record.artifactRoot,
    });
    started = await startRun({
      ...execution,
      runId: located.record.id,
      projectPath: manifest.path,
    });
  } else {
    return { ok: false, reason: `Resume is not supported for ${located.record.mode} runs` };
  }

  if (!started) {
    return {
      ok: false,
      record: located.record,
      reason:
        located.record.mode === "review"
          ? "Run already active or review worker unavailable"
          : "Run already active or audit worker unavailable",
    };
  }

  const updated = updateRunRecord(located.manifestPath, located.record.id, (record) => ({
    ...record,
    status: "running",
    summary: record.mode === "review" ? "Managed review resume started" : "Managed audit resume started",
  }));

  return { ok: true, record: updated ?? located.record };
}

export async function listAllRunRecords(limit = 50): Promise<RunRecord[]> {
  const manifests = await listProjectsDetailed();
  return manifests
    .flatMap((manifest) => listRunRecords(manifest.path, limit))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export async function getRunEventsById(runId: string): Promise<EventRecord[]> {
  const manifests = await listProjectsDetailed();
  for (const manifest of manifests) {
    const record = listRunRecords(manifest.path, 250).find((entry) => entry.id === runId);
    if (record) {
      return readRunEvents(manifest.path, runId);
    }
  }
  return [];
}

export async function getRunRecordById(runId: string): Promise<{
  manifestPath: string;
  record: RunRecord;
} | undefined> {
  const manifests = await listProjectsDetailed();
  for (const manifest of manifests) {
    const record = readRunRecord(manifest.path, runId);
    if (record) {
      return {
        manifestPath: manifest.path,
        record,
      };
    }
  }
  return undefined;
}

export async function updateRunRecoveryState(options: {
  runId: string;
  action: "resolve" | "abandon";
  note?: string;
}): Promise<RunRecord | undefined> {
  const located = await getRunRecordById(options.runId);
  if (!located) return undefined;

  const now = new Date().toISOString();
  const status = options.action === "resolve" ? "resolved" : "abandoned";
  const updated = updateRunRecord(located.manifestPath, options.runId, (record) => ({
    ...record,
    recovery: record.recovery
      ? {
          ...record.recovery,
          required: false,
          status,
          note: options.note ?? record.recovery.note,
          resolvedAt: now,
        }
      : {
          required: false,
          status,
          note: options.note,
          resolvedAt: now,
        },
    summary:
      status === "resolved"
        ? "Recovery resolved by operator"
        : "Recovery abandoned by operator",
  }));

  if (updated) {
    appendRunEvent(located.manifestPath, {
      id: `${updated.id}-${Date.now()}-${status}`,
      runId: updated.id,
      projectKey: updated.projectKey,
      type: status === "resolved" ? "recovery_resolved" : "recovery_abandoned",
      timestamp: now,
      message:
        status === "resolved"
          ? "Recovery marked resolved"
          : "Recovery marked abandoned",
      data: options.note ? { note: options.note } : undefined,
    });
  }

  return updated;
}

function countOpenFindings(projectPath: string): number {
  const findingsPath = join(projectPath, ".autoclaw", "memory", "finding-memory.jsonl");
  if (!existsSync(findingsPath)) return 0;
  try {
    return readFileSync(findingsPath, "utf-8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { status?: string })
      .filter((row) => row.status === "open").length;
  } catch {
    return 0;
  }
}

function readLatestDeepReview(reviewDir: string): string | undefined {
  if (!existsSync(reviewDir)) return undefined;
  try {
    const latestMeta = readdirSync(reviewDir)
      .filter((entry) => entry.endsWith(".meta.txt"))
      .sort()
      .reverse()[0];
    if (!latestMeta) return undefined;
    const content = readFileSync(join(reviewDir, latestMeta), "utf-8");
    const match = content.match(/started_at=(.+)/);
    return match?.[1];
  } catch {
    return undefined;
  }
}

export async function listProjectReadiness(): Promise<ProjectReadiness[]> {
  const manifests = await listProjectsDetailed();
  const activeRuns = new Set(getActiveRuns().map((run) => run.project));

  const projects = await Promise.all(
    manifests.map(async (manifest) => {
      const runs = await listProjectHistory(manifest.key, 500);
      const stats = buildProjectStatsFromRuns(runs, { project: manifest.key });

      const reviewDir = resolveReviewsDir(manifest.path);
      const memoryDir = resolveMemoryDir(manifest.key, manifest.path);
      const lastDeepReview = existsSync(reviewDir)
        ? readLatestDeepReview(reviewDir)
        : undefined;

      return buildProjectReadinessEntry({
        manifest,
        stats,
        activeRun: activeRuns.has(manifest.key),
        openFindings: countOpenFindings(manifest.path),
        lastRun: runs[0]?.createdAt,
        lastDeepReview,
        memoryInitialized: existsSync(memoryDir),
      });
    }),
  );

  return projects.sort((left, right) => {
    if (left.baselineReady !== right.baselineReady) {
      return Number(right.baselineReady) - Number(left.baselineReady);
    }
    if (left.manifestComplete !== right.manifestComplete) {
      return Number(right.manifestComplete) - Number(left.manifestComplete);
    }
    if (left.blockers.length !== right.blockers.length) {
      return left.blockers.length - right.blockers.length;
    }
    if (left.stats.passRate !== right.stats.passRate) {
      return right.stats.passRate - left.stats.passRate;
    }
    return left.key.localeCompare(right.key);
  });
}

export async function listPortfolioAuditRows(): Promise<PortfolioAuditRow[]> {
  const readiness = await listProjectReadiness();
  return readiness.map(buildPortfolioAuditRow);
}
