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
import systemRouter from "../src/routes/system.ts";

test("system readiness endpoint exposes manifest completeness from the global registry", async () => {
  const root = mkdtempSync(join(tmpdir(), "autoclaw-system-route-"));
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
      default_cycles: 3,
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

  writeFileSync(
    join(projectDir, ".autoclaw", "config.json"),
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
      default_cycles: 3,
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

  const app = express();
  app.use("/api/system", systemRouter);

  const server = await new Promise<import("node:http").Server>((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    const healthResponse = await fetch(
      `http://127.0.0.1:${address.port}/api/system/health`,
    );
    assert.equal(healthResponse.ok, true);
    const health = (await healthResponse.json()) as {
      capabilities?: {
        browserAutomation?: {
          adapter: string;
          reason: string;
        };
      };
    };
    assert.ok(health.capabilities?.browserAutomation);
    assert.equal(typeof health.capabilities?.browserAutomation?.adapter, "string");
    assert.equal(typeof health.capabilities?.browserAutomation?.reason, "string");

    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/system/projects-readiness`,
    );
    assert.equal(response.ok, true);

    const payload = (await response.json()) as {
      projects: Array<{
        key: string;
        manifestComplete: boolean;
        baselineReady: boolean;
        configDrift: boolean;
        missingBaselineFields: string[];
      }>;
    };

    const project = payload.projects.find((entry) => entry.key === "sample");
    assert.ok(project);
    assert.equal(project.manifestComplete, true);
    assert.equal(project.baselineReady, true);
    assert.equal(project.configDrift, false);
    assert.deepEqual(project.missingBaselineFields, []);
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
