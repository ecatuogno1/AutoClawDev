import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RunRecord } from "@autoclawdev/types";

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function writeFakeRunner(scriptPath: string) {
  const script = `#!/bin/bash
set -euo pipefail

request_json() {
  python3 - "$@" <<'PY'
import json
import sys

payload = {
    "id": sys.argv[1],
    "action": sys.argv[2],
    "project": sys.argv[3],
}
for raw in sys.argv[4:]:
    key, value = raw.split("=", 1)
    lowered = value.lower()
    if lowered == "true":
        payload[key] = True
    elif lowered == "false":
        payload[key] = False
    else:
        payload[key] = value
print(json.dumps(payload, separators=(",", ":")))
PY
}

read_response_field() {
  RESPONSE_JSON="$1" FIELD_NAME="$2" python3 - <<'PY'
import json
import os

payload = json.loads(os.environ["RESPONSE_JSON"])
field = os.environ["FIELD_NAME"]
value = payload.get(field, "")
if isinstance(value, bool):
    print("1" if value else "0")
else:
    print(value)
PY
}

write_request() {
  local request_id=$1
  shift
  request_json "$request_id" "$@" > "$AUTOCLAWDEV_FINALIZATION_DIR/request-$request_id.json"
}

wait_for_response() {
  local request_id=$1
  local response_path="$AUTOCLAWDEV_FINALIZATION_DIR/response-$request_id.json"
  for _ in $(seq 1 400); do
    if [ -f "$response_path" ]; then
      cat "$response_path"
      rm -f "$response_path"
      return 0
    fi
    sleep 0.05
  done
  return 1
}

echo "🚀 Commit [git] finalizing..."
merge_id="merge-test"
write_request "$merge_id" merge "$AUTOCLAWDEV_PROJECT" \
  "mergeMessage=$AUTOCLAWDEV_MERGE_MESSAGE" \
  "currentBranch=$AUTOCLAWDEV_CURRENT_BRANCH" \
  "currentWorktree=$AUTOCLAWDEV_CURRENT_WORKTREE" \
  "sourceRepo=$AUTOCLAWDEV_SOURCE_REPO" \
  "landingRepo=$AUTOCLAWDEV_LANDING_REPO" \
  "integrationBranch=$AUTOCLAWDEV_INTEGRATION_BRANCH" \
  "validationSummary=$AUTOCLAWDEV_TEST_VALIDATION_SUMMARY" \
  "validationProfile=reliability"
merge_response=$(wait_for_response "$merge_id")
merge_ok=$(read_response_field "$merge_response" ok)
merge_detail=$(read_response_field "$merge_response" detail)
merge_hash=$(read_response_field "$merge_response" commitHash)
preserved_branch=$(read_response_field "$merge_response" preservedBranch)
preserved_worktree=$(read_response_field "$merge_response" preservedWorktree)

if [ "$merge_ok" = "1" ]; then
  echo "✓ Done Commit: $merge_detail ($merge_hash)"
  cleanup_id="cleanup-test"
  write_request "$cleanup_id" cleanup "$AUTOCLAWDEV_PROJECT" \
    "currentBranch=$AUTOCLAWDEV_CURRENT_BRANCH" \
    "currentWorktree=$AUTOCLAWDEV_CURRENT_WORKTREE" \
    "sourceRepo=$AUTOCLAWDEV_SOURCE_REPO" \
    "landingRepo=$AUTOCLAWDEV_LANDING_REPO" \
    "preserve=false" \
    "detail=Cycle workspace cleaned up after merge"
  cleanup_response=$(wait_for_response "$cleanup_id")
  cleanup_ok=$(read_response_field "$cleanup_response" ok)
  cleanup_detail=$(read_response_field "$cleanup_response" detail)
  if [ "$cleanup_ok" = "1" ]; then
    exit 0
  fi
  echo "↩️ Revert [git] rolling back..."
  echo "✗ Fail Revert: $cleanup_detail"
  exit 1
fi

echo "✗ Fail Commit: $merge_detail"
[ -n "$preserved_branch" ] && echo "Preserved branch: $preserved_branch"
[ -n "$preserved_worktree" ] && echo "Preserved worktree: $preserved_worktree"
exit 1
`;
  writeFileSync(scriptPath, script, "utf-8");
  chmodSync(scriptPath, 0o755);
}

function buildRunRecord(runId: string, projectKey: string, projectPath: string): RunRecord {
  const now = new Date().toISOString();
  return {
    id: runId,
    projectKey,
    mode: "run",
    status: "queued",
    source: "native",
    cycles: 1,
    workflowType: "standard",
    teamProfile: "reliability",
    createdAt: now,
    updatedAt: now,
    artifactRoot: join(projectPath, ".autoclaw", "runs", runId),
    manifestSource: "test",
    historyCompleteness: "full",
    phases: [
      {
        id: `${runId}-preflight`,
        runId,
        name: "preflight",
        status: "completed",
        startedAt: now,
        completedAt: now,
      },
      {
        id: `${runId}-workflow`,
        runId,
        name: "workflow",
        status: "queued",
      },
      {
        id: `${runId}-commit`,
        runId,
        name: "commit",
        status: "queued",
      },
    ],
  };
}

function setupFixture(options: { conflict: boolean }) {
  const root = mkdtempSync(join(tmpdir(), "autoclaw-native-finalization-"));
  const projectsDir = join(root, "projects");
  const projectDir = join(root, "sample-project");
  const worktreeDir = join(root, "feature-worktree");
  const runnerPath = join(root, "fake-runner.sh");

  mkdirSync(projectsDir, { recursive: true });
  mkdirSync(join(projectDir, ".autoclaw"), { recursive: true });
  writeFakeRunner(runnerPath);

  git(["init", "-b", "main"], projectDir);
  git(["config", "user.name", "AutoClawDev Test"], projectDir);
  git(["config", "user.email", "autoclawdev@example.com"], projectDir);

  writeFileSync(join(projectDir, "app.txt"), "base\n", "utf-8");
  git(["add", "app.txt"], projectDir);
  git(["commit", "-m", "initial"], projectDir);

  git(["worktree", "add", "-b", "feature", worktreeDir, "main"], projectDir);
  writeFileSync(join(worktreeDir, "app.txt"), options.conflict ? "feature change\n" : "base\nfeature change\n", "utf-8");
  git(["add", "app.txt"], worktreeDir);
  git(["commit", "-m", "feature"], worktreeDir);

  if (options.conflict) {
    writeFileSync(join(projectDir, "app.txt"), "main change\n", "utf-8");
    git(["add", "app.txt"], projectDir);
    git(["commit", "-m", "main change"], projectDir);
  }

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
      allowed_override_reasons: [
        "baseline_match",
        "environment_issue",
        "broad_repo_failure",
        "preexisting_unrelated_failure",
      ],
    }),
  );

  process.env.AUTOCLAWDEV_PROJECTS_DIR = projectsDir;

  return {
    projectDir,
    runnerPath,
    worktreeDir,
    cleanup() {
      delete process.env.AUTOCLAWDEV_PROJECTS_DIR;
      rmSync(root, { recursive: true, force: true });
    },
  };
}

async function waitForRunDone(projectPath: string, runId: string): Promise<void> {
  const { readRunRecord } = await import("../src/lib/runRecords.ts");
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const record = readRunRecord(projectPath, runId);
    if (record && record.status !== "queued" && record.status !== "running") {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for run ${runId}`);
}

test("managed run performs native merge and cleanup through the control plane", async () => {
  const fixture = setupFixture({ conflict: false });
  const { startRun } = await import("../src/lib/process.ts");
  const { writeRunRecord, readRunRecord, readRunEvents } = await import("../src/lib/runRecords.ts");

  const runId = "sample-native-success";
  writeRunRecord(fixture.projectDir, buildRunRecord(runId, "sample", fixture.projectDir));

  const started = await startRun({
    project: "sample",
    cycles: 1,
    mode: "run",
    runId,
    command: "bash",
    args: [fixture.runnerPath],
    cwd: fixture.projectDir,
    projectPath: fixture.projectDir,
    mainPhase: "workflow",
    commitPhase: "commit",
    nativeFinalization: true,
    env: {
      AUTOCLAWDEV_SOURCE_REPO: fixture.projectDir,
      AUTOCLAWDEV_LANDING_REPO: fixture.projectDir,
      AUTOCLAWDEV_CURRENT_BRANCH: "feature",
      AUTOCLAWDEV_CURRENT_WORKTREE: fixture.worktreeDir,
      AUTOCLAWDEV_INTEGRATION_BRANCH: "main",
      AUTOCLAWDEV_MERGE_MESSAGE: "merge(test): feature",
      AUTOCLAWDEV_TEST_VALIDATION_SUMMARY: '{"test":{"exit":0}}',
    },
  });

  assert.equal(started, true);
  await waitForRunDone(fixture.projectDir, runId);

  const record = readRunRecord(fixture.projectDir, runId);
  assert.ok(record);
  assert.equal(record.status, "completed");
  assert.equal(record.outcome, "clean_pass");
  assert.equal(record.recovery?.required, undefined);
  assert.match(readFileSync(join(fixture.projectDir, "app.txt"), "utf-8"), /feature change/);
  assert.equal(existsSync(fixture.worktreeDir), false);

  assert.throws(() => git(["show-ref", "--verify", "--quiet", "refs/heads/feature"], fixture.projectDir));

  const events = readRunEvents(fixture.projectDir, runId);
  assert.ok(events.some((event) => event.type === "committed"));

  fixture.cleanup();
});

test("managed run preserves recovery details when native merge fails", async () => {
  const fixture = setupFixture({ conflict: true });
  const { startRun } = await import("../src/lib/process.ts");
  const { writeRunRecord, readRunRecord } = await import("../src/lib/runRecords.ts");

  const runId = "sample-native-merge-failure";
  writeRunRecord(fixture.projectDir, buildRunRecord(runId, "sample", fixture.projectDir));

  const started = await startRun({
    project: "sample",
    cycles: 1,
    mode: "run",
    runId,
    command: "bash",
    args: [fixture.runnerPath],
    cwd: fixture.projectDir,
    projectPath: fixture.projectDir,
    mainPhase: "workflow",
    commitPhase: "commit",
    nativeFinalization: true,
    env: {
      AUTOCLAWDEV_SOURCE_REPO: fixture.projectDir,
      AUTOCLAWDEV_LANDING_REPO: fixture.projectDir,
      AUTOCLAWDEV_CURRENT_BRANCH: "feature",
      AUTOCLAWDEV_CURRENT_WORKTREE: fixture.worktreeDir,
      AUTOCLAWDEV_INTEGRATION_BRANCH: "main",
      AUTOCLAWDEV_MERGE_MESSAGE: "merge(test): feature",
      AUTOCLAWDEV_TEST_VALIDATION_SUMMARY: '{"test":{"exit":1}}',
    },
  });

  assert.equal(started, true);
  await waitForRunDone(fixture.projectDir, runId);

  const record = readRunRecord(fixture.projectDir, runId);
  assert.ok(record);
  assert.equal(record.status, "failed");
  assert.equal(record.outcome, "recovery_required");
  assert.equal(record.recovery?.required, true);
  assert.equal(record.recovery?.branch, "feature");
  assert.equal(record.recovery?.worktree, fixture.worktreeDir);
  assert.equal(existsSync(fixture.worktreeDir), true);

  fixture.cleanup();
});
