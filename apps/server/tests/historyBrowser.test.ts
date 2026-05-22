import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { RunRecord } from "@autoclawdev/types";
import { chromium, type Browser } from "playwright";
import { writeRunRecord } from "../src/lib/runRecords.ts";

async function waitForHealthy(url: string): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 20_000) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // Retry until the server is ready.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function createRecoveryRun(projectDir: string): RunRecord {
  const createdAt = "2026-03-27T08:30:00.000Z";
  const runId = "sample-recovery-run";
  const artifactRoot = join(projectDir, ".autoclaw", "runs", runId);
  mkdirSync(artifactRoot, { recursive: true });
  writeFileSync(join(artifactRoot, "recovery-summary.txt"), "Recovery summary for sample run\n", "utf-8");

  return {
    id: runId,
    projectKey: "sample",
    mode: "run",
    status: "failed",
    source: "native",
    cycles: 1,
    workflowType: "standard",
    teamProfile: "reliability",
    createdAt,
    updatedAt: createdAt,
    artifactRoot,
    manifestSource: "global_registry",
    outcome: "recovery_required",
    historyCompleteness: "full",
    summary: "Manual recovery required",
    phases: [],
    recovery: {
      required: true,
      status: "open",
      branch: "autoclawdev/sample/recovery",
      worktree: join(tmpdir(), "sample-recovery-worktree"),
      summaryPath: join(artifactRoot, "recovery-summary.txt"),
    },
  };
}

function createProjectFixture(root: string): {
  projectDir: string;
  projectsDir: string;
} {
  const projectsDir = join(root, "projects");
  const projectDir = join(root, "sample-project");
  const reviewDir = join(projectDir, ".autoclaw", "reviews");
  const buildDir = join(projectDir, ".autoclaw", "builds", "sample-plan");

  mkdirSync(projectsDir, { recursive: true });
  mkdirSync(reviewDir, { recursive: true });
  mkdirSync(buildDir, { recursive: true });
  mkdirSync(join(projectDir, ".autoclaw"), { recursive: true });

  writeFileSync(
    join(projectsDir, "sample.json"),
    JSON.stringify({
      name: "Sample Project",
      path: projectDir,
      description: "Browser regression fixture",
      package_manager: "pnpm",
      test_cmd: "pnpm test",
      lint_cmd: "pnpm lint",
      workflow_type: "standard",
      team_profile: "reliability",
      speed_profile: "balanced",
      default_cycles: 1,
      max_parallel_cycles: 1,
      dev_url: "http://localhost:3000",
    }),
  );

  writeFileSync(
    join(reviewDir, "sample-review-codex-20260326-112524.meta.txt"),
    [
      "provider=codex",
      "session_name=sample-review",
      "started_at=2026-03-26T11:25:24-07:00",
      "ended_at=2026-03-26T11:55:24-07:00",
      `tty_log=${join(reviewDir, "sample-review-codex-20260326-112524.log")}`,
      "exit_code=0",
    ].join("\n"),
  );
  writeFileSync(join(reviewDir, "sample-review-codex-20260326-112524.log"), "review console\n", "utf-8");
  writeFileSync(join(reviewDir, "progress.md"), "# Review Progress\n\nAll review phases complete\n", "utf-8");
  writeFileSync(join(reviewDir, "audit-report.md"), "# Audit\n", "utf-8");
  writeFileSync(join(reviewDir, "execution-plan.md"), "# Plan\n", "utf-8");

  writeFileSync(
    join(buildDir, "build-20260326-165530.meta.txt"),
    [
      "provider=codex",
      "plan=sample-plan",
      "started_at=2026-03-26T16:55:30-07:00",
      "ended_at=2026-03-26T17:05:21-07:00",
      "exit_code=0",
    ].join("\n"),
  );
  writeFileSync(join(buildDir, "build-phase1-attempt1-20260326-165530.typescript"), "build console\n", "utf-8");
  writeFileSync(join(buildDir, "progress.md"), "# Build Progress\n\nPhase 1 complete\n", "utf-8");
  writeFileSync(join(buildDir, "plan.md"), "# Sample Plan\n", "utf-8");

  writeRunRecord(projectDir, createRecoveryRun(projectDir));

  return { projectDir, projectsDir };
}

function startServer(options: {
  globalHome: string;
  port: number;
  projectsDir: string;
}): ChildProcessWithoutNullStreams {
  return spawn("node", ["dist/index.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(options.port),
      AUTOCLAWDEV_HOME: options.globalHome,
      AUTOCLAWDEV_PROJECTS_DIR: options.projectsDir,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

test("browser history regression covers recovery queue and derived build/review history", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "autoclaw-browser-history-"));
  const globalHome = join(root, "home");
  const { projectsDir } = createProjectFixture(root);
  const port = 4341;
  let browser: Browser | undefined;
  const server = startServer({ globalHome, port, projectsDir });
  let serverOutput = "";

  server.stdout.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });

  t.after(async () => {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
    server.kill("SIGTERM");
    rmSync(root, { recursive: true, force: true });
  });

  try {
    browser = await chromium.launch();
  } catch (error) {
    t.skip(`Playwright browser unavailable: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  await waitForHealthy(`http://127.0.0.1:${port}/api/health`);

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForSelector("text=Recovery Queue");
  await page.waitForSelector("text=1 queued");
  await page.waitForSelector("text=History");

  const summaryPromise = context.waitForEvent("page");
  await page.getByRole("link", { name: "Open summary" }).click();
  const summaryPage = await summaryPromise;
  await summaryPage.waitForLoadState("domcontentloaded");
  await summaryPage.waitForSelector("text=Recovery summary for sample run");
  await summaryPage.close();

  await page.getByRole("button", { name: "Mark resolved" }).click();
  await page.waitForSelector("text=0 queued");

  await page.getByRole("button", { name: "History" }).nth(1).click();
  await page.waitForSelector("text=Run History");
  await page.waitForSelector("text=All review phases complete");
  await page.waitForSelector("text=Phase 1 complete");
  await page.waitForSelector("text=recovery resolved");

  const content = await page.textContent("body");
  assert.ok(content?.includes("All review phases complete"));
  assert.ok(content?.includes("Phase 1 complete"));
}, 30_000);
