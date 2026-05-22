import type {
  DeepReviewDetail,
  RemoteCommandDefinition,
  RemoteCommandInput,
  RemoteCommandOutputMap,
  RemoteCommandResult,
  RunMode,
  WebAuditRunDetail,
} from "@autoclawdev/types";
import { getProject, getProjectDetailed, listProjects } from "./config.js";
import {
  approveManagedRunGate,
  getRunEventsById,
  getRunRecordById,
  listAllRunRecords,
  resumeManagedRun,
  startManagedRun,
  stopManagedRun,
} from "./orchestrator.js";
import { getActiveRuns } from "./process.js";
import { runPreflight } from "./preflight.js";
import { readWebAuditEventsFromRoot, readWebAuditRunDetailFromRoot } from "./webAudit.js";
import { resolveReviewsDir } from "./paths.js";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

export const remoteCommandCatalog: RemoteCommandDefinition[] = [
  {
    name: "projects",
    slash: "/projects",
    category: "project",
    description: "List registered projects and their manifest-backed metadata.",
    arguments: [],
  },
  {
    name: "status",
    slash: "/status",
    category: "inspection",
    description: "Show active executions and recent unified run history.",
    arguments: [],
  },
  {
    name: "preflight",
    slash: "/preflight",
    category: "inspection",
    description: "Run preflight checks for a project before a managed execution.",
    arguments: [
      { name: "project", type: "string", required: true, description: "Project key to inspect." },
      { name: "mode", type: "string", description: "Execution kind: run, review, build, or audit." },
    ],
  },
  {
    name: "run",
    slash: "/run",
    category: "execution",
    description: "Start a managed run execution.",
    arguments: [
      { name: "project", type: "string", required: true, description: "Project key." },
      { name: "cycles", type: "number", description: "Cycle count." },
    ],
  },
  {
    name: "review",
    slash: "/review",
    category: "execution",
    description: "Start a managed deep review execution.",
    arguments: [
      { name: "project", type: "string", required: true, description: "Project key." },
    ],
  },
  {
    name: "build",
    slash: "/build",
    category: "execution",
    description: "Start a managed build execution.",
    arguments: [
      { name: "project", type: "string", required: true, description: "Project key." },
    ],
  },
  {
    name: "audit",
    slash: "/audit",
    category: "execution",
    description: "Start a managed web audit against a target URL or project dev URL.",
    arguments: [
      { name: "project", type: "string", description: "Project key when auditing a registered project." },
      { name: "target", type: "string", description: "Explicit URL to audit." },
      { name: "auditMode", type: "string", description: "triage or deep." },
      { name: "ownedTarget", type: "boolean", description: "Whether the target is owned and authorized." },
      { name: "authorizationNote", type: "string", description: "Authorization note for owned targets." },
    ],
  },
  {
    name: "stop",
    slash: "/stop",
    category: "execution",
    description: "Stop an active execution for a project.",
    arguments: [
      { name: "project", type: "string", required: true, description: "Project key." },
    ],
  },
  {
    name: "approve",
    slash: "/approve",
    category: "approval",
    description: "Approve a pending execution gate for a managed run.",
    arguments: [
      { name: "runId", type: "string", required: true, description: "Run id." },
      { name: "gate", type: "string", required: true, description: "Gate name to approve." },
    ],
  },
  {
    name: "resume",
    slash: "/resume",
    category: "approval",
    description: "Resume a paused managed run, optionally approving gates first.",
    arguments: [
      { name: "runId", type: "string", required: true, description: "Run id." },
      { name: "approveGates", type: "string[]", description: "Gate names to approve before resume." },
    ],
  },
  {
    name: "run-detail",
    slash: "/run-detail",
    category: "inspection",
    description: "Fetch detail for a managed run, including audit detail when present.",
    arguments: [
      { name: "runId", type: "string", required: true, description: "Run id." },
    ],
  },
  {
    name: "events",
    slash: "/events",
    category: "inspection",
    description: "Fetch typed events for a managed run.",
    arguments: [
      { name: "runId", type: "string", required: true, description: "Run id." },
    ],
  },
  {
    name: "review-latest",
    slash: "/review_latest",
    category: "inspection",
    description: "Fetch the latest review detail for a project.",
    arguments: [
      { name: "project", type: "string", required: true, description: "Project key." },
    ],
  },
  {
    name: "audit-latest",
    slash: "/audit_latest",
    category: "inspection",
    description: "Fetch the latest web audit detail for a project.",
    arguments: [
      { name: "project", type: "string", required: true, description: "Project key." },
    ],
  },
];

function ensureProjectKey(input: RemoteCommandInput): string {
  const project = typeof input.project === "string" ? input.project.trim() : "";
  if (!project) {
    throw new Error("project is required");
  }
  return project;
}

function ensureRunId(input: RemoteCommandInput): string {
  const runId = typeof input.runId === "string" ? input.runId.trim() : "";
  if (!runId) {
    throw new Error("runId is required");
  }
  return runId;
}

function ensureGate(input: RemoteCommandInput): string {
  const gate = typeof input.gate === "string" ? input.gate.trim() : "";
  if (!gate) {
    throw new Error("gate is required");
  }
  return gate;
}

function resolveMode(input: RemoteCommandInput, fallback: RunMode): RunMode {
  return input.mode === "run" || input.mode === "review" || input.mode === "build" || input.mode === "audit"
    ? input.mode
    : fallback;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function parseMetaFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const eq = line.indexOf("=");
    if (eq > 0) {
      result[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
    }
  }
  return result;
}

async function readLatestReviewDetail(projectKey: string): Promise<DeepReviewDetail | null> {
  const project = await getProject(projectKey);
  if (!project) {
    throw new Error("Project not found");
  }

  const reviewsDir = resolveReviewsDir(project.path);
  if (!(await fileExists(reviewsDir))) {
    return null;
  }

  const metaFiles = (await readdir(reviewsDir))
    .filter((entry) => entry.endsWith(".meta.txt"))
    .sort()
    .reverse();
  if (metaFiles.length === 0) {
    return null;
  }

  const meta = parseMetaFile(await readFile(join(reviewsDir, metaFiles[0]!), "utf-8"));
  const auditReportPath = join(reviewsDir, "audit-report.md");
  const executionPlanPath = join(reviewsDir, "execution-plan.md");
  const progressPath = join(reviewsDir, "progress.md");

  return {
    provider: meta.provider || "claude",
    sessionName: meta.session_name || metaFiles[0]!.replace(".meta.txt", ""),
    startedAt: meta.started_at || "",
    endedAt: meta.ended_at,
    exitCode: meta.exit_code ? Number(meta.exit_code) : undefined,
    model: meta.model || "unknown",
    projectPath: meta.cwd || project.path,
    ttyLog: meta.tty_log || "",
    jsonLog: meta.json_log,
    hasAuditReport: await fileExists(auditReportPath),
    hasExecutionPlan: await fileExists(executionPlanPath),
    hasProgress: await fileExists(progressPath),
    auditReport: await fileExists(auditReportPath) ? await readFile(auditReportPath, "utf-8") : undefined,
    executionPlan: await fileExists(executionPlanPath) ? await readFile(executionPlanPath, "utf-8") : undefined,
    progress: await fileExists(progressPath) ? await readFile(progressPath, "utf-8") : undefined,
  };
}

async function readLatestAuditDetail(projectKey: string): Promise<WebAuditRunDetail | null> {
  const project = await getProject(projectKey);
  if (!project) {
    throw new Error("Project not found");
  }

  const runs = listAllRunRecords ? await listAllRunRecords(500) : [];
  const latest = runs
    .filter((record) => record.projectKey === projectKey && record.mode === "audit")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!latest) {
    return null;
  }

  return readWebAuditRunDetailFromRoot(latest.artifactRoot) ?? null;
}

export async function executeRemoteCommand(
  input: RemoteCommandInput,
): Promise<RemoteCommandResult> {
  switch (input.command) {
    case "projects": {
      const projects = await listProjects();
      return {
        ok: true,
        command: input.command,
        message: `Loaded ${projects.length} project(s).`,
        data: { projects } as RemoteCommandOutputMap["projects"],
      };
    }
    case "status": {
      const runs = await listAllRunRecords(100);
      return {
        ok: true,
        command: input.command,
        message: `Loaded ${getActiveRuns().length} active run(s) and ${runs.length} recent record(s).`,
        data: { active: getActiveRuns(), runs } as RemoteCommandOutputMap["status"],
      };
    }
    case "preflight": {
      const project = await getProjectDetailed(ensureProjectKey(input));
      if (!project) throw new Error("Project not found");
      const preflight = await runPreflight(project, resolveMode(input, "run"), {
        target: input.target,
      });
      return {
        ok: true,
        command: input.command,
        message: preflight.ok ? "Preflight passed." : "Preflight reported blocking issues.",
        data: { preflight } as RemoteCommandOutputMap["preflight"],
      };
    }
    case "run":
    case "review":
    case "build":
    case "audit": {
      const mode = input.command === "run" || input.command === "review" || input.command === "build" || input.command === "audit"
        ? input.command
        : "run";
      const result = await startManagedRun({
        projectKey: ensureProjectKey(input),
        cycles: Number.isFinite(Number(input.cycles)) ? Number(input.cycles) : 1,
        mode,
        dryRun: false,
        target: input.target,
        auditMode: input.auditMode,
        ownedTarget: input.ownedTarget,
        authorizationNote: input.authorizationNote,
      });
      if (!result.ok) {
        throw new Error(result.reason ?? "Failed to start execution");
      }
      return {
        ok: true,
        command: input.command,
        message: `Started ${mode} for ${result.record.projectKey}.`,
        data: { run: result.record, preflight: result.preflight } as RemoteCommandOutputMap[typeof input.command],
      };
    }
    case "stop": {
      const project = ensureProjectKey(input);
      const stopped = await stopManagedRun(project);
      if (!stopped) throw new Error("No active run found");
      return {
        ok: true,
        command: input.command,
        message: `Stopped active execution for ${project}.`,
        data: { ok: true, project } as RemoteCommandOutputMap["stop"],
      };
    }
    case "approve": {
      const run = await approveManagedRunGate({
        runId: ensureRunId(input),
        gate: ensureGate(input),
      });
      if (!run) throw new Error("Run not found");
      return {
        ok: true,
        command: input.command,
        message: `Approved gate ${ensureGate(input)}.`,
        data: { run } as RemoteCommandOutputMap["approve"],
      };
    }
    case "resume": {
      const resumed = await resumeManagedRun({
        runId: ensureRunId(input),
        approveGates: Array.isArray(input.approveGates) ? input.approveGates : undefined,
      });
      if (!resumed.ok || !resumed.record) {
        throw new Error(resumed.reason ?? "Failed to resume run");
      }
      return {
        ok: true,
        command: input.command,
        message: `Resumed run ${resumed.record.id}.`,
        data: { run: resumed.record } as RemoteCommandOutputMap["resume"],
      };
    }
    case "run-detail": {
      const located = await getRunRecordById(ensureRunId(input));
      if (!located) throw new Error("Run not found");
      const auditDetail = located.record.mode === "audit"
        ? (readWebAuditRunDetailFromRoot(located.record.artifactRoot) ?? null)
        : null;
      const events = located.record.mode === "audit"
        ? readWebAuditEventsFromRoot(located.record.artifactRoot)
        : await getRunEventsById(located.record.id);
      return {
        ok: true,
        command: input.command,
        message: `Loaded run ${located.record.id}.`,
        data: {
          run: located.record,
          events,
          auditDetail,
        } as RemoteCommandOutputMap["run-detail"],
      };
    }
    case "events": {
      const located = await getRunRecordById(ensureRunId(input));
      if (!located) throw new Error("Run not found");
      const events = located.record.mode === "audit"
        ? readWebAuditEventsFromRoot(located.record.artifactRoot)
        : await getRunEventsById(located.record.id);
      return {
        ok: true,
        command: input.command,
        message: `Loaded ${events.length} event(s).`,
        data: { events } as RemoteCommandOutputMap["events"],
      };
    }
    case "review-latest": {
      const review = await readLatestReviewDetail(ensureProjectKey(input));
      return {
        ok: true,
        command: input.command,
        message: review ? "Loaded latest review." : "No review found.",
        data: { review } as RemoteCommandOutputMap["review-latest"],
      };
    }
    case "audit-latest": {
      const audit = await readLatestAuditDetail(ensureProjectKey(input));
      return {
        ok: true,
        command: input.command,
        message: audit ? "Loaded latest audit." : "No audit found.",
        data: { audit } as RemoteCommandOutputMap["audit-latest"],
      };
    }
  }
}
