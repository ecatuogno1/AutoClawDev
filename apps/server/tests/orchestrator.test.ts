import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function setupProjectFixture() {
  const root = mkdtempSync(join(tmpdir(), "autoclaw-orchestrator-"));
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
      workflow_type: "standard",
      team_profile: "reliability",
      speed_profile: "balanced",
      default_cycles: 2,
      max_parallel_cycles: 1,
      dev_url: "http://localhost:3000",
    }),
  );

  process.env.AUTOCLAWDEV_PROJECTS_DIR = projectsDir;

  return {
    cleanup() {
      delete process.env.AUTOCLAWDEV_PROJECTS_DIR;
      rmSync(root, { recursive: true, force: true });
    },
  };
}

test("resolveRunRequest uses typed control-plane phases for run mode", async () => {
  const fixture = setupProjectFixture();
  const { resolveRunRequest, buildExecutionSpec } = await import("../src/lib/orchestrator.ts");

  const resolved = await resolveRunRequest({
    projectKey: "sample",
    mode: "run",
    cycles: 2,
  });

  assert.deepEqual(resolved.plan.phases, ["preflight", "workflow", "validation", "commit"]);

  const execution = buildExecutionSpec({
    projectKey: "sample",
    mode: "run",
    cycles: 2,
  });

  assert.equal(execution.mainPhase, "workflow");
  assert.equal(execution.validationPhase, "validation");
  assert.equal(execution.commitPhase, "commit");
  assert.equal(execution.nativeFinalization, true);
  assert.equal(execution.command, "bash");
  assert.match(execution.args[0] ?? "", /scripts\/runner\.sh$/);

  fixture.cleanup();
});

test("build and review execution specs use managed phases", async () => {
  const fixture = setupProjectFixture();
  const { resolveRunRequest, buildExecutionSpec } = await import("../src/lib/orchestrator.ts");

  const review = await resolveRunRequest({
    projectKey: "sample",
    mode: "review",
    cycles: 1,
  });
  const build = await resolveRunRequest({
    projectKey: "sample",
    mode: "build",
    cycles: 1,
  });

  assert.deepEqual(review.plan.phases, ["preflight", "audit", "fix", "validate", "report"]);
  assert.deepEqual(build.plan.phases, ["preflight", "build", "report"]);

  const reviewExecution = buildExecutionSpec({
    projectKey: "sample",
    mode: "review",
    cycles: 1,
  });
  const buildExecution = buildExecutionSpec({
    projectKey: "sample",
    mode: "build",
    cycles: 1,
  });

  assert.equal(reviewExecution.mainPhase, "audit");
  assert.equal(reviewExecution.validationPhase, "validate");
  assert.equal(reviewExecution.reportPhase, "report");
  assert.equal(buildExecution.mainPhase, "build");
  assert.equal(buildExecution.reportPhase, "report");
  assert.ok(
    reviewExecution.command === process.execPath || reviewExecution.command === "pnpm",
  );
  assert.match(reviewExecution.args.join(" "), /reviewWorker\.(js|ts)\s+sample|reviewWorker\.(js|ts)/);
  assert.equal(buildExecution.command, "bash");

  fixture.cleanup();
});

test("audit execution spec uses the unified control plane and structured worker", async () => {
  const fixture = setupProjectFixture();
  const { resolveRunRequest, buildExecutionSpec } = await import("../src/lib/orchestrator.ts");

  const resolved = await resolveRunRequest({
    projectKey: "sample",
    mode: "audit",
    cycles: 1,
    target: "http://localhost:3000",
  });

  assert.deepEqual(resolved.plan.phases, ["preflight", "audit", "report"]);
  assert.equal(resolved.plan.workflowType, "audit");
  assert.equal(resolved.record.artifacts?.root, resolved.record.artifactRoot);

  const execution = buildExecutionSpec({
    projectKey: "sample",
    mode: "audit",
    cycles: 1,
    target: "http://localhost:3000",
    artifactRoot: resolved.record.artifactRoot,
    auditMode: "deep",
    ownedTarget: true,
    authorizationNote: "Local fixture",
  });

  assert.equal(execution.command, "python3");
  assert.equal(execution.mainPhase, "audit");
  assert.equal(execution.reportPhase, "report");
  assert.match(execution.args[0] ?? "", /scripts\/web_audit_v2\.py$/);
  assert.deepEqual(execution.args.slice(1, 7), [
    "run",
    "http://localhost:3000",
    "--output",
    resolved.record.artifactRoot,
    "--mode",
    "deep",
  ]);
  assert.equal(execution.args.includes("--owned-target"), true);

  fixture.cleanup();
});
