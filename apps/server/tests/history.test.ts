import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("legacy history import writes typed run records and degraded outcomes", async () => {
  const root = mkdtempSync(join(tmpdir(), "autoclaw-history-"));
  const projectsDir = join(root, "projects");
  const workspaceDir = join(root, "workspace");
  const projectDir = join(root, "sample-project");

  mkdirSync(projectsDir, { recursive: true });
  mkdirSync(workspaceDir, { recursive: true });
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
      workflow_type: "standard",
      team_profile: "reliability",
      speed_profile: "balanced",
      default_cycles: 1,
      max_parallel_cycles: 1,
      dev_url: "http://localhost:3000",
    }),
  );

  writeFileSync(
    join(workspaceDir, "experiments-sample.jsonl"),
    `${JSON.stringify({
      id: "exp-001",
      timestamp: "2026-03-25T12:00:00.000Z",
      directive: "run",
      description: "Legacy run",
      result: "pass",
    })}\n`,
  );

  writeFileSync(
    join(workspaceDir, "run-sample.log"),
    [
      " 🔬 CYCLE 1 / 1 - exp-001",
      "Validation matched known baseline failures for this integration commit",
      "Commit: Merged branch (abc1234)",
    ].join("\n"),
  );

  process.env.AUTOCLAWDEV_PROJECTS_DIR = projectsDir;
  process.env.AUTOCLAWDEV_WORKSPACE = workspaceDir;

  try {
    const { importLegacyHistory, listProjectHistory, getProjectedExperiments } = await import("../src/lib/history.ts");

    const payload = await importLegacyHistory();
    assert.equal(payload.projects[0]?.imported, 1);

    const runs = await listProjectHistory("sample", 10);
    assert.equal(runs.length, 1);
    assert.equal(runs[0]?.source, "legacy_import");
    assert.equal(runs[0]?.outcome, "degraded_pass");
    assert.equal(runs[0]?.overrideReason, "baseline_match");
    assert.equal(runs[0]?.historyCompleteness, "full");

    const experiments = await getProjectedExperiments("sample");
    assert.equal(experiments.length, 1);
    assert.equal(experiments[0]?.result, "degraded_pass");
  } finally {
    delete process.env.AUTOCLAWDEV_PROJECTS_DIR;
    delete process.env.AUTOCLAWDEV_WORKSPACE;
    rmSync(root, { recursive: true, force: true });
  }
});

test("legacy history import marks recovery-required runs when merge failed", async () => {
  const root = mkdtempSync(join(tmpdir(), "autoclaw-history-"));
  const projectsDir = join(root, "projects");
  const workspaceDir = join(root, "workspace");
  const projectDir = join(root, "sample-project");

  mkdirSync(projectsDir, { recursive: true });
  mkdirSync(workspaceDir, { recursive: true });
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
      workflow_type: "standard",
      team_profile: "reliability",
      speed_profile: "balanced",
      default_cycles: 1,
      max_parallel_cycles: 1,
      dev_url: "http://localhost:3000",
    }),
  );

  writeFileSync(
    join(workspaceDir, "experiments-sample.jsonl"),
    `${JSON.stringify({
      id: "exp-002",
      timestamp: "2026-03-25T12:00:00.000Z",
      directive: "run",
      description: "Legacy merge failure",
      result: "fail",
    })}\n`,
  );

  writeFileSync(
    join(workspaceDir, "run-sample.log"),
    [
      " 🔬 CYCLE 1 / 1 - exp-002",
      "Commit: Merge failed",
      "Preserved branch: autoclawdev/sample/exp-002",
      "Preserved worktree: /tmp/sample-worktree",
    ].join("\n"),
  );

  process.env.AUTOCLAWDEV_PROJECTS_DIR = projectsDir;
  process.env.AUTOCLAWDEV_WORKSPACE = workspaceDir;

  try {
    const { importLegacyHistory, listProjectHistory } = await import("../src/lib/history.ts");
    await importLegacyHistory();

    const runs = await listProjectHistory("sample", 10);
    assert.equal(runs[0]?.outcome, "recovery_required");
    assert.equal(runs[0]?.recovery?.required, true);
    assert.equal(runs[0]?.recovery?.branch, "autoclawdev/sample/exp-002");
  } finally {
    delete process.env.AUTOCLAWDEV_PROJECTS_DIR;
    delete process.env.AUTOCLAWDEV_WORKSPACE;
    rmSync(root, { recursive: true, force: true });
  }
});

test("history sync imports native build and review artifacts into typed run records", async () => {
  const root = mkdtempSync(join(tmpdir(), "autoclaw-derived-history-"));
  const projectsDir = join(root, "projects");
  const projectDir = join(root, "sample-project");
  const reviewDir = join(projectDir, ".autoclaw", "reviews");
  const buildDir = join(projectDir, ".autoclaw", "builds", "sample-plan");

  mkdirSync(projectsDir, { recursive: true });
  mkdirSync(reviewDir, { recursive: true });
  mkdirSync(buildDir, { recursive: true });

  writeFileSync(
    join(projectsDir, "sample.json"),
    JSON.stringify({
      name: "Sample",
      path: projectDir,
      description: "Sample project",
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
  writeFileSync(join(reviewDir, "sample-review-codex-20260326-112524.log"), "review console\n");
  writeFileSync(join(reviewDir, "progress.md"), "# Review Progress\n\nAll review phases complete\n");
  writeFileSync(join(reviewDir, "audit-report.md"), "# Audit\n");
  writeFileSync(join(reviewDir, "execution-plan.md"), "# Plan\n");

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
  writeFileSync(join(buildDir, "build-phase1-attempt1-20260326-165530.typescript"), "build console\n");
  writeFileSync(join(buildDir, "progress.md"), "# Build Progress\n\nPhase 1 complete\n");
  writeFileSync(join(buildDir, "plan.md"), "# Sample Plan\n");

  process.env.AUTOCLAWDEV_PROJECTS_DIR = projectsDir;

  try {
    const { listProjectHistory } = await import("../src/lib/history.ts");

    const runs = await listProjectHistory("sample", 10);
    const reviewRun = runs.find((run) => run.mode === "review");
    const buildRun = runs.find((run) => run.mode === "build");

    assert.ok(reviewRun);
    assert.ok(buildRun);
    assert.equal(reviewRun?.outcome, "clean_pass");
    assert.equal(buildRun?.outcome, "clean_pass");
    assert.equal(reviewRun?.historyCompleteness, "full");
    assert.equal(buildRun?.historyCompleteness, "full");
    assert.equal(readFileSync(join(reviewRun!.artifactRoot, "console.log"), "utf-8").includes("review console"), true);
    assert.equal(readFileSync(join(buildRun!.artifactRoot, "console.log"), "utf-8").includes("build console"), true);
  } finally {
    delete process.env.AUTOCLAWDEV_PROJECTS_DIR;
    rmSync(root, { recursive: true, force: true });
  }
});
