import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import type { RunRecord } from "@autoclawdev/types";
import reviewsRouter from "../src/routes/reviews.ts";
import { appendRunEvent, writeRunRecord } from "../src/lib/runRecords.ts";

test("reviews latest exposes managed run phases and recent events", async () => {
  const root = mkdtempSync(join(tmpdir(), "autoclaw-reviews-route-"));
  const projectsDir = join(root, "projects");
  const projectDir = join(root, "sample-project");
  mkdirSync(projectsDir, { recursive: true });
  mkdirSync(join(projectDir, ".autoclaw", "runs"), { recursive: true });

  const runId = "sample-123";
  const artifactRoot = join(projectDir, ".autoclaw", "runs", runId);
  mkdirSync(artifactRoot, { recursive: true });
  writeFileSync(join(artifactRoot, "audit-report.md"), "# Audit\n");
  writeFileSync(join(artifactRoot, "execution-plan.md"), "## Phase 1\n1. Fix things\n");
  writeFileSync(join(artifactRoot, "progress.md"), "## Done\n- implemented phase 1\n");

  const record: RunRecord = {
    id: runId,
    projectKey: "sample",
    mode: "review",
    status: "running",
    source: "native",
    cycles: 1,
    workflowType: "deep-review",
    teamProfile: "reliability",
    createdAt: "2026-04-01T10:00:00.000Z",
    updatedAt: "2026-04-01T10:05:00.000Z",
    artifactRoot,
    manifestSource: join(projectsDir, "sample.json"),
    historyCompleteness: "full",
    summary: "Managed deep review started",
    phases: [
      { id: `${runId}-1`, runId, name: "preflight", status: "completed" },
      { id: `${runId}-2`, runId, name: "audit", status: "completed", detail: "Audit report generated" },
      { id: `${runId}-3`, runId, name: "fix", status: "running", detail: "Implementing execution plan" },
      { id: `${runId}-4`, runId, name: "validate", status: "queued" },
      { id: `${runId}-5`, runId, name: "report", status: "queued" },
    ],
    reviewDetail: {
      provider: "codex",
      sessionName: "sample-deep-review",
      startedAt: "2026-04-01T10:00:00.000Z",
      model: "gpt-5.4",
      projectPath: projectDir,
      ttyLog: join(artifactRoot, "sample.log"),
      promptSource: "managed-templates",
      hasAuditReport: true,
      hasExecutionPlan: true,
      hasProgress: true,
    },
  };

  writeRunRecord(projectDir, record);
  appendRunEvent(projectDir, {
    id: `${runId}-evt-1`,
    runId,
    projectKey: "sample",
    type: "phase_started",
    timestamp: "2026-04-01T10:02:00.000Z",
    message: "Deep review fix phase started",
  });
  appendRunEvent(projectDir, {
    id: `${runId}-evt-2`,
    runId,
    projectKey: "sample",
    type: "system",
    timestamp: "2026-04-01T10:04:00.000Z",
    message: "Applying high-priority fixes",
  });

  writeFileSync(
    join(projectsDir, "sample.json"),
    JSON.stringify({
      name: "Sample",
      path: projectDir,
      description: "Fixture",
      package_manager: "pnpm",
      test_cmd: "pnpm test",
      lint_cmd: "pnpm lint",
      workflow_type: "deep-review",
      team_profile: "reliability",
      speed_profile: "balanced",
      default_cycles: 1,
      max_parallel_cycles: 1,
      dev_url: "http://localhost:3000",
    }),
  );
  process.env.AUTOCLAWDEV_PROJECTS_DIR = projectsDir;

  const app = express();
  app.use("/api/reviews", reviewsRouter);
  const server = await new Promise<import("node:http").Server>((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/reviews/sample/reviews/latest`);
    assert.equal(response.ok, true);
    const payload = (await response.json()) as {
      runId?: string;
      runStatus?: string;
      managedRun?: {
        runId: string;
        status: string;
        phases: Array<{ name: string; status: string; detail?: string }>;
        latestEvents: Array<{ type: string; message?: string }>;
      };
    };

    assert.equal(payload.runId, runId);
    assert.equal(payload.runStatus, "running");
    assert.equal(payload.managedRun?.runId, runId);
    assert.equal(payload.managedRun?.status, "running");
    assert.equal(payload.managedRun?.phases[2]?.name, "fix");
    assert.equal(payload.managedRun?.phases[2]?.status, "running");
    assert.equal(payload.managedRun?.latestEvents.at(-1)?.type, "system");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    delete process.env.AUTOCLAWDEV_PROJECTS_DIR;
    rmSync(root, { recursive: true, force: true });
  }
});
