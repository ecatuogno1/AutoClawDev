import { existsSync, mkdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import type {
  PreflightCheck,
  PreflightReport,
  ProjectManifest,
  RunMode,
} from "@autoclawdev/types";
import { detectBrowserAutomationCapability } from "./capabilities.js";
import { getProjectRunsDir } from "./paths.js";

function checkCommandAvailable(command: string): boolean {
  return spawnSync("which", [command], { stdio: "ignore" }).status === 0;
}

function runGitStatus(projectPath: string): string | null {
  const result = spawnSync("git", ["status", "--porcelain"], {
    cwd: projectPath,
    encoding: "utf-8",
  });
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

function buildCheck(
  id: string,
  label: string,
  status: PreflightCheck["status"],
  detail: string,
): PreflightCheck {
  return { id, label, status, detail };
}

async function checkAuditTargetReachability(target: string): Promise<PreflightCheck> {
  let normalized: URL;
  try {
    normalized = new URL(target);
  } catch {
    return buildCheck(
      "audit-target",
      "Audit target",
      "fail",
      `Invalid audit target URL: ${target}`,
    );
  }

  try {
    const response = await fetch(normalized, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(5_000),
    });
    return buildCheck(
      "audit-target",
      "Audit target",
      "pass",
      `${normalized.toString()} reachable (${response.status} ${response.statusText || "response"})`,
    );
  } catch (error) {
    return buildCheck(
      "audit-target",
      "Audit target",
      "fail",
      error instanceof Error
        ? `${normalized.toString()} unreachable: ${error.message}`
        : `${normalized.toString()} unreachable`,
    );
  }
}

export async function runPreflight(
  manifest: ProjectManifest,
  mode: RunMode,
  options?: {
    target?: string;
  },
): Promise<PreflightReport> {
  const checks: PreflightCheck[] = [];

  checks.push(
    buildCheck(
      "manifest-path",
      "Project path",
      existsSync(manifest.path) ? "pass" : "fail",
      existsSync(manifest.path)
        ? manifest.path
        : `Missing project path: ${manifest.path || "unset"}`,
    ),
  );

  const requiredCommands = new Set<string>(["bash", "git", manifest.packageManager]);
  if (mode === "run") {
    requiredCommands.add("claude");
    requiredCommands.add("codex");
  }
  if (mode === "audit") {
    requiredCommands.add("python3");
  }
  if (manifest.capabilities.github.configured) {
    requiredCommands.add("gh");
  }

  for (const command of requiredCommands) {
    checks.push(
      buildCheck(
        `command-${command}`,
        `Command: ${command}`,
        checkCommandAvailable(command) ? "pass" : "fail",
        checkCommandAvailable(command)
          ? `${command} available`
          : `${command} is missing from PATH`,
      ),
    );
  }

  const codexAuthPath =
    process.env.AUTOCLAWDEV_CODEX_AUTH_PATH ||
    join(homedir(), ".codex", "auth.json");
  checks.push(
    buildCheck(
      "codex-auth",
      "Codex auth",
      existsSync(codexAuthPath) ? "pass" : mode === "run" ? "fail" : "warn",
      existsSync(codexAuthPath)
        ? codexAuthPath
        : mode === "run"
          ? `Missing Codex auth file at ${codexAuthPath}`
          : `Codex auth file not found at ${codexAuthPath}; continuing because ${mode} mode does not require it`,
    ),
  );

  const gitStatus = existsSync(manifest.path)
    ? runGitStatus(manifest.path)
    : null;
  checks.push(
    buildCheck(
      "git-clean",
      "Git worktree",
      gitStatus === null ? "warn" : gitStatus === "" ? "pass" : "fail",
      gitStatus === null
        ? "Unable to inspect git status"
        : gitStatus === ""
          ? "Working tree is clean"
          : "Working tree has uncommitted changes",
    ),
  );

  const validations = manifest.validationProfiles.filter((profile) => profile.command.trim());
  checks.push(
    buildCheck(
      "validation-profiles",
      "Validation profiles",
      validations.length > 0 ? "pass" : "warn",
      validations.length > 0
        ? `${validations.length} validation profile(s) configured`
        : "No validation profiles configured",
    ),
  );

  const browserCapability = detectBrowserAutomationCapability();
  checks.push(
    buildCheck(
      "browser-automation",
      "Browser automation",
      manifest.capabilities.browser.configured
        ? (browserCapability.available ? "pass" : "warn")
        : "warn",
      browserCapability.reason,
    ),
  );

  if (mode === "audit") {
    const target = options?.target ?? manifest.dev_url;
    checks.push(
      target
        ? await checkAuditTargetReachability(target)
        : buildCheck(
            "audit-target",
            "Audit target",
            "fail",
            "Audit mode requires a target URL or project dev_url",
          ),
    );
  }

  checks.push(
    buildCheck(
      "override-policy",
      "Validation override policy",
      manifest.allowedOverrideReasons.length > 0 ? "pass" : "fail",
      manifest.allowedOverrideReasons.length > 0
        ? `Allowed override reasons: ${manifest.allowedOverrideReasons.join(", ")}`
        : "No allowed override reasons configured",
    ),
  );

  try {
    mkdirSync(getProjectRunsDir(manifest.path), { recursive: true });
    const stats = statSync(getProjectRunsDir(manifest.path));
    checks.push(
      buildCheck(
        "artifact-dir",
        "Artifact directory",
        stats.isDirectory() ? "pass" : "fail",
        getProjectRunsDir(manifest.path),
      ),
    );
  } catch (error) {
    checks.push(
      buildCheck(
        "artifact-dir",
        "Artifact directory",
        "fail",
        error instanceof Error ? error.message : "Failed to prepare run artifacts directory",
      ),
    );
  }

  if (manifest.capabilities.test.configured && !manifest.test_cmd.trim()) {
    checks.push(
      buildCheck(
        "test-command",
        "Test command",
        "fail",
        "Test capability is marked configured but test_cmd is empty",
      ),
    );
  }

  const blockingCount = checks.filter((check) => check.status === "fail").length;
  const warningCount = checks.filter((check) => check.status === "warn").length;

  return {
    projectKey: manifest.key,
    mode,
    checkedAt: new Date().toISOString(),
    ok: blockingCount === 0,
    blockingCount,
    warningCount,
    checks,
    capabilities: manifest.capabilities,
  };
}
