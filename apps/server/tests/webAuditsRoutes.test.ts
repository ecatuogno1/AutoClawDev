import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import type { WebAuditRunSummary } from "@autoclawdev/types";
import webAuditsRouter from "../src/routes/webAudits.ts";
import {
  appendWebAuditEvent,
  writeWebAuditEvidence,
  writeWebAuditFindings,
  writeWebAuditHypotheses,
  writeWebAuditOperatorCommands,
  writeWebAuditRunRecord,
} from "../src/lib/webAudit.ts";

test("web audit routes expose structured run details and events", async () => {
  const root = mkdtempSync(join(tmpdir(), "autoclaw-web-audits-"));
  const projectsDir = join(root, "projects");
  const projectDir = join(root, "sample-project");
  mkdirSync(projectsDir, { recursive: true });
  mkdirSync(join(projectDir, ".autoclaw"), { recursive: true });

  const createdAt = "2026-04-01T12:00:00.000Z";
  const run: WebAuditRunSummary = {
    id: "wa-sample-1",
    projectKey: "sample",
    target: {
      url: "http://localhost:3000",
      hostname: "localhost",
      label: "sample",
      projectKey: "sample",
    },
    policy: {
      version: 1,
      targetScope: ["http://localhost:3000"],
      allowedModuleClasses: ["recon", "browser", "api", "auth", "analysis", "advanced", "operator", "reporting"],
      browserEnabled: true,
      apiEnabled: true,
      ownedTarget: true,
      authorizationNote: "Local fixture target",
      maxConcurrency: 8,
      requestBudget: 150,
      rateLimitPerSecond: 6,
      allowDestructiveActions: false,
      operatorCommandBudget: 3,
      operatorAllowedCommands: ["curl"],
      approvalRequiredFor: ["deep-injection-suite", "deep-authz-suite", "deep-ssrf-suite", "operator-shell"],
      escalationApprovals: {},
    },
    status: "awaiting_approval",
    mode: "triage",
    createdAt,
    updatedAt: createdAt,
    artifactRoot: join(projectDir, ".autoclaw", "web-audits", "wa-sample-1"),
    currentPhase: "api-surface",
    summary: "2 findings from 4 evidence events.",
    findingsCount: 2,
    evidenceCount: 4,
    approvalsPending: ["deep-injection-suite"],
    approvedGates: ["operator-shell"],
    authContexts: [
      {
        id: "session-1",
        kind: "browser_agent",
        label: "Admin browser session",
        reused: true,
        privilegeLevel: "privileged",
        browserStatePath: join(projectDir, ".autoclaw", "web-audits", "wa-sample-1", "auth", "storage-state.json"),
        httpHeaders: {
          Authorization: "Bearer fixture",
        },
        cookies: ["sid=fixture"],
        observedRoutes: ["/api/users", "/graphql"],
        createdAt,
      },
    ],
    risk: {
      score: 64,
      level: "high",
      findingCounts: {
        critical: 1,
        high: 1,
        medium: 0,
        low: 0,
        info: 0,
      },
    },
    exports: {
      json: join(projectDir, ".autoclaw", "web-audits", "wa-sample-1", "export.json"),
    },
    modules: [],
    latestHypothesis: {
      id: "hyp-1",
      createdAt,
      provider: "heuristic",
      model: "local-rules",
      hypothesis: "Client and API evidence cluster on exposed unauthenticated routes.",
      correlationGroup: "api-surface",
      confidence: 0.61,
      rationale: "Recent evidence emphasizes unauthenticated JSON responses.",
      recommendedNextModule: "advanced-http-probing",
    },
  };

  writeWebAuditRunRecord(projectDir, run);
  writeWebAuditFindings(projectDir, run.id, [
    {
      id: "finding-1",
      runId: run.id,
      ruleId: "public-api-users",
      createdAt,
      updatedAt: createdAt,
      severity: "critical",
      confidence: 0.92,
      exploitability: 88,
      moduleId: "api-surface",
      title: "Unauthenticated API exposure",
      summary: "The users endpoint returned JSON anonymously.",
      remediation: "Require auth.",
      evidenceIds: ["evidence-1"],
      authContext: "anonymous",
      status: "open",
    },
  ]);
  writeWebAuditEvidence(projectDir, run.id, [
    {
      id: "evidence-1",
      runId: run.id,
      timestamp: createdAt,
      kind: "api.public_json",
      moduleId: "api-surface",
      title: "Public JSON API response",
      summary: "Users endpoint returned JSON anonymously.",
      data: { route: "/api/users" },
    },
  ]);
  writeWebAuditHypotheses(projectDir, run.id, [run.latestHypothesis!]);
  writeWebAuditOperatorCommands(projectDir, run.id, [
    {
      id: "operator-1",
      command: "curl https://example.test",
      moduleId: "operator-shell",
      startedAt: createdAt,
      completedAt: createdAt,
      exitCode: 0,
      status: "completed",
      stdoutExcerpt: "AUTOCLAW_EVIDENCE:{\"kind\":\"operator.command_result\"}",
    },
  ]);
  appendWebAuditEvent(projectDir, {
    id: "event-1",
    runId: run.id,
    projectKey: "sample",
    timestamp: createdAt,
    type: "finding.opened",
    message: "Unauthenticated API exposure",
    data: { severity: "critical" },
  });

  const manifest = {
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
  };
  await import("node:fs/promises").then(({ writeFile }) =>
    writeFile(join(projectsDir, "sample.json"), JSON.stringify(manifest)),
  );

  process.env.AUTOCLAWDEV_PROJECTS_DIR = projectsDir;

  const app = express();
  app.use(express.json());
  app.use("/api/web-audits", webAuditsRouter);

  const server = await new Promise<import("node:http").Server>((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    const latestResponse = await fetch(`http://127.0.0.1:${address.port}/api/web-audits/sample/runs/latest`);
    assert.equal(latestResponse.ok, true);
    const latest = (await latestResponse.json()) as {
      id: string;
      approvalsPending: string[];
      approvedGates: string[];
      authContexts: Array<{ kind: string }>;
      findings: Array<{ title: string }>;
      evidence: Array<{ kind: string }>;
      operatorCommands: Array<{ command: string }>;
    };
    assert.equal(latest.id, run.id);
    assert.deepEqual(latest.approvalsPending, ["deep-injection-suite"]);
    assert.deepEqual(latest.approvedGates, ["operator-shell"]);
    assert.equal(latest.authContexts[0]?.kind, "browser_agent");
    assert.equal(latest.findings[0]?.title, "Unauthenticated API exposure");
    assert.equal(latest.evidence[0]?.kind, "api.public_json");
    assert.equal(latest.operatorCommands[0]?.command, "curl https://example.test");

    const eventsResponse = await fetch(`http://127.0.0.1:${address.port}/api/web-audits/sample/runs/${run.id}/events`);
    assert.equal(eventsResponse.ok, true);
    const eventsPayload = (await eventsResponse.json()) as { events: Array<{ type: string }> };
    assert.equal(eventsPayload.events[0]?.type, "finding.opened");

    const approveResponse = await fetch(`http://127.0.0.1:${address.port}/api/web-audits/sample/runs/${run.id}/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gate: "deep-injection-suite" }),
    });
    assert.equal(approveResponse.ok, true);
    const approvePayload = (await approveResponse.json()) as {
      run: { approvedGates: string[]; approvalsPending: string[] };
    };
    assert.deepEqual(approvePayload.run.approvalsPending, []);
    assert.deepEqual(approvePayload.run.approvedGates.sort(), ["deep-injection-suite", "operator-shell"]);
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
