import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function setupProject(options: {
  key?: string;
  globalConfig: Record<string, unknown>;
  localConfig?: Record<string, unknown>;
  packageJson?: Record<string, unknown>;
}) {
  const root = mkdtempSync(join(tmpdir(), "autoclaw-manifest-"));
  const projectsDir = join(root, "projects");
  const projectDir = join(root, "sample-project");
  const key = options.key ?? "sample";

  mkdirSync(projectsDir, { recursive: true });
  mkdirSync(join(projectDir, ".autoclaw"), { recursive: true });

  writeFileSync(
    join(projectsDir, `${key}.json`),
    JSON.stringify({
      path: projectDir,
      package_manager: "pnpm",
      ...options.globalConfig,
    }),
  );

  if (options.localConfig) {
    writeFileSync(
      join(projectDir, ".autoclaw", "config.json"),
      JSON.stringify(options.localConfig),
    );
  }

  if (options.packageJson) {
    writeFileSync(
      join(projectDir, "package.json"),
      JSON.stringify(options.packageJson),
    );
  }

  process.env.AUTOCLAWDEV_PROJECTS_DIR = projectsDir;

  return {
    key,
    root,
    projectDir,
    cleanup() {
      rmSync(root, { recursive: true, force: true });
      delete process.env.AUTOCLAWDEV_PROJECTS_DIR;
    },
  };
}

test("project manifest uses global registry as authority and tracks fallback fields", async () => {
  const fixture = setupProject({
    globalConfig: {
      name: "Sample",
      description: "Global description",
      test_cmd: "pnpm test",
      lint_cmd: "",
      gh_repo: "owner/repo",
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
      focus: ["Ship things"],
    },
    localConfig: {
      description: "Local description",
      dev_url: "http://localhost:3000",
      lint_cmd: "pnpm lint",
    },
  });

  const { getProjectManifest } = await import("../src/lib/projectManifest.ts");
  const manifest = await getProjectManifest(fixture.key);

  assert.ok(manifest);
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.description, "Global description");
  assert.equal(manifest.packageManager, "pnpm");
  assert.equal(manifest.capabilities.test.status, "ready");
  assert.equal(manifest.capabilities.lint.status, "ready");
  assert.equal(manifest.capabilities.browser.status, "ready");
  assert.equal(manifest.capabilities.github.status, "ready");
  assert.deepEqual(manifest.compatibilityFallbackFields.sort(), ["dev_url", "lint_cmd"]);
  assert.equal(manifest.authoritativeFields.includes("description"), true);
  assert.equal(manifest.authoritativeFields.includes("lint_cmd"), false);
  assert.equal(manifest.authoritativeFields.includes("dev_url"), false);
  assert.equal(manifest.validationProfiles.length, 2);
  assert.deepEqual(manifest.allowedOverrideReasons, [
    "baseline_match",
    "environment_issue",
    "broad_repo_failure",
    "preexisting_unrelated_failure",
  ]);

  fixture.cleanup();
});

test("project manifest infers dev_url and scripts when registry metadata is missing", async () => {
  const fixture = setupProject({
    key: "t3code",
    globalConfig: {
      name: "T3 Code",
      description: "Sample",
      workflow_type: "standard",
      team_profile: "reliability",
      speed_profile: "balanced",
      default_cycles: 5,
      max_parallel_cycles: 1,
      allowed_override_reasons: [
        "baseline_match",
        "environment_issue",
        "broad_repo_failure",
        "preexisting_unrelated_failure",
      ],
    },
    packageJson: {
      scripts: {
        test: "vitest",
        lint: "eslint .",
      },
    },
  });

  const { getProjectManifest } = await import("../src/lib/projectManifest.ts");
  const manifest = await getProjectManifest("t3code");

  assert.ok(manifest);
  assert.equal(manifest.dev_url, "http://localhost:5733");
  assert.equal(manifest.inferredDevUrl, "http://localhost:5733");
  assert.equal(manifest.test_cmd, "pnpm test");
  assert.equal(manifest.lint_cmd, "pnpm run lint");
  assert.deepEqual(manifest.allowedOverrideReasons, [
    "baseline_match",
    "environment_issue",
    "broad_repo_failure",
    "preexisting_unrelated_failure",
  ]);
  assert.equal(manifest.compatibilityFallbackFields.includes("dev_url"), true);
  assert.equal(manifest.compatibilityFallbackFields.includes("test_cmd"), true);
  assert.equal(manifest.compatibilityFallbackFields.includes("lint_cmd"), true);

  fixture.cleanup();
});

test("project manifest normalizes team, speed, and workflow aliases through the shared layer", async () => {
  const fixture = setupProject({
    globalConfig: {
      name: "Alias Sample",
      description: "Alias normalization fixture",
      workflow_type: "review",
      team_profile: "issue-burner",
      speed_profile: "quick",
      default_cycles: 1,
      max_parallel_cycles: 1,
      allowed_override_reasons: ["baseline_match"],
    },
  });

  const { getProjectManifest } = await import("../src/lib/projectManifest.ts");
  const manifest = await getProjectManifest(fixture.key);

  assert.ok(manifest);
  assert.equal(manifest.team_profile, "issues");
  assert.equal(manifest.speed_profile, "fast");
  assert.equal(manifest.workflow_type, "review-only");

  fixture.cleanup();
});
