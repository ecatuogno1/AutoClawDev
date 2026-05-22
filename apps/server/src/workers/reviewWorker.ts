import { spawn } from "node:child_process";
import {
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  type WriteStream,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  DeepReviewDetail,
  EventRecord,
  RunRecord,
} from "@autoclawdev/types";
import { getProjectDetailed } from "../lib/config.js";
import { appendRunEvent, readRunRecord, updateRunRecord } from "../lib/runRecords.js";

type Provider = "claude" | "codex" | "codex-fast";
type PhaseName = "audit" | "fix" | "validate" | "report";

interface ReviewContext {
  provider: Provider;
  projectKey: string;
  projectName: string;
  projectPath: string;
  testCmd: string;
  lintCmd: string;
  artifactRoot: string;
  legacyReviewDir: string;
  runId?: string;
  promptSource: string;
  sessionName: string;
  model: string;
  ttyLog: string;
  metaLog: string;
  resumeHint: string;
  startedAt: string;
  promptFiles: string[];
  resuming: boolean;
}

const SERVER_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = process.env.AUTOCLAWDEV_REPO_ROOT || join(SERVER_DIR, "../../../../");
const PROMPTS_DIR = join(REPO_ROOT, "scripts", "prompts");
const INGEST_SCRIPT = join(REPO_ROOT, "scripts", "ingest-to-memory.sh");

function parseArgs(argv: string[]): { projectKey: string; provider: Provider } {
  let projectKey = "";
  let provider: Provider = "claude";

  for (const arg of argv) {
    if (arg === "--claude") provider = "claude";
    else if (arg === "--codex") provider = "codex";
    else if (arg === "--codex-fast") provider = "codex-fast";
    else if (!arg.startsWith("-") && !projectKey) projectKey = arg;
  }

  if (!projectKey) {
    throw new Error("Usage: reviewWorker <project-key> [--claude|--codex|--codex-fast]");
  }

  return { projectKey, provider };
}

function buildProgramContent(projectPath: string): string {
  const parts: string[] = [];
  for (const fileName of ["CLAUDE.md", "AGENTS.md", "PRD.md", "README.md"]) {
    const path = join(projectPath, fileName);
    if (!existsSync(path)) continue;
    parts.push(`--- ${fileName} ---`);
    parts.push(readFileSync(path, "utf-8").split("\n").slice(0, 100).join("\n"));
    parts.push("...");
  }
  return parts.length > 0 ? parts.join("\n") : "No program file found.";
}

function renderPromptTemplate(templatePath: string, replacements: Record<string, string>): string {
  let content = readFileSync(templatePath, "utf-8");
  for (const [key, value] of Object.entries(replacements)) {
    content = content.replaceAll(`{{${key}}}`, value);
  }
  return content;
}

function createPromptFile(targetDir: string, name: string, content: string): string {
  mkdirSync(targetDir, { recursive: true });
  const path = join(targetDir, name);
  writeFileSync(path, content, "utf-8");
  return path;
}

function resolveProviderRuntime(provider: Provider): {
  command: string;
  args: string[];
  model: string;
  resumeHint: string;
} {
  switch (provider) {
    case "claude":
      return {
        command: "claude",
        args: [
          "--print",
          "--model",
          process.env.CLAUDE_MODEL || "opus",
          "--effort",
          "max",
          "--dangerously-skip-permissions",
          "--verbose",
        ],
        model: process.env.CLAUDE_MODEL || "opus",
        resumeHint: "autoclaw review <project>",
      };
    case "codex":
      return {
        command: "codex",
        args: [
          "exec",
          "-m",
          "gpt-5.4",
          "-c",
          "model_reasoning_effort=\"high\"",
          "--dangerously-bypass-approvals-and-sandbox",
        ],
        model: "gpt-5.4",
        resumeHint: "autoclaw review <project> --codex",
      };
    case "codex-fast":
      return {
        command: "codex",
        args: [
          "exec",
          "-m",
          "gpt-5.4",
          "-c",
          "model_reasoning_effort=\"high\"",
          "--dangerously-bypass-approvals-and-sandbox",
        ],
        model: "gpt-5.4",
        resumeHint: "autoclaw review <project> --codex-fast",
      };
  }
}

function createEvent(
  runId: string,
  projectKey: string,
  type: EventRecord["type"],
  message: string,
  data?: Record<string, unknown>,
): EventRecord {
  return {
    id: `${runId}-${Date.now()}-${type}`,
    runId,
    projectKey,
    type,
    timestamp: new Date().toISOString(),
    message,
    data,
  };
}

function emitRunEvent(ctx: ReviewContext, type: EventRecord["type"], message: string, data?: Record<string, unknown>) {
  if (!ctx.runId) return;
  appendRunEvent(
    ctx.projectPath,
    createEvent(ctx.runId, ctx.projectKey, type, message, data),
  );
}

function updatePhase(ctx: ReviewContext, phaseName: PhaseName, status: "running" | "completed" | "failed" | "skipped", detail: string) {
  if (!ctx.runId) return;
  updateRunRecord(ctx.projectPath, ctx.runId, (record) => ({
    ...record,
    phases: record.phases.map((phase) =>
      phase.name !== phaseName
        ? phase
        : {
            ...phase,
            status,
            startedAt: status === "running" ? (phase.startedAt ?? new Date().toISOString()) : phase.startedAt,
            completedAt:
              status === "completed" || status === "failed" || status === "skipped"
                ? new Date().toISOString()
                : phase.completedAt,
            detail,
          },
    ),
  }));
}

function getRunPhaseStatus(record: RunRecord | undefined, phaseName: PhaseName): string | undefined {
  return record?.phases.find((phase) => phase.name === phaseName)?.status;
}

function isCompletedPhase(record: RunRecord | undefined, phaseName: PhaseName): boolean {
  return getRunPhaseStatus(record, phaseName) === "completed";
}

function isSkippedPhase(record: RunRecord | undefined, phaseName: PhaseName): boolean {
  return getRunPhaseStatus(record, phaseName) === "skipped";
}

function collectArtifactItems(ctx: ReviewContext): NonNullable<RunRecord["artifacts"]> {
  const items: NonNullable<RunRecord["artifacts"]>["items"] = [];
  const candidates: Array<[string, string, string, "report" | "log" | "data"]> = [
    [join(ctx.artifactRoot, "audit-report.md"), "Audit Report", "text/markdown", "report"],
    [join(ctx.artifactRoot, "execution-plan.md"), "Execution Plan", "text/markdown", "report"],
    [join(ctx.artifactRoot, "progress.md"), "Progress", "text/markdown", "report"],
    [ctx.ttyLog, "Review Log", "text/plain", "log"],
    [ctx.metaLog, "Review Metadata", "text/plain", "data"],
  ];

  for (const promptFile of ctx.promptFiles) {
    candidates.push([promptFile, `Prompt ${basename(promptFile)}`, "text/markdown", "data"]);
  }

  for (const [path, label, contentType, kind] of candidates) {
    if (!existsSync(path)) continue;
    items.push({
      key: basename(path),
      label,
      path,
      contentType,
      kind,
    });
  }

  return {
    root: ctx.artifactRoot,
    items,
  };
}

function syncReviewArtifact(ctx: ReviewContext, name: string) {
  const source = join(ctx.legacyReviewDir, name);
  if (!existsSync(source)) return;
  const target = join(ctx.artifactRoot, name);
  if (source !== target) {
    copyFileSync(source, target);
  }
}

function updateReviewDetail(
  ctx: ReviewContext,
  summary: string,
  exitCode?: number,
  endedAt?: string,
) {
  if (!ctx.runId) return;
  const existing = readRunRecord(ctx.projectPath, ctx.runId);
  if (!existing) return;

  const artifacts = collectArtifactItems(ctx);
  const previous = (existing.reviewDetail ?? {}) as DeepReviewDetail | Record<string, unknown>;
  const detail: DeepReviewDetail = {
    provider: ctx.provider,
    sessionName: ctx.sessionName,
    startedAt: ctx.startedAt,
    endedAt: endedAt ?? (typeof previous.endedAt === "string" ? previous.endedAt : undefined),
    exitCode: typeof exitCode === "number" ? exitCode : (typeof previous.exitCode === "number" ? previous.exitCode : undefined),
    model: ctx.model,
    projectPath: ctx.projectPath,
    ttyLog: ctx.ttyLog,
    promptSource: ctx.promptSource,
    resumeHint: ctx.resumeHint,
    generatedReports: artifacts.items.filter((item) => item.kind === "report").map((item) => item.path),
    hasAuditReport: existsSync(join(ctx.artifactRoot, "audit-report.md")),
    hasExecutionPlan: existsSync(join(ctx.artifactRoot, "execution-plan.md")),
    hasProgress: existsSync(join(ctx.artifactRoot, "progress.md")),
  };

  updateRunRecord(ctx.projectPath, ctx.runId, (record) => ({
    ...record,
    summary,
    artifacts,
    reviewDetail: detail,
  }));
}

function writeMeta(ctx: ReviewContext, values: Record<string, string | number | undefined>) {
  const lines = Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${key}=${String(value)}`);
  writeFileSync(ctx.metaLog, `${lines.join("\n")}\n`, "utf-8");
}

async function runLoggedCommand(options: {
  command: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  log: WriteStream;
}): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(options.command, options.args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout?.on("data", (chunk: Buffer) => {
      process.stdout.write(chunk);
      options.log.write(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      process.stderr.write(chunk);
      options.log.write(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

async function runProviderPhase(ctx: ReviewContext, phaseName: "audit" | "fix", promptPath: string, log: WriteStream): Promise<number> {
  const runtime = resolveProviderRuntime(ctx.provider);
  const prompt = readFileSync(promptPath, "utf-8");
  process.stdout.write(`\n== ${phaseName.toUpperCase()} PHASE ==\n`);
  log.write(`\n== ${phaseName.toUpperCase()} PHASE ==\n`);
  return runLoggedCommand({
    command: runtime.command,
    args: [...runtime.args, prompt],
    cwd: ctx.projectPath,
    env: process.env,
    log,
  });
}

async function runValidationPhase(ctx: ReviewContext, log: WriteStream): Promise<number> {
  const steps = [
    { label: "test", command: ctx.testCmd },
    { label: "lint", command: ctx.lintCmd },
  ].filter((entry) => entry.command.trim().length > 0);

  if (steps.length === 0) {
    return 0;
  }

  for (const step of steps) {
    process.stdout.write(`\n== VALIDATE: ${step.label.toUpperCase()} ==\n`);
    log.write(`\n== VALIDATE: ${step.label.toUpperCase()} ==\n`);
    const exitCode = await runLoggedCommand({
      command: "bash",
      args: ["-lc", step.command],
      cwd: ctx.projectPath,
      env: process.env,
      log,
    });
    if (exitCode !== 0) {
      return exitCode;
    }
  }

  return 0;
}

async function maybeIngestToMemory(ctx: ReviewContext, log: WriteStream): Promise<void> {
  const auditReport = join(ctx.projectPath, ".autoclaw", "reviews", "audit-report.md");
  if (!existsSync(auditReport) || !existsSync(INGEST_SCRIPT)) {
    return;
  }

  process.stdout.write("\nIngesting deep review findings into AutoClawDev memory...\n");
  log.write("\nIngesting deep review findings into AutoClawDev memory...\n");
  await runLoggedCommand({
    command: "bash",
    args: [INGEST_SCRIPT, ctx.projectKey, "deep-review"],
    cwd: REPO_ROOT,
    env: process.env,
    log,
  });
}

async function main() {
  const { projectKey, provider } = parseArgs(process.argv.slice(2));
  const manifest = await getProjectDetailed(projectKey);
  if (!manifest) {
    throw new Error(`Unknown project: ${projectKey}`);
  }

  const runtime = resolveProviderRuntime(provider);
  const artifactRoot = process.env.AUTOCLAWDEV_RUN_ARTIFACT_ROOT || join(manifest.path, ".autoclaw", "reviews");
  const legacyReviewDir = join(manifest.path, ".autoclaw", "reviews");
  const startedAt = new Date().toISOString();
  const stamp = startedAt.replace(/[:.]/g, "-");
  const sessionName = `${projectKey}-deep-review`;
  mkdirSync(artifactRoot, { recursive: true });
  mkdirSync(legacyReviewDir, { recursive: true });

  const logFileName = provider === "claude"
    ? `${sessionName}-claude-${stamp}.typescript`
    : `${sessionName}-${provider}-${stamp}.log`;
  const metaFileName = `${sessionName}-${provider}-${stamp}.meta.txt`;
  const ttyLog = join(artifactRoot, logFileName);
  const metaLog = join(artifactRoot, metaFileName);
  const log = createWriteStream(ttyLog, { flags: "a" });

  const customPromptPath = join(manifest.path, "scripts", "deep-review-prompt.md");
  const promptFiles: string[] = [];
  let promptSource = "managed-templates";
  const programContent = buildProgramContent(manifest.path);
  const memoryContext = "";

  const auditPromptPath = existsSync(customPromptPath)
    ? customPromptPath
    : createPromptFile(
        artifactRoot,
        "review-audit-prompt.md",
        renderPromptTemplate(join(PROMPTS_DIR, "deep-review-audit.txt"), {
          REPO: manifest.path,
          PROJECT_NAME: manifest.name,
          TEST_CMD: manifest.test_cmd ?? "",
          LINT_CMD: manifest.lint_cmd ?? "",
          PROGRAM_CONTENT: programContent,
          MEMORY_CONTEXT: memoryContext,
          CURRENT_PHASE: "",
        }),
      );
  promptFiles.push(auditPromptPath);

  let fixPromptPath: string | undefined;
  if (!existsSync(customPromptPath)) {
    fixPromptPath = createPromptFile(
      artifactRoot,
      "review-fix-prompt.md",
      renderPromptTemplate(join(PROMPTS_DIR, "deep-review-fix.txt"), {
        REPO: manifest.path,
        PROJECT_NAME: manifest.name,
        TEST_CMD: manifest.test_cmd ?? "",
        LINT_CMD: manifest.lint_cmd ?? "",
        PROGRAM_CONTENT: programContent,
        MEMORY_CONTEXT: memoryContext,
        CURRENT_PHASE:
          "Phase 1 through Phase 4 in execution-plan order; continue until blocked or all planned work is complete.",
      }),
    );
    promptFiles.push(fixPromptPath);
  } else {
    promptSource = "project-override";
  }

  const ctx: ReviewContext = {
    provider,
    projectKey,
    projectName: manifest.name,
    projectPath: manifest.path,
    testCmd: manifest.test_cmd ?? "",
    lintCmd: manifest.lint_cmd ?? "",
    artifactRoot,
    legacyReviewDir,
    runId: process.env.AUTOCLAWDEV_RUN_ID,
    promptSource,
    sessionName,
    model: runtime.model,
    ttyLog,
    metaLog,
    resumeHint: runtime.resumeHint.replace("<project>", projectKey),
    startedAt,
    promptFiles,
    resuming: false,
  };

  const existingRun = ctx.runId ? readRunRecord(ctx.projectPath, ctx.runId) : undefined;
  ctx.resuming = Boolean(existingRun);

  writeMeta(ctx, {
    provider,
    project: projectKey,
    project_name: manifest.name,
    project_path: manifest.path,
    session_name: sessionName,
    started_at: startedAt,
    model: runtime.model,
    prompt_source: promptSource,
    tty_log: ttyLog,
    test_cmd: manifest.test_cmd ?? "",
    lint_cmd: manifest.lint_cmd ?? "",
  });

  updateReviewDetail(ctx, "Managed deep review started");
  emitRunEvent(ctx, "system", "Native deep review worker started", {
    provider,
    promptSource,
    resumed: ctx.resuming,
  });

  let exitCode = 0;

  try {
    process.stdout.write(`AutoClawDev Deep Review\nProject: ${manifest.name} (${projectKey})\nPath: ${manifest.path}\nProvider: ${provider}\nLog: ${ttyLog}\n`);

    if (!isCompletedPhase(existingRun, "audit")) {
      updatePhase(ctx, "audit", "running", ctx.resuming ? "Resumed audit phase started" : "Native audit phase started");
      emitRunEvent(ctx, "phase_started", ctx.resuming ? "Deep review audit phase resumed" : "Deep review audit phase started");
      exitCode = await runProviderPhase(ctx, "audit", auditPromptPath, log);
      if (exitCode !== 0) {
        updatePhase(ctx, "audit", "failed", `Audit phase failed with exit code ${exitCode}`);
        if (!isCompletedPhase(existingRun, "fix")) {
          updatePhase(ctx, "fix", "skipped", "Skipped after audit failure");
        }
        if (!isCompletedPhase(existingRun, "validate")) {
          updatePhase(ctx, "validate", "skipped", "Skipped after audit failure");
        }
        emitRunEvent(ctx, "phase_finished", "Deep review audit phase failed", { code: exitCode });
      } else {
        syncReviewArtifact(ctx, "audit-report.md");
        syncReviewArtifact(ctx, "execution-plan.md");
        updatePhase(ctx, "audit", "completed", "Audit report and execution plan generated");
        emitRunEvent(ctx, "phase_finished", "Deep review audit phase completed");
        updateReviewDetail(ctx, "Deep review audit completed");
      }
    } else {
      emitRunEvent(ctx, "system", "Skipping completed audit phase during review resume");
    }

    if (exitCode === 0) {
      if (fixPromptPath) {
        if (!isCompletedPhase(existingRun, "fix")) {
          updatePhase(ctx, "fix", "running", ctx.resuming ? "Resumed fix phase started" : "Native fix phase started");
          emitRunEvent(ctx, "phase_started", ctx.resuming ? "Deep review fix phase resumed" : "Deep review fix phase started");
          exitCode = await runProviderPhase(ctx, "fix", fixPromptPath, log);
          if (exitCode !== 0) {
            updatePhase(ctx, "fix", "failed", `Fix phase failed with exit code ${exitCode}`);
            emitRunEvent(ctx, "phase_finished", "Deep review fix phase failed", { code: exitCode });
          } else {
            syncReviewArtifact(ctx, "progress.md");
            updatePhase(ctx, "fix", "completed", "Fix phase completed");
            emitRunEvent(ctx, "phase_finished", "Deep review fix phase completed");
          }
        } else {
          emitRunEvent(ctx, "system", "Skipping completed fix phase during review resume");
        }
      } else {
        if (!isCompletedPhase(existingRun, "fix") && !isSkippedPhase(existingRun, "fix")) {
          updatePhase(ctx, "fix", "skipped", "Project-specific prompt handled combined review flow");
        }
      }
    }

    if (exitCode === 0) {
      if (!isCompletedPhase(existingRun, "validate")) {
        updatePhase(ctx, "validate", "running", ctx.resuming ? "Validation commands resumed" : "Validation commands started");
        emitRunEvent(ctx, "phase_started", ctx.resuming ? "Deep review validation phase resumed" : "Deep review validation phase started");
        const validationExit = await runValidationPhase(ctx, log);
        if (validationExit !== 0) {
          exitCode = validationExit;
          updatePhase(ctx, "validate", "failed", `Validation failed with exit code ${validationExit}`);
          emitRunEvent(ctx, "phase_finished", "Deep review validation phase failed", { code: validationExit });
        } else {
          updatePhase(
            ctx,
            "validate",
            ctx.testCmd || ctx.lintCmd ? "completed" : "skipped",
            ctx.testCmd || ctx.lintCmd ? "Validation commands passed" : "No validation commands configured",
          );
          emitRunEvent(ctx, "phase_finished", "Deep review validation phase completed");
        }
      } else {
        emitRunEvent(ctx, "system", "Skipping completed validation phase during review resume");
      }
    }
  } finally {
    updatePhase(ctx, "report", "running", "Finalizing review artifacts");
    emitRunEvent(ctx, "phase_started", "Deep review report phase started");
    await maybeIngestToMemory(ctx, log);
    syncReviewArtifact(ctx, "audit-report.md");
    syncReviewArtifact(ctx, "execution-plan.md");
    syncReviewArtifact(ctx, "progress.md");

    const endedAt = new Date().toISOString();
    writeMeta(ctx, {
      provider,
      project: projectKey,
      project_name: manifest.name,
      project_path: manifest.path,
      session_name: sessionName,
      started_at: startedAt,
      ended_at: endedAt,
      exit_code: exitCode,
      model: runtime.model,
      prompt_source: promptSource,
      tty_log: ttyLog,
      test_cmd: manifest.test_cmd ?? "",
      lint_cmd: manifest.lint_cmd ?? "",
    });

    updatePhase(
      ctx,
      "report",
      exitCode === 0 ? "completed" : "failed",
      exitCode === 0 ? "Review artifacts finalized" : `Review finished with exit code ${exitCode}`,
    );
    emitRunEvent(
      ctx,
      "phase_finished",
      exitCode === 0 ? "Deep review report phase completed" : "Deep review report phase failed",
      exitCode === 0 ? undefined : { code: exitCode },
    );
    updateReviewDetail(
      ctx,
      exitCode === 0 ? "Managed deep review completed" : "Managed deep review failed",
      exitCode,
      endedAt,
    );

    process.stdout.write(`\nSession ended with code: ${exitCode}\nResume: ${ctx.resumeHint}\nLogs: ${artifactRoot}\n`);
    log.end();
  }

  process.exit(exitCode);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
