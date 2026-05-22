import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { listProjectsDetailed } from "../../lib/config.js";
import {
  approveManagedRunGate,
  getRunRecordById,
  listAllRunRecords,
  resumeManagedRun,
  startManagedRun,
  stopManagedRun,
} from "../../lib/orchestrator.js";
import { getActiveRuns } from "../../lib/process.js";
import { readWebAuditRunDetailFromRoot } from "../../lib/webAudit.js";
import {
  applyPendingApproval,
  deletePendingApproval,
  getPendingApproval,
  listPendingApprovals,
} from "../../chatSession/approvals.js";

const SERVER_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT =
  process.env.AUTOCLAWDEV_REPO_ROOT || join(SERVER_DIR, "../../../../../");
const AUTOCLAW_BIN = join(REPO_ROOT, "bin", "autoclawdev");

export interface TelegramCommandButton {
  text: string;
  callbackData: string;
}

export interface TelegramCommandResult {
  text: string;
  buttons?: TelegramCommandButton[][];
  watchRunId?: string;
}

export interface TelegramCommandDependencies {
  listProjectsDetailed: typeof listProjectsDetailed;
  listAllRunRecords: typeof listAllRunRecords;
  getRunRecordById: typeof getRunRecordById;
  readWebAuditRunDetailFromRoot: typeof readWebAuditRunDetailFromRoot;
  startManagedRun: typeof startManagedRun;
  approveManagedRunGate: typeof approveManagedRunGate;
  resumeManagedRun: typeof resumeManagedRun;
  stopManagedRun: typeof stopManagedRun;
  getActiveRuns: typeof getActiveRuns;
  listPendingApprovals: typeof listPendingApprovals;
  getPendingApproval: typeof getPendingApproval;
  applyPendingApproval: typeof applyPendingApproval;
  deletePendingApproval: typeof deletePendingApproval;
  runAutoclawPassthrough: typeof runAutoclawPassthrough;
}

const defaultDependencies: TelegramCommandDependencies = {
  listProjectsDetailed,
  listAllRunRecords,
  getRunRecordById,
  readWebAuditRunDetailFromRoot,
  startManagedRun,
  approveManagedRunGate,
  resumeManagedRun,
  stopManagedRun,
  getActiveRuns,
  listPendingApprovals,
  getPendingApproval,
  applyPendingApproval,
  deletePendingApproval,
  runAutoclawPassthrough,
};

function tokenize(input: string): string[] {
  const matches = input.trim().match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  return matches.map((token) => token.replace(/^["']|["']$/g, ""));
}

function stripCommandPrefix(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return trimmed;
  const firstSpace = trimmed.indexOf(" ");
  const head = firstSpace >= 0 ? trimmed.slice(0, firstSpace) : trimmed;
  const tail = firstSpace >= 0 ? trimmed.slice(firstSpace + 1) : "";
  const command = head.replace(/^\/+/, "").split("@")[0] ?? "";
  return `${command}${tail ? ` ${tail}` : ""}`.trim();
}

function formatRun(record: {
  id: string;
  mode: string;
  status: string;
  projectKey: string;
  createdAt: string;
  summary?: string;
}): string {
  return `${record.id} | ${record.projectKey} | ${record.mode} | ${record.status}${record.summary ? ` | ${record.summary}` : ""}`;
}

function buildRunButtons(options: {
  runId: string;
  projectKey: string;
  mode: string;
  status: string;
  pendingGates?: string[];
}): TelegramCommandButton[][] {
  const rows: TelegramCommandButton[][] = [
    [{ text: "Refresh", callbackData: `status:${options.runId}` }],
  ];

  if (options.pendingGates && options.pendingGates.length > 0) {
    for (const gate of options.pendingGates.slice(0, 4)) {
      rows.push([
        {
          text: `Approve ${gate}`,
          callbackData: `approve-gate:${options.runId}:${gate}`,
        },
      ]);
    }
    rows.push([{ text: "Resume", callbackData: `resume-run:${options.runId}` }]);
  } else if (options.status === "running" || options.status === "queued") {
    rows[0]?.push({
      text: "Stop",
      callbackData: `stop-project:${options.projectKey}`,
    });
  } else if (options.mode === "audit" && options.status === "awaiting_approval") {
    rows.push([{ text: "Resume", callbackData: `resume-run:${options.runId}` }]);
  } else if (
    (options.mode === "review" || options.mode === "audit")
    && options.status !== "completed"
    && options.status !== "running"
    && options.status !== "queued"
  ) {
    rows.push([{ text: "Resume", callbackData: `resume-run:${options.runId}` }]);
  }

  return rows;
}

function buildProjectButtons(projectKey: string): TelegramCommandButton[][] {
  return [
    [
      { text: "Start Review", callbackData: `start-review:${projectKey}` },
      { text: "Run", callbackData: `start-run:${projectKey}` },
    ],
    [
      { text: "Build", callbackData: `start-build:${projectKey}` },
      { text: "Audit", callbackData: `start-audit:${projectKey}` },
    ],
  ];
}

function buildPendingApprovalButtons(requestIds: string[]): TelegramCommandButton[][] {
  return requestIds.slice(0, 5).map((requestId) => ([
    {
      text: `Approve ${requestId}`,
      callbackData: `approve-chat:${requestId}`,
    },
    {
      text: `Reject ${requestId}`,
      callbackData: `reject-chat:${requestId}`,
    },
  ]));
}

function collectOutput(proc: ReturnType<typeof spawn>): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      resolve({
        code,
        output: `${stdout}${stderr}`.trim(),
      });
    });
  });
}

async function runAutoclawPassthrough(args: string[]): Promise<TelegramCommandResult> {
  if (process.env.AUTOCLAWDEV_TELEGRAM_ALLOW_RAW_CLI !== "1") {
    return {
      text: "Raw autoclaw passthrough is disabled. Set AUTOCLAWDEV_TELEGRAM_ALLOW_RAW_CLI=1 to enable /autoclaw.",
    };
  }

  const proc = spawn(AUTOCLAW_BIN, args, {
    cwd: REPO_ROOT,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const result = await collectOutput(proc);
  return {
    text: [`$ autoclaw ${args.join(" ")}`, result.output || "(no output)", `exit=${result.code ?? "null"}`]
      .filter(Boolean)
      .join("\n"),
  };
}

export async function handleTelegramCommand(
  input: string,
  deps: TelegramCommandDependencies = defaultDependencies,
): Promise<TelegramCommandResult> {
  const normalized = stripCommandPrefix(input);
  const [command = "help", ...args] = tokenize(normalized);

  switch (command) {
    case "help":
      return {
        text: [
          "Telegram control commands:",
          "/projects",
          "/runs [limit]",
          "/status [project|runId]",
          "/run <project> [cycles]",
          "/review <project>",
          "/build <project>",
          "/audit <project> [target] [triage|deep]",
          "/approve <runId> <gate>",
          "/resume <runId> [gate...]",
          "/stop <project>",
          "/pending",
          "/approve-chat <requestId>",
          "/reject-chat <requestId>",
          "/autoclaw <args...>  (opt-in passthrough)",
        ].join("\n"),
      };
    case "projects": {
      const projects = await deps.listProjectsDetailed();
      return {
        text: projects.length > 0
          ? projects.map((project) => `${project.key} | ${project.name} | ${project.workflow_type ?? "standard"}`).join("\n")
          : "No projects registered.",
      };
    }
    case "runs": {
      const limit = Math.min(25, Math.max(1, Number(args[0] ?? 10) || 10));
      const runs = await deps.listAllRunRecords(limit);
      return {
        text: runs.length > 0 ? runs.map(formatRun).join("\n") : "No runs found.",
      };
    }
    case "status": {
      const target = args[0];
      if (!target) {
        const active = deps.getActiveRuns();
        return {
          text: active.length > 0
            ? active.map((run) => `${run.project} | cycles=${run.cycles} | started ${run.startedAt}`).join("\n")
            : "No active runs.",
        };
      }

      const run = await deps.getRunRecordById(target);
      if (run) {
        const pendingGates =
          run.record.mode === "audit"
            ? (deps.readWebAuditRunDetailFromRoot(run.record.artifactRoot)?.approvalsPending ?? [])
            : [];
        return {
          text: [
            formatRun(run.record),
            ...run.record.phases.map((phase) => `- ${phase.name}: ${phase.status}${phase.detail ? ` (${phase.detail})` : ""}`),
            ...(pendingGates.length > 0 ? [`Pending gates: ${pendingGates.join(", ")}`] : []),
          ].join("\n"),
          buttons: buildRunButtons({
            runId: run.record.id,
            projectKey: run.record.projectKey,
            mode: run.record.mode,
            status: run.record.status,
            pendingGates,
          }),
        };
      }

      const projectRuns = (await deps.listAllRunRecords(100)).filter((record) => record.projectKey === target);
      return {
        text: projectRuns.length > 0
          ? projectRuns.slice(0, 5).map(formatRun).join("\n")
          : `No run or project found for ${target}.`,
        buttons: projectRuns.length > 0 || (await deps.listProjectsDetailed()).some((project) => project.key === target)
          ? buildProjectButtons(target)
          : undefined,
      };
    }
    case "run":
    case "review":
    case "build": {
      const projectKey = args[0];
      if (!projectKey) {
        return { text: `Usage: /${command} <project>${command === "run" ? " [cycles]" : ""}` };
      }

      const cycles = command === "run" ? Math.max(1, Number(args[1] ?? 1) || 1) : 1;
      const result = await deps.startManagedRun({
        projectKey,
        mode: command,
        cycles,
      });

      return {
        text: result.ok
          ? `Started ${command} for ${projectKey}\nrunId=${result.record.id}\nstatus=${result.record.status}`
          : `Failed to start ${command} for ${projectKey}\n${result.reason ?? result.preflight.checks.map((check) => `${check.label}: ${check.detail}`).join("\n")}`,
        buttons: result.ok
          ? buildRunButtons({
              runId: result.record.id,
              projectKey: result.record.projectKey,
              mode: result.record.mode,
              status: result.record.status,
            })
          : undefined,
        watchRunId: result.ok ? result.record.id : undefined,
      };
    }
    case "audit": {
      const projectKey = args[0];
      if (!projectKey) {
        return { text: "Usage: /audit <project> [target] [triage|deep]" };
      }
      const maybeTarget = args[1];
      const maybeMode = args[2] === "deep" || args[1] === "deep" ? "deep" : "triage";
      const target = maybeTarget && maybeTarget !== "deep" && maybeTarget !== "triage" ? maybeTarget : undefined;
      const result = await deps.startManagedRun({
        projectKey,
        mode: "audit",
        cycles: 1,
        target,
        auditMode: maybeMode,
        ownedTarget: true,
        authorizationNote: "Telegram-managed owned target command",
      });
      return {
        text: result.ok
          ? `Started audit for ${projectKey}\nrunId=${result.record.id}\nstatus=${result.record.status}`
          : `Failed to start audit for ${projectKey}\n${result.reason ?? "unknown error"}`,
        buttons: result.ok
          ? buildRunButtons({
              runId: result.record.id,
              projectKey: result.record.projectKey,
              mode: result.record.mode,
              status: result.record.status,
            })
          : undefined,
        watchRunId: result.ok ? result.record.id : undefined,
      };
    }
    case "approve": {
      const runId = args[0];
      const gate = args[1];
      if (!runId || !gate) {
        return { text: "Usage: /approve <runId> <gate>" };
      }
      const record = await deps.approveManagedRunGate({
        runId,
        gate,
        approver: "telegram",
      });
      return {
        text: record
          ? `Approved ${gate} for ${runId}\nstatus=${record.status}`
          : `Run not found: ${runId}`,
        buttons: record
          ? buildRunButtons({
              runId: record.id,
              projectKey: record.projectKey,
              mode: record.mode,
              status: record.status,
              pendingGates:
                record.mode === "audit"
                  ? (deps.readWebAuditRunDetailFromRoot(record.artifactRoot)?.approvalsPending ?? [])
                  : [],
            })
          : undefined,
      };
    }
    case "resume": {
      const runId = args[0];
      if (!runId) {
        return { text: "Usage: /resume <runId> [gate...]" };
      }
      const result = await deps.resumeManagedRun({
        runId,
        approveGates: args.slice(1),
      });
      return {
        text: result.ok
          ? `Resumed ${runId}\nstatus=${result.record?.status ?? "running"}`
          : `Failed to resume ${runId}\n${result.reason ?? "unknown error"}`,
        buttons: result.ok && result.record
          ? buildRunButtons({
              runId: result.record.id,
              projectKey: result.record.projectKey,
              mode: result.record.mode,
              status: result.record.status,
              pendingGates:
                result.record.mode === "audit"
                  ? (deps.readWebAuditRunDetailFromRoot(result.record.artifactRoot)?.approvalsPending ?? [])
                  : [],
            })
          : undefined,
        watchRunId: result.ok ? runId : undefined,
      };
    }
    case "stop": {
      const projectKey = args[0];
      if (!projectKey) {
        return { text: "Usage: /stop <project>" };
      }
      const stopped = await deps.stopManagedRun(projectKey);
      return { text: stopped ? `Stopped active run for ${projectKey}` : `No active run for ${projectKey}` };
    }
    case "pending": {
      const approvals = deps.listPendingApprovals();
      return {
        text: approvals.length > 0
          ? approvals.map((entry) => `${entry.requestId} | ${entry.requestKind} | ${entry.toolName} | ${entry.projectKey ?? entry.cwd}`).join("\n")
          : "No pending chat approvals.",
        buttons: approvals.length > 0
          ? buildPendingApprovalButtons(approvals.map((entry) => entry.requestId))
          : undefined,
      };
    }
    case "approve-chat": {
      const requestId = args[0];
      if (!requestId) {
        return { text: "Usage: /approve-chat <requestId>" };
      }
      const record = deps.getPendingApproval(requestId);
      if (!record) {
        return { text: `Pending approval not found: ${requestId}` };
      }
      const result = await deps.applyPendingApproval(record);
      deps.deletePendingApproval(requestId);
      return {
        text: `Approved chat request ${requestId}\n${JSON.stringify(result, null, 2)}`,
      };
    }
    case "reject-chat": {
      const requestId = args[0];
      if (!requestId) {
        return { text: "Usage: /reject-chat <requestId>" };
      }
      const record = deps.getPendingApproval(requestId);
      if (!record) {
        return { text: `Pending approval not found: ${requestId}` };
      }
      deps.deletePendingApproval(requestId);
      return { text: `Rejected chat request ${requestId}` };
    }
    case "autoclaw":
      return deps.runAutoclawPassthrough(args);
    default:
      return {
        text: `Unknown command: /${command}\nUse /help for available commands.`,
      };
  }
}

export async function handleTelegramCallback(
  input: string,
  deps: TelegramCommandDependencies = defaultDependencies,
): Promise<TelegramCommandResult> {
  const [action = "", ...rest] = input.split(":");

  switch (action) {
    case "status":
      return handleTelegramCommand(`/status ${rest.join(":")}`, deps);
    case "approve-gate": {
      const [runId, gate] = rest;
      if (!runId || !gate) {
        return { text: "Invalid approval callback payload." };
      }
      return handleTelegramCommand(`/approve ${runId} ${gate}`, deps);
    }
    case "resume-run": {
      const [runId] = rest;
      if (!runId) {
        return { text: "Invalid resume callback payload." };
      }
      return handleTelegramCommand(`/resume ${runId}`, deps);
    }
    case "start-review": {
      const [projectKey] = rest;
      if (!projectKey) {
        return { text: "Invalid review callback payload." };
      }
      return handleTelegramCommand(`/review ${projectKey}`, deps);
    }
    case "start-run": {
      const [projectKey] = rest;
      if (!projectKey) {
        return { text: "Invalid run callback payload." };
      }
      return handleTelegramCommand(`/run ${projectKey}`, deps);
    }
    case "start-build": {
      const [projectKey] = rest;
      if (!projectKey) {
        return { text: "Invalid build callback payload." };
      }
      return handleTelegramCommand(`/build ${projectKey}`, deps);
    }
    case "start-audit": {
      const [projectKey] = rest;
      if (!projectKey) {
        return { text: "Invalid audit callback payload." };
      }
      return handleTelegramCommand(`/audit ${projectKey}`, deps);
    }
    case "stop-project": {
      const [projectKey] = rest;
      if (!projectKey) {
        return { text: "Invalid stop callback payload." };
      }
      return handleTelegramCommand(`/stop ${projectKey}`, deps);
    }
    case "approve-chat": {
      const [requestId] = rest;
      if (!requestId) {
        return { text: "Invalid approve-chat callback payload." };
      }
      return handleTelegramCommand(`/approve-chat ${requestId}`, deps);
    }
    case "reject-chat": {
      const [requestId] = rest;
      if (!requestId) {
        return { text: "Invalid reject-chat callback payload." };
      }
      return handleTelegramCommand(`/reject-chat ${requestId}`, deps);
    }
    default:
      return { text: "Unknown Telegram action." };
  }
}
