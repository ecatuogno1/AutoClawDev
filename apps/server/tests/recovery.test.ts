import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RunRecord } from "@autoclawdev/types";
import { buildProjectStatsFromRuns } from "../src/lib/history.ts";
import { appendRunEvent, readRunEvents, writeRunRecord } from "../src/lib/runRecords.ts";

test("recovery resolution updates run lifecycle and appends an event", async () => {
  const root = mkdtempSync(join(tmpdir(), "autoclaw-recovery-"));
  const projectsDir = join(root, "projects");
  const projectDir = join(root, "sample-project");

  mkdirSync(projectsDir, { recursive: true });
  mkdirSync(join(projectDir, ".autoclaw"), { recursive: true });

  writeFileSync(
    join(projectsDir, "sample.json"),
    JSON.stringify({
      name: "Sample",
      path: projectDir,
      description: "Sample project",
      package_manager: "pnpm",
      test_cmd: "pnpm test",
      lint_cmd: "pnpm lint",
      focus: [],
      workflow_type: "standard",
      team_profile: "reliability",
      speed_profile: "balanced",
      default_cycles: 1,
      max_parallel_cycles: 1,
      dev_url: "http://localhost:3000",
    }),
  );

  process.env.AUTOCLAWDEV_PROJECTS_DIR = projectsDir;

  const now = new Date().toISOString();
  const run: RunRecord = {
    id: "sample-recovery",
    projectKey: "sample",
    mode: "run",
    status: "failed",
    source: "native",
    cycles: 1,
    workflowType: "standard",
    teamProfile: "reliability",
    createdAt: now,
    updatedAt: now,
    artifactRoot: join(projectDir, ".autoclaw", "runs", "sample-recovery"),
    manifestSource: "test",
    historyCompleteness: "full",
    outcome: "recovery_required",
    summary: "Run requires recovery",
    recovery: {
      required: true,
      status: "open",
      branch: "feature/sample",
      worktree: join(root, "feature-worktree"),
    },
    phases: [],
  };

  writeRunRecord(projectDir, run);
  appendRunEvent(projectDir, {
    id: "sample-recovery-queued",
    runId: run.id,
    projectKey: run.projectKey,
    type: "queued",
    timestamp: now,
    message: "Queued",
  });

  const { updateRunRecoveryState, getRunRecordById } = await import("../src/lib/orchestrator.ts");
  const updated = await updateRunRecoveryState({
    runId: run.id,
    action: "resolve",
    note: "Recovered manually",
  });

  assert.ok(updated);
  assert.equal(updated.recovery?.required, false);
  assert.equal(updated.recovery?.status, "resolved");
  assert.equal(updated.recovery?.note, "Recovered manually");

  const stored = await getRunRecordById(run.id);
  assert.ok(stored);
  assert.equal(stored.record.recovery?.status, "resolved");

  const events = readRunEvents(projectDir, run.id);
  assert.ok(events.some((event) => event.type === "recovery_resolved"));

  delete process.env.AUTOCLAWDEV_PROJECTS_DIR;
  rmSync(root, { recursive: true, force: true });
});

test("project stats only count open recovery items in the queue", () => {
  const now = new Date().toISOString();
  const runs: RunRecord[] = [
    {
      id: "open",
      projectKey: "sample",
      mode: "run",
      status: "failed",
      source: "native",
      cycles: 1,
      workflowType: "standard",
      teamProfile: "reliability",
      createdAt: now,
      updatedAt: now,
      artifactRoot: "/tmp/open",
      manifestSource: "test",
      historyCompleteness: "full",
      outcome: "recovery_required",
      recovery: { required: true, status: "open" },
      phases: [],
    },
    {
      id: "resolved",
      projectKey: "sample",
      mode: "run",
      status: "failed",
      source: "native",
      cycles: 1,
      workflowType: "standard",
      teamProfile: "reliability",
      createdAt: now,
      updatedAt: now,
      artifactRoot: "/tmp/resolved",
      manifestSource: "test",
      historyCompleteness: "full",
      outcome: "recovery_required",
      recovery: { required: false, status: "resolved" },
      phases: [],
    },
  ];

  const stats = buildProjectStatsFromRuns(runs, { project: "sample" });
  assert.equal(stats.recoveryRequired, 1);
});
