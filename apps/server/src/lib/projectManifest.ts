import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  ProfileValidationEntry,
  ProjectCapability,
  ProjectCapabilityKey,
  ProjectConfig,
  ProjectManifest,
  ValidationOverrideReason,
  ValidationProfile,
} from "@autoclawdev/types";
import {
  normalizeSpeedProfile,
  normalizeTeamProfile,
  normalizeWorkflowType,
} from "@autoclawdev/types";
import { getProjectsDir, getProjectsPath } from "./paths.js";
const CONFIG_AUTHORITY = "global-registry" as const;

const KNOWN_DEV_URLS: Record<string, string> = {
  autoclawdev: "http://localhost:4100",
  "c2c-prints": "http://localhost:38088",
  "cannabis-route-manager": "http://localhost:5173",
  clawbuster: "http://localhost:4000",
  "esc-renovations": "http://localhost:3000",
  nicebaby: "http://localhost:3000",
  t3code: "http://localhost:5733",
};

const COMPATIBILITY_FIELDS: Array<keyof ProjectConfig> = [
  "name",
  "path",
  "description",
  "package_manager",
  "test_cmd",
  "lint_cmd",
  "focus",
  "gh_repo",
  "gh_upstream",
  "security_cmd",
  "security_dependency_cmd",
  "performance_cmd",
  "profile_validation",
  "team_profile",
  "speed_profile",
  "workflow_type",
  "default_cycles",
  "max_parallel_cycles",
  "batch_research_count",
  "base_branch",
  "integration_branch",
  "landing_repo",
  "dev_url",
  "audit_url",
  "research_model",
  "planning_model",
  "impl_model",
  "review_model",
  "codex_model",
  "codex_fix_model",
  "allowed_override_reasons",
];

const DEFAULT_ALLOWED_OVERRIDE_REASONS: ValidationOverrideReason[] = [
  "baseline_match",
  "environment_issue",
  "broad_repo_failure",
  "preexisting_unrelated_failure",
];

type RawProjectConfig = Partial<ProjectConfig> & {
  packageManager?: string;
};

interface RepoHints {
  inferredDevUrl?: string;
  inferredCommands: Partial<Record<"test_cmd" | "lint_cmd" | "security_cmd" | "performance_cmd", string>>;
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function trimString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function hasField(
  config: RawProjectConfig | null | undefined,
  field: keyof ProjectConfig,
): boolean {
  if (!config) return false;
  const value = config[field];
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function normalizeAllowedOverrideReasons(
  value: unknown,
): ValidationOverrideReason[] {
  const allowed = new Set(DEFAULT_ALLOWED_OVERRIDE_REASONS);
  if (!Array.isArray(value)) {
    return [...DEFAULT_ALLOWED_OVERRIDE_REASONS];
  }
  const normalized = value
    .map((entry) => String(entry).trim())
    .filter((entry): entry is ValidationOverrideReason => allowed.has(entry as ValidationOverrideReason));
  return normalized.length > 0 ? uniqueStrings(normalized) as ValidationOverrideReason[] : [...DEFAULT_ALLOWED_OVERRIDE_REASONS];
}

function commandForScript(
  packageManager: string,
  scriptName: string,
): string {
  if (scriptName === "test") {
    return `${packageManager} test`;
  }
  return `${packageManager} run ${scriptName}`;
}

function inferCommandFromScripts(
  packageManager: string,
  scripts: Record<string, string>,
  candidates: string[],
): string | undefined {
  for (const candidate of candidates) {
    if (trimString(scripts[candidate])) {
      return commandForScript(packageManager, candidate);
    }
  }
  return undefined;
}

async function discoverRepoHints(
  key: string,
  projectPath: string,
  packageManager: string,
): Promise<RepoHints> {
  const hints: RepoHints = {
    inferredDevUrl: KNOWN_DEV_URLS[key],
    inferredCommands: {},
  };

  const packageJson = await readJsonFile<{ scripts?: Record<string, string> }>(
    join(projectPath, "package.json"),
  );
  const scripts = packageJson?.scripts ?? {};

  hints.inferredCommands.test_cmd = inferCommandFromScripts(
    packageManager,
    scripts,
    ["test"],
  );
  hints.inferredCommands.lint_cmd = inferCommandFromScripts(
    packageManager,
    scripts,
    ["lint"],
  );
  hints.inferredCommands.security_cmd = inferCommandFromScripts(
    packageManager,
    scripts,
    ["security", "security:secrets", "security:audit", "security:scan", "audit", "lint:security"],
  );
  hints.inferredCommands.performance_cmd = inferCommandFromScripts(
    packageManager,
    scripts,
    ["performance", "performance:bundle", "perf", "analyze:bundle"],
  );

  return hints;
}

function normalizeProfileValidation(
  rawProfiles: Record<string, ProfileValidationEntry> | undefined,
  config: ProjectConfig,
): ValidationProfile[] {
  const profiles: ValidationProfile[] = [];

  for (const [key, value] of Object.entries(rawProfiles ?? {})) {
    if (!value?.command?.trim()) continue;
    profiles.push({
      key,
      command: value.command.trim(),
      relevancePaths: value.relevance_paths ?? [],
      runOnBaseline: Boolean(value.run_on_baseline),
      source: "explicit",
    });
  }

  const derivedProfiles: Array<[string, string | undefined]> = [
    ["test", config.test_cmd],
    ["lint", config.lint_cmd],
    ["security", config.security_cmd ?? config.security_dependency_cmd],
    ["performance", config.performance_cmd],
  ];

  for (const [key, command] of derivedProfiles) {
    if (!command?.trim()) continue;
    if (profiles.some((profile) => profile.key === key)) continue;
    profiles.push({
      key,
      command: command.trim(),
      relevancePaths: [],
      runOnBaseline: false,
      source: "derived",
    });
  }

  return profiles;
}

function buildCapability(
  key: ProjectCapabilityKey,
  configured: boolean,
  summary: string,
  command?: string,
  source?: string,
): ProjectCapability {
  return {
    key,
    configured,
    status: configured ? "ready" : "missing",
    summary,
    command: command?.trim() || undefined,
    source,
  };
}

function deriveCapabilities(
  config: ProjectConfig,
  validationProfiles: ValidationProfile[],
): Record<ProjectCapabilityKey, ProjectCapability> {
  const securityCommand = config.security_cmd ?? config.security_dependency_cmd;

  return {
    test: buildCapability(
      "test",
      Boolean(config.test_cmd?.trim()),
      config.test_cmd?.trim()
        ? "Test command configured"
        : "No test command configured",
      config.test_cmd,
      "test_cmd",
    ),
    lint: buildCapability(
      "lint",
      Boolean(config.lint_cmd?.trim()),
      config.lint_cmd?.trim()
        ? "Lint or doctor command configured"
        : "No lint command configured",
      config.lint_cmd,
      "lint_cmd",
    ),
    security: buildCapability(
      "security",
      Boolean(securityCommand?.trim()) ||
        validationProfiles.some((profile) => profile.key === "security"),
      securityCommand?.trim()
        ? "Security validation configured"
        : "No security validation configured",
      securityCommand,
      config.security_cmd?.trim()
        ? "security_cmd"
        : config.security_dependency_cmd?.trim()
          ? "security_dependency_cmd"
          : undefined,
    ),
    performance: buildCapability(
      "performance",
      Boolean(config.performance_cmd?.trim()) ||
        validationProfiles.some((profile) => profile.key === "performance"),
      config.performance_cmd?.trim()
        ? "Performance validation configured"
        : "No performance validation configured",
      config.performance_cmd,
      "performance_cmd",
    ),
    browser: buildCapability(
      "browser",
      Boolean(config.dev_url?.trim()),
      config.dev_url?.trim()
        ? "Browser verification URL configured"
        : "No dev URL configured for browser verification",
      config.dev_url,
      "dev_url",
    ),
    github: buildCapability(
      "github",
      Boolean(config.gh_repo?.trim()),
      config.gh_repo?.trim()
        ? "GitHub repository configured"
        : "No GitHub repository configured",
      config.gh_repo,
      "gh_repo",
    ),
  };
}

function compatibilityValue(config: Partial<ProjectConfig>, field: keyof ProjectConfig) {
  const value = config[field];
  if (field === "team_profile") {
    return normalizeTeamProfile(typeof value === "string" ? value : undefined);
  }
  if (field === "speed_profile") {
    return normalizeSpeedProfile(typeof value === "string" ? value : undefined);
  }
  if (field === "workflow_type") {
    return normalizeWorkflowType(typeof value === "string" ? value : undefined);
  }
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function buildCompatibilityConfigFromConfig(
  config: ProjectConfig,
): Partial<ProjectConfig> {
  const compatibility: Partial<ProjectConfig> = {};
  for (const field of COMPATIBILITY_FIELDS) {
    const value = config[field];
    if (value === undefined) continue;
    compatibility[field] = value as never;
  }
  return compatibility;
}

function computeCompatibilityDrift(
  expected: Partial<ProjectConfig>,
  localConfig: RawProjectConfig | null,
): string[] {
  if (!localConfig) {
    return ["missing_local_config"];
  }

  const driftFields: string[] = [];
  for (const field of COMPATIBILITY_FIELDS) {
    if (stableJson(compatibilityValue(expected, field)) !== stableJson(compatibilityValue(localConfig, field))) {
      driftFields.push(String(field));
    }
  }
  return driftFields;
}

function resolveField(
  field: keyof ProjectConfig,
  globalConfig: RawProjectConfig,
  localConfig: RawProjectConfig | null,
  inferredValue: unknown,
  compatibilityFallbackFields: string[],
): unknown {
  const globalValue = globalConfig[field];
  if (globalValue !== undefined && stableJson(globalValue) !== stableJson("")) {
    return globalValue;
  }

  const localValue = localConfig?.[field];
  if (localValue !== undefined && stableJson(localValue) !== stableJson("")) {
    compatibilityFallbackFields.push(String(field));
    return localValue;
  }

  if (inferredValue !== undefined && stableJson(inferredValue) !== stableJson("")) {
    compatibilityFallbackFields.push(String(field));
  }

  return inferredValue;
}

async function normalizeConfig(
  key: string,
  globalConfig: RawProjectConfig,
  localConfig: RawProjectConfig | null,
  manifestSource: string,
  localConfigSource?: string,
): Promise<ProjectManifest> {
  const compatibilityFallbackFields: string[] = [];
  const packageManager =
    trimString(globalConfig.package_manager) ??
    trimString(globalConfig.packageManager) ??
    trimString(localConfig?.package_manager) ??
    trimString(localConfig?.packageManager) ??
    "pnpm";
  const projectPath =
    trimString(globalConfig.path) ??
    trimString(localConfig?.path) ??
    "";
  const repoHints = projectPath
    ? await discoverRepoHints(key, projectPath, packageManager)
    : { inferredDevUrl: KNOWN_DEV_URLS[key], inferredCommands: {} };

  const merged: ProjectConfig = {
    key,
    name: String(resolveField("name", globalConfig, localConfig, key, compatibilityFallbackFields) ?? key),
    path: String(projectPath),
    description: String(
      resolveField(
        "description",
        globalConfig,
        localConfig,
        `${key} project`,
        compatibilityFallbackFields,
      ) ?? `${key} project`,
    ),
    package_manager: packageManager,
    test_cmd: String(
      resolveField(
        "test_cmd",
        globalConfig,
        localConfig,
        repoHints.inferredCommands.test_cmd ?? "",
        compatibilityFallbackFields,
      ) ?? "",
    ),
    lint_cmd: String(
      resolveField(
        "lint_cmd",
        globalConfig,
        localConfig,
        repoHints.inferredCommands.lint_cmd ?? "",
        compatibilityFallbackFields,
      ) ?? "",
    ),
    focus: Array.isArray(globalConfig.focus)
      ? globalConfig.focus
      : Array.isArray(localConfig?.focus)
        ? localConfig.focus
        : [],
    gh_repo: trimString(
      resolveField("gh_repo", globalConfig, localConfig, undefined, compatibilityFallbackFields),
    ),
    gh_upstream: trimString(
      resolveField("gh_upstream", globalConfig, localConfig, undefined, compatibilityFallbackFields),
    ),
    security_cmd: trimString(
      resolveField(
        "security_cmd",
        globalConfig,
        localConfig,
        repoHints.inferredCommands.security_cmd,
        compatibilityFallbackFields,
      ),
    ),
    security_dependency_cmd: trimString(
      resolveField(
        "security_dependency_cmd",
        globalConfig,
        localConfig,
        undefined,
        compatibilityFallbackFields,
      ),
    ),
    performance_cmd: trimString(
      resolveField(
        "performance_cmd",
        globalConfig,
        localConfig,
        repoHints.inferredCommands.performance_cmd,
        compatibilityFallbackFields,
      ),
    ),
    profile_validation: (
      hasField(globalConfig, "profile_validation")
        ? globalConfig.profile_validation
        : localConfig?.profile_validation
    ) as Record<string, ProfileValidationEntry> | undefined,
    team_profile: normalizeTeamProfile(
      trimString(
        resolveField("team_profile", globalConfig, localConfig, "reliability", compatibilityFallbackFields),
      ),
    ),
    speed_profile: normalizeSpeedProfile(
      trimString(
        resolveField("speed_profile", globalConfig, localConfig, "balanced", compatibilityFallbackFields),
      ),
    ),
    workflow_type: normalizeWorkflowType(
      trimString(
        resolveField("workflow_type", globalConfig, localConfig, "standard", compatibilityFallbackFields),
      ),
    ),
    default_cycles: Number(
      resolveField("default_cycles", globalConfig, localConfig, 5, compatibilityFallbackFields) ?? 5,
    ),
    max_parallel_cycles: Number(
      resolveField("max_parallel_cycles", globalConfig, localConfig, 1, compatibilityFallbackFields) ?? 1,
    ),
    batch_research_count: globalConfig.batch_research_count ?? localConfig?.batch_research_count,
    base_branch: trimString(
      resolveField("base_branch", globalConfig, localConfig, undefined, compatibilityFallbackFields),
    ),
    integration_branch: trimString(
      resolveField(
        "integration_branch",
        globalConfig,
        localConfig,
        undefined,
        compatibilityFallbackFields,
      ),
    ),
    landing_repo: trimString(
      resolveField("landing_repo", globalConfig, localConfig, undefined, compatibilityFallbackFields),
    ),
    dev_url: trimString(
      resolveField(
        "dev_url",
        globalConfig,
        localConfig,
        repoHints.inferredDevUrl,
        compatibilityFallbackFields,
      ),
    ),
    audit_url: trimString(
      resolveField(
        "audit_url",
        globalConfig,
        localConfig,
        undefined,
        compatibilityFallbackFields,
      ),
    ),
    research_model: trimString(
      resolveField("research_model", globalConfig, localConfig, undefined, compatibilityFallbackFields),
    ),
    planning_model: trimString(
      resolveField("planning_model", globalConfig, localConfig, undefined, compatibilityFallbackFields),
    ),
    impl_model: trimString(
      resolveField("impl_model", globalConfig, localConfig, undefined, compatibilityFallbackFields),
    ),
    review_model: trimString(
      resolveField("review_model", globalConfig, localConfig, undefined, compatibilityFallbackFields),
    ),
    codex_model: trimString(
      resolveField("codex_model", globalConfig, localConfig, undefined, compatibilityFallbackFields),
    ),
    codex_fix_model: trimString(
      resolveField("codex_fix_model", globalConfig, localConfig, undefined, compatibilityFallbackFields),
    ),
    allowed_override_reasons: normalizeAllowedOverrideReasons(
      resolveField(
        "allowed_override_reasons",
        globalConfig,
        localConfig,
        DEFAULT_ALLOWED_OVERRIDE_REASONS,
        compatibilityFallbackFields,
      ),
    ),
  };

  const validationProfiles = normalizeProfileValidation(
    merged.profile_validation,
    merged,
  );
  const compatibilityConfig = buildCompatibilityConfigFromConfig(merged);
  const compatibilityDriftFields = computeCompatibilityDrift(
    compatibilityConfig,
    localConfig,
  );

  const authoritativeFields = uniqueStrings(
    COMPATIBILITY_FIELDS.filter((field) => hasField(globalConfig, field)).map(String).concat(
      trimString(globalConfig.packageManager) ? ["package_manager"] : [],
    ),
  );

  return {
    ...merged,
    schemaVersion: 2,
    manifestSource,
    localConfigSource,
    compatibilityConfigPath: localConfigSource,
    configAuthority: CONFIG_AUTHORITY,
    packageManager: merged.package_manager,
    authoritativeFields,
    declaredDevUrl: trimString(globalConfig.dev_url),
    declaredAuditUrl: trimString(globalConfig.audit_url),
    inferredDevUrl: repoHints.inferredDevUrl,
    compatibilityFallbackFields: uniqueStrings(compatibilityFallbackFields),
    compatibilityDriftFields,
    allowedOverrideReasons: merged.allowed_override_reasons ?? [...DEFAULT_ALLOWED_OVERRIDE_REASONS],
    capabilities: deriveCapabilities(merged, validationProfiles),
    validationProfiles,
  };
}

async function loadManifestFromFile(filePath: string): Promise<ProjectManifest | null> {
  const raw = await readJsonFile<RawProjectConfig>(filePath);
  if (!raw) return null;

  const key =
    filePath.split("/").pop()?.replace(/\.json$/, "") ?? raw.name ?? "project";
  const localConfigPath = raw.path
    ? join(raw.path, ".autoclaw", "config.json")
    : undefined;
  const localConfig =
    localConfigPath && existsSync(localConfigPath)
      ? await readJsonFile<RawProjectConfig>(localConfigPath)
      : null;

  return normalizeConfig(
    key,
    raw,
    localConfig,
    filePath,
    localConfigPath && existsSync(localConfigPath) ? localConfigPath : undefined,
  );
}

export function buildCompatibilityConfig(
  manifest: ProjectManifest,
): Partial<ProjectConfig> {
  return buildCompatibilityConfigFromConfig(manifest);
}

export async function listProjectManifests(): Promise<ProjectManifest[]> {
  const manifests: ProjectManifest[] = [];

  try {
    const files = await readdir(getProjectsDir());
    for (const file of files.filter((entry) => entry.endsWith(".json")).sort()) {
      const manifest = await loadManifestFromFile(getProjectsPath(file));
      if (manifest) manifests.push(manifest);
    }
  } catch {
    return [];
  }

  return manifests;
}

export async function getProjectManifest(
  key: string,
): Promise<ProjectManifest | undefined> {
  const manifest = await loadManifestFromFile(getProjectsPath(`${key}.json`));
  return manifest ?? undefined;
}
