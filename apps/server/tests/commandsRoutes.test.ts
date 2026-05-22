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
import commandsRouter from "../src/routes/commands.ts";
import { writeRunRecord, appendRunEvent } from "../src/lib/runRecords.ts";

test("commands routes expose remote-safe command catalog and execution surfaces", async () => {
  const root = mkdtempSync(join(tmpdir(), "autoclaw-commands-route-"));
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
      allowed_override_reasons: [
        "baseline_match",
        "environment_issue",
        "broad_repo_failure",
        "preexisting_unrelated_failure",
      ],
      dev_url: "http://localhost:3000",
    }),
  );

  process.env.AUTOCLAWDEV_PROJECTS_DIR = projectsDir;
  process.env.AUTOCLAWDEV_CODEX_AUTH_PATH = join(projectDir, "missing-auth.json");

  const now = "2026-04-01T12:00:00.000Z";
  writeRunRecord(projectDir, {
    id: "sample-run-1",
    projectKey: "sample",
    mode: "run",
    status: "completed",
    source: "native",
    cycles: 1,
    workflowType: "standard",
    teamProfile: "reliability",
    createdAt: now,
    updatedAt: now,
    artifactRoot: join(projectDir, ".autoclaw", "runs", "sample-run-1"),
    manifestSource: join(projectsDir, "sample.json"),
    historyCompleteness: "full",
    preflightOk: true,
    summary: "Managed run completed",
    phases: [
      {
        id: "sample-run-1-preflight",
        runId: "sample-run-1",
        name: "preflight",
        status: "completed",
      },
    ],
  });
  appendRunEvent(projectDir, {
    id: "sample-run-1-queued",
    runId: "sample-run-1",
    projectKey: "sample",
    type: "queued",
    timestamp: now,
    message: "Run queued",
  });

  const app = express();
  app.use(express.json());
  app.use("/api/commands", commandsRouter);

  const server = await new Promise<import("node:http").Server>((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    const catalogResponse = await fetch(`http://127.0.0.1:${address.port}/api/commands`);
    assert.equal(catalogResponse.ok, true);
    const catalogPayload = (await catalogResponse.json()) as {
      commands: Array<{ slash: string }>;
    };
    assert.equal(catalogPayload.commands.some((entry) => entry.slash === "/run"), true);
    assert.equal(catalogPayload.commands.some((entry) => entry.slash === "/audit"), true);
    assert.equal(catalogPayload.commands.some((entry) => entry.slash === "/approve"), true);

    const preflightResponse = await fetch(`http://127.0.0.1:${address.port}/api/commands/execute`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        command: "preflight",
        project: "sample",
        mode: "review",
      }),
    });
    assert.equal(preflightResponse.ok, true);
    const preflightPayload = (await preflightResponse.json()) as {
      ok: boolean;
      data: { preflight: { projectKey: string; mode: string } };
    };
    assert.equal(preflightPayload.ok, true);
    assert.equal(preflightPayload.data.preflight.projectKey, "sample");
    assert.equal(preflightPayload.data.preflight.mode, "review");

    const detailResponse = await fetch(`http://127.0.0.1:${address.port}/api/commands/execute`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        command: "run-detail",
        runId: "sample-run-1",
      }),
    });
    assert.equal(detailResponse.ok, true);
    const detailPayload = (await detailResponse.json()) as {
      ok: boolean;
      data: {
        run: { id: string };
        events: Array<{ type: string }>;
      };
    };
    assert.equal(detailPayload.ok, true);
    assert.equal(detailPayload.data.run.id, "sample-run-1");
    assert.equal(detailPayload.data.events[0]?.type, "queued");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    delete process.env.AUTOCLAWDEV_PROJECTS_DIR;
    delete process.env.AUTOCLAWDEV_CODEX_AUTH_PATH;
    rmSync(root, { recursive: true, force: true });
  }
});
