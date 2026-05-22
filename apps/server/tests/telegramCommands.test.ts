import test from "node:test";
import assert from "node:assert/strict";
import type { RunRecord } from "@autoclawdev/types";
import {
  handleTelegramCallback,
  handleTelegramCommand,
  type TelegramCommandDependencies,
} from "../src/integrations/telegram/commands.ts";

function buildDeps(
  overrides: Partial<TelegramCommandDependencies> = {},
): TelegramCommandDependencies {
  return {
    listProjectsDetailed: async () => [],
    listAllRunRecords: async () => [],
    getRunRecordById: async () => undefined,
    readWebAuditRunDetailFromRoot: () => undefined,
    startManagedRun: async () => ({
      ok: true,
      plan: {
        projectKey: "sample",
        mode: "run",
        cycles: 1,
        workflowType: "standard",
        teamProfile: "reliability",
        phases: [],
        validationProfiles: [],
        artifactRoot: "/tmp/sample",
      },
      preflight: {
        projectKey: "sample",
        mode: "run",
        checkedAt: new Date().toISOString(),
        ok: true,
        blockingCount: 0,
        warningCount: 0,
        checks: [],
        capabilities: {} as never,
      },
      record: {
        id: "run-1",
        projectKey: "sample",
        mode: "run",
        status: "queued",
        source: "native",
        cycles: 1,
        workflowType: "standard",
        teamProfile: "reliability",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        artifactRoot: "/tmp/sample",
        manifestSource: "/tmp/sample.json",
        historyCompleteness: "full",
        phases: [],
      },
    }),
    approveManagedRunGate: async () => undefined,
    resumeManagedRun: async () => ({ ok: true }),
    stopManagedRun: async () => false,
    getActiveRuns: () => [],
    listPendingApprovals: () => [],
    getPendingApproval: () => undefined,
    applyPendingApproval: async () => ({ ok: true }),
    deletePendingApproval: () => undefined,
    runAutoclawPassthrough: async () => ({ text: "passthrough" }),
    ...overrides,
  };
}

test("telegram help command exposes managed execution controls", async () => {
  const result = await handleTelegramCommand("/help", buildDeps());
  assert.match(result.text, /\/run <project>/);
  assert.match(result.text, /\/audit <project>/);
  assert.match(result.text, /\/approve <runId> <gate>/);
});

test("telegram run command starts a managed run", async () => {
  let captured: { projectKey: string; cycles?: number; mode?: string } | undefined;
  const result = await handleTelegramCommand(
    "/run sample 3",
    buildDeps({
      startManagedRun: async (options) => {
        captured = options;
        return {
          ok: true,
          plan: {
            projectKey: "sample",
            mode: "run",
            cycles: 3,
            workflowType: "standard",
            teamProfile: "reliability",
            phases: [],
            validationProfiles: [],
            artifactRoot: "/tmp/sample",
          },
          preflight: {
            projectKey: "sample",
            mode: "run",
            checkedAt: new Date().toISOString(),
            ok: true,
            blockingCount: 0,
            warningCount: 0,
            checks: [],
            capabilities: {} as never,
          },
          record: {
            id: "run-99",
            projectKey: "sample",
            mode: "run",
            status: "running",
            source: "native",
            cycles: 3,
            workflowType: "standard",
            teamProfile: "reliability",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            artifactRoot: "/tmp/sample",
            manifestSource: "/tmp/sample.json",
            historyCompleteness: "full",
            phases: [],
          },
        };
      },
    }),
  );

  assert.deepEqual(captured, {
    projectKey: "sample",
    mode: "run",
    cycles: 3,
  });
  assert.match(result.text, /Started run for sample/);
  assert.match(result.text, /runId=run-99/);
  assert.equal(result.watchRunId, "run-99");
  assert.equal(result.buttons?.[0]?.some((button) => button.callbackData === "status:run-99"), true);
});

test("telegram status without target reports active runs", async () => {
  const result = await handleTelegramCommand(
    "/status",
    buildDeps({
      getActiveRuns: () => [
        {
          project: "sample",
          mode: "audit",
          cycles: 1,
          startedAt: "2026-04-01T00:00:00.000Z",
        } as never,
      ],
    }),
  );

  assert.match(result.text, /sample \| cycles=1/);
});

test("telegram approve-chat command applies and clears pending chat approvals", async () => {
  let deleted = "";
  const result = await handleTelegramCommand(
    "/approve-chat req-1",
    buildDeps({
      getPendingApproval: () => ({
        requestId: "req-1",
        createdAt: "2026-04-01T00:00:00.000Z",
        cwd: "/tmp/project",
        provider: "codex",
        requestKind: "command",
        toolName: "Bash",
        input: { command: "echo hi" },
      }),
      applyPendingApproval: async () => ({ exitCode: 0, output: "hi" }),
      deletePendingApproval: (requestId) => {
        deleted = requestId;
      },
    }),
  );

  assert.equal(deleted, "req-1");
  assert.match(result.text, /Approved chat request req-1/);
  assert.match(result.text, /"output": "hi"/);
});

test("telegram status by run id shows run phases", async () => {
  const runRecord: RunRecord = {
    id: "run-1",
    projectKey: "sample",
    mode: "audit",
    status: "running",
    source: "native",
    cycles: 1,
    workflowType: "audit",
    teamProfile: "security",
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    artifactRoot: "/tmp/run-1",
    manifestSource: "/tmp/sample.json",
    historyCompleteness: "full",
    phases: [
      {
        id: "phase-1",
        runId: "run-1",
        name: "audit",
        status: "running",
      },
    ],
  };

  const result = await handleTelegramCommand(
    "/status run-1",
    buildDeps({
      getRunRecordById: async () => ({
        manifestPath: "/tmp/sample",
        record: runRecord,
      }),
    }),
  );

  assert.match(result.text, /run-1 \| sample \| audit \| running/);
  assert.match(result.text, /- audit: running/);
});

test("telegram status by project shows project action buttons", async () => {
  const result = await handleTelegramCommand(
    "/status sample",
    buildDeps({
      listProjectsDetailed: async () => [
        {
          key: "sample",
          name: "Sample",
          path: "/tmp/sample",
          description: "fixture",
          package_manager: "pnpm",
          test_cmd: "pnpm test",
          lint_cmd: "pnpm lint",
          workflow_type: "standard",
          team_profile: "reliability",
          speed_profile: "balanced",
          default_cycles: 1,
          max_parallel_cycles: 1,
        } as never,
      ],
    }),
  );

  assert.match(result.text, /No run or project found for sample|sample/);
  assert.equal(result.buttons?.flat().some((button) => button.callbackData === "start-review:sample"), true);
  assert.equal(result.buttons?.flat().some((button) => button.callbackData === "start-audit:sample"), true);
});

test("telegram status exposes approval buttons for audit runs with pending gates", async () => {
  const runRecord: RunRecord = {
    id: "run-2",
    projectKey: "sample",
    mode: "audit",
    status: "awaiting_approval",
    source: "native",
    cycles: 1,
    workflowType: "audit",
    teamProfile: "security",
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    artifactRoot: "/tmp/run-2",
    manifestSource: "/tmp/sample.json",
    historyCompleteness: "full",
    phases: [],
  };

  const result = await handleTelegramCommand(
    "/status run-2",
    buildDeps({
      getRunRecordById: async () => ({
        manifestPath: "/tmp/sample",
        record: runRecord,
      }),
      readWebAuditRunDetailFromRoot: () => ({
        runId: "run-2",
        target: "http://localhost:3000",
        startedAt: "2026-04-01T00:00:00.000Z",
        status: "awaiting_approval",
        mode: "deep",
        authContexts: [],
        findings: [],
        evidence: [],
        hypotheses: [],
        approvalsPending: ["deep-authz-suite"],
        approvedGates: [],
        moduleTimeline: [],
        exports: [],
        operatorCommands: [],
        policy: {
          ownedTarget: true,
          allowedModules: [],
          scopeAllowlist: [],
          maxConcurrency: 2,
          maxRequestsPerMinute: 30,
          allowBrowser: true,
          allowApi: true,
          allowDestructiveActions: false,
          escalationApprovals: {},
        },
      }),
    }),
  );

  assert.match(result.text, /Pending gates: deep-authz-suite/);
  assert.equal(
    result.buttons?.flat().some((button) => button.callbackData === "approve-gate:run-2:deep-authz-suite"),
    true,
  );
  assert.equal(
    result.buttons?.flat().some((button) => button.callbackData === "resume-run:run-2"),
    true,
  );
});

test("telegram status exposes resume button for stalled review runs", async () => {
  const runRecord: RunRecord = {
    id: "review-2",
    projectKey: "sample",
    mode: "review",
    status: "failed",
    source: "native",
    cycles: 1,
    workflowType: "deep-review",
    teamProfile: "reliability",
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    artifactRoot: "/tmp/review-2",
    manifestSource: "/tmp/sample.json",
    historyCompleteness: "full",
    phases: [],
  };

  const result = await handleTelegramCommand(
    "/status review-2",
    buildDeps({
      getRunRecordById: async () => ({
        manifestPath: "/tmp/sample",
        record: runRecord,
      }),
    }),
  );

  assert.equal(
    result.buttons?.flat().some((button) => button.callbackData === "resume-run:review-2"),
    true,
  );
});

test("telegram callback approve-gate delegates to approve command flow", async () => {
  let approved: { runId: string; gate: string; approver?: string } | undefined;
  const result = await handleTelegramCallback(
    "approve-gate:run-7:deep-injection-suite",
    buildDeps({
      approveManagedRunGate: async ({ runId, gate, approver }) => {
        approved = { runId, gate, approver };
        return {
          id: runId,
          projectKey: "sample",
          mode: "audit",
          status: "running",
          source: "native",
          cycles: 1,
          workflowType: "audit",
          teamProfile: "security",
          createdAt: "2026-04-01T00:00:00.000Z",
          updatedAt: "2026-04-01T00:00:00.000Z",
          artifactRoot: "/tmp/run-7",
          manifestSource: "/tmp/sample.json",
          historyCompleteness: "full",
          phases: [],
        };
      },
    }),
  );

  assert.deepEqual(approved, {
    runId: "run-7",
    gate: "deep-injection-suite",
    approver: "telegram",
  });
  assert.match(result.text, /Approved deep-injection-suite for run-7/);
});

test("telegram callback start-review delegates to review command flow", async () => {
  let startedMode = "";
  const result = await handleTelegramCallback(
    "start-review:sample",
    buildDeps({
      startManagedRun: async (options) => {
        startedMode = String(options.mode);
        return {
          ok: true,
          plan: {
            projectKey: "sample",
            mode: "review",
            cycles: 1,
            workflowType: "deep-review",
            teamProfile: "reliability",
            phases: [],
            validationProfiles: [],
            artifactRoot: "/tmp/sample",
          },
          preflight: {
            projectKey: "sample",
            mode: "review",
            checkedAt: new Date().toISOString(),
            ok: true,
            blockingCount: 0,
            warningCount: 0,
            checks: [],
            capabilities: {} as never,
          },
          record: {
            id: "review-1",
            projectKey: "sample",
            mode: "review",
            status: "running",
            source: "native",
            cycles: 1,
            workflowType: "deep-review",
            teamProfile: "reliability",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            artifactRoot: "/tmp/sample",
            manifestSource: "/tmp/sample.json",
            historyCompleteness: "full",
            phases: [],
          },
        };
      },
    }),
  );

  assert.equal(startedMode, "review");
  assert.match(result.text, /Started review for sample/);
  assert.equal(result.watchRunId, "review-1");
});
