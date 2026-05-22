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
import projectsRouter from "../src/routes/projects.ts";
import { writeRunRecord } from "../src/lib/runRecords.ts";

test("projects executions summarizes latest runs by mode", async () => {
  const root = mkdtempSync(join(tmpdir(), "autoclaw-project-executions-"));
  const projectsDir = join(root, "projects");
  const projectDir = join(root, "sample-project");
  mkdirSync(projectsDir, { recursive: true });
  mkdirSync(join(projectDir, ".autoclaw", "runs"), { recursive: true });

  const runRecord: RunRecord = {
    id: "run-1",
    projectKey: "sample",
    mode: "run",
    status: "completed",
    source: "native",
    cycles: 1,
    workflowType: "standard",
    teamProfile: "reliability",
    createdAt: "2026-04-01T09:00:00.000Z",
    updatedAt: "2026-04-01T09:05:00.000Z",
    artifactRoot: join(projectDir, ".autoclaw", "runs", "run-1"),
    manifestSource: join(projectsDir, "sample.json"),
    historyCompleteness: "full",
    summary: "Run completed cleanly",
    phases: [],
  };
  mkdirSync(runRecord.artifactRoot, { recursive: true });
  writeRunRecord(projectDir, runRecord);

  const reviewRecord: RunRecord = {
    id: "review-1",
    projectKey: "sample",
    mode: "review",
    status: "awaiting_approval",
    source: "native",
    cycles: 1,
    workflowType: "deep-review",
    teamProfile: "reliability",
    createdAt: "2026-04-01T10:00:00.000Z",
    updatedAt: "2026-04-01T10:15:00.000Z",
    artifactRoot: join(projectDir, ".autoclaw", "runs", "review-1"),
    manifestSource: join(projectsDir, "sample.json"),
    historyCompleteness: "full",
    summary: "Review paused for approval",
    phases: [],
  };
  mkdirSync(reviewRecord.artifactRoot, { recursive: true });
  writeRunRecord(projectDir, reviewRecord);

  const auditRecord: RunRecord = {
    id: "audit-1",
    projectKey: "sample",
    mode: "audit",
    status: "awaiting_approval",
    source: "native",
    cycles: 1,
    workflowType: "audit",
    teamProfile: "reliability",
    createdAt: "2026-04-01T11:00:00.000Z",
    updatedAt: "2026-04-01T11:20:00.000Z",
    artifactRoot: join(projectDir, ".autoclaw", "runs", "audit-1"),
    manifestSource: join(projectsDir, "sample.json"),
    historyCompleteness: "full",
    summary: "Audit awaiting deep gate approval",
    phases: [],
  };
  mkdirSync(auditRecord.artifactRoot, { recursive: true });
  writeRunRecord(projectDir, auditRecord);
  writeFileSync(
    join(auditRecord.artifactRoot, "run.json"),
    `${JSON.stringify({
      id: "audit-1",
      projectKey: "sample",
      target: {
        url: "http://localhost:3000",
        hostname: "localhost",
      },
      policy: {
        version: 1,
        targetScope: ["localhost"],
        allowedModuleClasses: ["recon", "browser", "api"],
        browserEnabled: true,
        apiEnabled: true,
        ownedTarget: true,
        maxConcurrency: 2,
        requestBudget: 50,
        rateLimitPerSecond: 2,
        allowDestructiveActions: false,
        operatorCommandBudget: 0,
        operatorAllowedCommands: [],
        approvalRequiredFor: ["deep-authz-suite"],
        escalationApprovals: {},
      },
      status: "awaiting_approval",
      mode: "triage",
      createdAt: "2026-04-01T11:00:00.000Z",
      updatedAt: "2026-04-01T11:20:00.000Z",
      artifactRoot: auditRecord.artifactRoot,
      currentPhase: "analysis",
      summary: "Audit awaiting deep gate approval",
      findingsCount: 1,
      evidenceCount: 2,
      approvalsPending: ["deep-authz-suite"],
      approvedGates: [],
      authContexts: [],
      risk: {
        score: 42,
        level: "medium",
        findingCounts: {
          critical: 0,
          high: 0,
          medium: 1,
          low: 0,
          info: 0,
        },
      },
      exports: {},
      modules: [],
    }, null, 2)}\n`,
  );

  writeFileSync(
    join(projectsDir, "sample.json"),
    JSON.stringify({
      name: "Sample",
      path: projectDir,
      description: "Fixture",
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
  process.env.AUTOCLAWDEV_PROJECTS_DIR = projectsDir;

  const app = express();
  app.use("/api/projects", projectsRouter);
  const server = await new Promise<import("node:http").Server>((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/projects/sample/executions`);
    assert.equal(response.ok, true);
    const payload = (await response.json()) as {
      activeRecord?: { runId?: string; status?: string } | null;
      latestOverall?: { runId?: string } | null;
      latestByMode: {
        run: { runId?: string; status?: string };
        review: { runId?: string; canResume: boolean };
        build: { runId?: string };
        audit: { runId?: string; approvalsPending: string[]; canResume: boolean };
      };
    };

    assert.equal(payload.activeRecord?.runId, "audit-1");
    assert.equal(payload.latestOverall?.runId, "audit-1");
    assert.equal(payload.latestByMode.run.runId, "run-1");
    assert.equal(payload.latestByMode.run.status, "completed");
    assert.equal(payload.latestByMode.review.runId, "review-1");
    assert.equal(payload.latestByMode.review.canResume, true);
    assert.equal(payload.latestByMode.build.runId, undefined);
    assert.equal(payload.latestByMode.audit.runId, "audit-1");
    assert.deepEqual(payload.latestByMode.audit.approvalsPending, ["deep-authz-suite"]);
    assert.equal(payload.latestByMode.audit.canResume, true);
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
