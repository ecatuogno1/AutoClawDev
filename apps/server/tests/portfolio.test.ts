import test from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ProjectStats } from "@autoclawdev/types";

function setupPortfolioFixture(options: {
  key: string;
  globalConfig: Record<string, unknown>;
  localConfig?: Record<string, unknown>;
  packageJson?: Record<string, unknown>;
}) {
  const root = mkdtempSync(join(tmpdir(), "autoclaw-portfolio-"));
  const projectsDir = join(root, "projects");
  const projectDir = join(root, options.key);

  mkdirSync(projectsDir, { recursive: true });
  mkdirSync(join(projectDir, ".autoclaw"), { recursive: true });

  writeFileSync(
    join(projectsDir, `${options.key}.json`),
    JSON.stringify({
      path: projectDir,
      package_manager: "pnpm",
      workflow_type: "standard",
      team_profile: "reliability",
      speed_profile: "balanced",
      default_cycles: 5,
      max_parallel_cycles: 1,
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
    projectDir,
    cleanup() {
      rmSync(root, { recursive: true, force: true });
      delete process.env.AUTOCLAWDEV_PROJECTS_DIR;
    },
  };
}

const EMPTY_STATS: ProjectStats = {
  total: 0,
  passed: 0,
  failed: 0,
  passRate: 0,
  lastRun: null,
};

test("readiness treats intentional missing capabilities as baseline-ready", async () => {
  const fixture = setupPortfolioFixture({
    key: "cannabis-route-manager",
    globalConfig: {
      name: "Cannabis Route Manager",
      description: "Route app",
      test_cmd: "npm test",
      lint_cmd: "",
      dev_url: "http://localhost:5173",
    },
    packageJson: {
      scripts: {
        test: "vitest",
      },
    },
  });

  const { getProjectManifest } = await import("../src/lib/projectManifest.ts");
  const { buildProjectReadinessEntry } = await import("../src/lib/portfolio.ts");
  const manifest = await getProjectManifest("cannabis-route-manager");

  assert.ok(manifest);
  const readiness = buildProjectReadinessEntry({
    manifest,
    stats: EMPTY_STATS,
    activeRun: false,
    openFindings: 0,
    memoryInitialized: true,
  });

  assert.equal(readiness.manifestComplete, true);
  assert.equal(readiness.baselineReady, true);
  assert.deepEqual(readiness.missingBaselineFields, []);
  assert.equal(readiness.manifest.capabilities.lint.status, "missing");

  fixture.cleanup();
});

test("sync preview and apply write compatibility config from the registry manifest", async () => {
  const fixture = setupPortfolioFixture({
    key: "t3code",
    globalConfig: {
      name: "T3 Code",
      description: "Agent UI",
      dev_url: "http://localhost:5733",
      test_cmd: "pnpm test",
      lint_cmd: "pnpm lint",
      gh_repo: "ecatuogno1/t3code",
      gh_upstream: "pingdotgg/t3code",
    },
  });

  const configPath = join(fixture.projectDir, ".autoclaw", "config.json");
  rmSync(configPath, { force: true });

  const { getProjectManifest } = await import("../src/lib/projectManifest.ts");
  const { syncCompatibilityConfig } = await import("../src/lib/portfolio.ts");
  const manifest = await getProjectManifest("t3code");

  assert.ok(manifest);

  const preview = syncCompatibilityConfig({ manifest, dryRun: true });
  assert.equal(preview.changed, true);
  assert.equal(existsSync(configPath), false);

  const applied = syncCompatibilityConfig({ manifest, dryRun: false });
  assert.equal(applied.changed, true);
  assert.equal(existsSync(configPath), true);

  const writtenConfig = JSON.parse(readFileSync(configPath, "utf-8")) as {
    dev_url?: string;
    gh_repo?: string;
  };
  assert.equal(writtenConfig.dev_url, "http://localhost:5733");
  assert.equal(writtenConfig.gh_repo, "ecatuogno1/t3code");

  fixture.cleanup();
});
