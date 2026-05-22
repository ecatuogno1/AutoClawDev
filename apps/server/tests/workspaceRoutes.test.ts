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
import workspaceRouter from "../src/routes/workspace.ts";

test("workspace routes require a valid project and block path escapes", async () => {
  const root = mkdtempSync(join(tmpdir(), "autoclaw-workspace-route-"));
  const projectsDir = join(root, "projects");
  const projectDir = join(root, "sample-project");

  mkdirSync(projectsDir, { recursive: true });
  mkdirSync(projectDir, { recursive: true });
  mkdirSync(join(projectDir, "src"), { recursive: true });
  writeFileSync(join(projectDir, "package.json"), JSON.stringify({ name: "sample" }));
  writeFileSync(join(projectDir, "src", "index.ts"), "export const sample = true;\n");

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
    }),
  );

  process.env.AUTOCLAWDEV_PROJECTS_DIR = projectsDir;

  const app = express();
  app.use(express.json());
  app.use("/api/workspace", workspaceRouter);

  const server = await new Promise<import("node:http").Server>((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    const invalidProjectResponse = await fetch(
      `http://127.0.0.1:${address.port}/api/workspace/files?project=missing-project`,
    );
    assert.equal(invalidProjectResponse.status, 404);
    assert.deepEqual(await invalidProjectResponse.json(), {
      error: "Project not found",
    });

    const escapedPathResponse = await fetch(
      `http://127.0.0.1:${address.port}/api/workspace/files?project=sample&path=../outside`,
    );
    assert.equal(escapedPathResponse.status, 403);
    assert.deepEqual(await escapedPathResponse.json(), {
      error: "Path escapes project root",
    });

    const validResponse = await fetch(
      `http://127.0.0.1:${address.port}/api/workspace/files?project=sample&path=src`,
    );
    assert.equal(validResponse.ok, true);

    const payload = (await validResponse.json()) as {
      path: string;
      entries: Array<{ name: string; path: string; type: string }>;
    };

    assert.equal(payload.path, "src");
    assert.equal(payload.entries.length, 1);
    assert.equal(payload.entries[0]?.name, "index.ts");
    assert.equal(payload.entries[0]?.path, "src/index.ts");
    assert.equal(payload.entries[0]?.type, "file");
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
