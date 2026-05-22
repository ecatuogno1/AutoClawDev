import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ProjectManifest } from "@autoclawdev/types";
import { runPreflight } from "../src/lib/preflight.ts";

test("preflight reports missing required commands deterministically", async () => {
  const projectDir = mkdtempSync(join(tmpdir(), "autoclaw-preflight-"));
  mkdirSync(join(projectDir, ".autoclaw"), { recursive: true });

  process.env.AUTOCLAWDEV_CODEX_AUTH_PATH = join(projectDir, "auth.json");

  const manifest: ProjectManifest = {
    key: "sample",
    name: "Sample",
    path: projectDir,
    description: "Sample",
    package_manager: "missing-tool-for-test",
    packageManager: "missing-tool-for-test",
    test_cmd: "",
    lint_cmd: "",
    allowed_override_reasons: [
      "baseline_match",
      "environment_issue",
      "broad_repo_failure",
      "preexisting_unrelated_failure",
    ],
    focus: [],
    schemaVersion: 2,
    manifestSource: join(projectDir, "sample.json"),
    allowedOverrideReasons: [
      "baseline_match",
      "environment_issue",
      "broad_repo_failure",
      "preexisting_unrelated_failure",
    ],
    capabilities: {
      test: { key: "test", configured: false, status: "missing", summary: "No test command configured" },
      lint: { key: "lint", configured: false, status: "missing", summary: "No lint command configured" },
      security: { key: "security", configured: false, status: "missing", summary: "No security validation configured" },
      performance: { key: "performance", configured: false, status: "missing", summary: "No performance validation configured" },
      browser: { key: "browser", configured: false, status: "missing", summary: "No dev URL configured" },
      github: { key: "github", configured: false, status: "missing", summary: "No GitHub repository configured" },
    },
    validationProfiles: [],
  };

  const report = await runPreflight(manifest, "build");
  assert.equal(report.ok, false);
  assert.equal(
    report.checks.some(
      (check) => check.id === "command-missing-tool-for-test" && check.status === "fail",
    ),
    true,
  );

  rmSync(projectDir, { recursive: true, force: true });
});

test("audit preflight fails when the target is unreachable", async () => {
  const projectDir = mkdtempSync(join(tmpdir(), "autoclaw-audit-preflight-"));
  mkdirSync(join(projectDir, ".autoclaw"), { recursive: true });

  const manifest: ProjectManifest = {
    key: "sample-audit",
    name: "Sample Audit",
    path: projectDir,
    description: "Sample",
    package_manager: "pnpm",
    packageManager: "pnpm",
    test_cmd: "",
    lint_cmd: "",
    dev_url: "http://127.0.0.1:65534",
    allowed_override_reasons: [
      "baseline_match",
      "environment_issue",
      "broad_repo_failure",
      "preexisting_unrelated_failure",
    ],
    focus: [],
    schemaVersion: 2,
    manifestSource: join(projectDir, "sample-audit.json"),
    allowedOverrideReasons: [
      "baseline_match",
      "environment_issue",
      "broad_repo_failure",
      "preexisting_unrelated_failure",
    ],
    capabilities: {
      test: { key: "test", configured: false, status: "missing", summary: "No test command configured" },
      lint: { key: "lint", configured: false, status: "missing", summary: "No lint command configured" },
      security: { key: "security", configured: false, status: "missing", summary: "No security validation configured" },
      performance: { key: "performance", configured: false, status: "missing", summary: "No performance validation configured" },
      browser: { key: "browser", configured: true, status: "ready", summary: "Browser target configured", command: "http://127.0.0.1:65534", source: "dev_url" },
      github: { key: "github", configured: false, status: "missing", summary: "No GitHub repository configured" },
    },
    validationProfiles: [],
  };

  const report = await runPreflight(manifest, "audit", { target: manifest.dev_url });
  const targetCheck = report.checks.find((check) => check.id === "audit-target");
  assert.equal(report.ok, false);
  assert.equal(targetCheck?.status, "fail");
  assert.match(targetCheck?.detail ?? "", /unreachable|failed|refused/i);

  rmSync(projectDir, { recursive: true, force: true });
});
