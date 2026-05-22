import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type {
  PortfolioAuditRow,
  ProjectCapabilityKey,
  ProjectManifest,
  ProjectReadiness,
  ProjectStats,
} from "@autoclawdev/types";
import { buildCompatibilityConfig } from "./projectManifest.js";

const REQUIRED_BASELINE_FIELDS: Array<keyof ProjectManifest> = [
  "name",
  "path",
  "description",
  "package_manager",
  "workflow_type",
  "team_profile",
  "speed_profile",
  "default_cycles",
  "max_parallel_cycles",
];

const OPTIONAL_BASELINE_FIELDS: Array<{
  field: keyof ProjectManifest;
  when: (manifest: ProjectManifest) => boolean;
}> = [
  {
    field: "test_cmd",
    when: (manifest) => manifest.capabilities.test.configured,
  },
  {
    field: "lint_cmd",
    when: (manifest) => manifest.capabilities.lint.configured,
  },
  {
    field: "gh_repo",
    when: (manifest) => manifest.capabilities.github.configured,
  },
  {
    field: "dev_url",
    when: (manifest) =>
      Boolean(manifest.declaredDevUrl?.trim() || manifest.inferredDevUrl?.trim()),
  },
];

function hasAuthoritativeField(
  manifest: ProjectManifest,
  field: keyof ProjectManifest,
): boolean {
  return manifest.authoritativeFields.includes(String(field));
}

function titleizeField(field: string): string {
  return field.replace(/_/g, " ");
}

export function getMissingBaselineFields(
  manifest: ProjectManifest,
): string[] {
  const missing = REQUIRED_BASELINE_FIELDS.filter(
    (field) => !hasAuthoritativeField(manifest, field),
  ).map(String);

  for (const candidate of OPTIONAL_BASELINE_FIELDS) {
    if (candidate.when(manifest) && !hasAuthoritativeField(manifest, candidate.field)) {
      missing.push(String(candidate.field));
    }
  }

  return Array.from(new Set(missing));
}

export function getAdvancedCapabilities(
  manifest: ProjectManifest,
): ProjectCapabilityKey[] {
  return (["security", "performance"] as ProjectCapabilityKey[]).filter(
    (key) => manifest.capabilities[key].status === "ready",
  );
}

function buildWarnings(
  manifest: ProjectManifest,
  missingBaselineFields: string[],
  memoryInitialized: boolean,
): string[] {
  const warnings: string[] = [];

  if (manifest.compatibilityDriftFields.length > 0) {
    warnings.push(
      manifest.compatibilityDriftFields.includes("missing_local_config")
        ? "Compatibility config has not been synced"
        : `Compatibility config drift: ${manifest.compatibilityDriftFields.join(", ")}`,
    );
  }

  const nonBlockingFallbacks = manifest.compatibilityFallbackFields.filter(
    (field) => !missingBaselineFields.includes(field),
  );
  if (nonBlockingFallbacks.length > 0) {
    warnings.push(
      `Using compatibility fallback for: ${nonBlockingFallbacks.join(", ")}`,
    );
  }

  if (!memoryInitialized) {
    warnings.push("No memory cache initialized");
  }

  return warnings;
}

function buildBlockers(
  manifest: ProjectManifest,
  missingBaselineFields: string[],
): string[] {
  const blockers = missingBaselineFields.map(
    (field) => `Missing authoritative manifest field: ${titleizeField(field)}`,
  );

  if (!existsSync(manifest.path)) {
    blockers.push(`Project path does not exist: ${manifest.path}`);
  }

  return blockers;
}

export function buildProjectReadinessEntry(options: {
  manifest: ProjectManifest;
  stats: ProjectStats;
  activeRun: boolean;
  openFindings: number;
  lastRun?: string;
  lastDeepReview?: string;
  memoryInitialized: boolean;
}): ProjectReadiness {
  const {
    manifest,
    stats,
    activeRun,
    openFindings,
    lastRun,
    lastDeepReview,
    memoryInitialized,
  } = options;

  const missingBaselineFields = getMissingBaselineFields(manifest);
  const manifestComplete = missingBaselineFields.length === 0;
  const baselineReady = manifestComplete && existsSync(manifest.path);
  const configDrift = manifest.compatibilityDriftFields.length > 0;
  const advancedCapabilities = getAdvancedCapabilities(manifest);
  const blockers = buildBlockers(manifest, missingBaselineFields);
  const warnings = buildWarnings(manifest, missingBaselineFields, memoryInitialized);

  const readinessScore = Math.max(
    0,
    Math.min(
      100,
      35 +
        (manifestComplete ? 30 : 0) +
        (baselineReady ? 15 : 0) +
        advancedCapabilities.length * 5 +
        Math.round(stats.passRate / 4) -
        blockers.length * 10 -
        warnings.length * 4,
    ),
  );

  return {
    key: manifest.key,
    name: manifest.name,
    description: manifest.description,
    readinessScore,
    manifestComplete,
    baselineReady,
    configDrift,
    missingBaselineFields,
    advancedCapabilities,
    blockers,
    warnings,
    openFindings,
    activeRun,
    lastRun,
    lastDeepReview,
    manifest,
    stats,
  };
}

export function buildPortfolioAuditRow(
  readiness: ProjectReadiness,
): PortfolioAuditRow {
  return {
    key: readiness.key,
    name: readiness.name,
    manifestComplete: readiness.manifestComplete,
    baselineReady: readiness.baselineReady,
    configDrift: readiness.configDrift,
    readinessScore: readiness.readinessScore,
    declaredDevUrl: readiness.manifest.declaredDevUrl,
    inferredDevUrl: readiness.manifest.inferredDevUrl,
    effectiveDevUrl: readiness.manifest.dev_url,
    derivedValidationProfiles: readiness.manifest.validationProfiles
      .filter((profile) => profile.source === "derived")
      .map((profile) => profile.key),
    missingBaselineFields: readiness.missingBaselineFields,
    driftFields: readiness.manifest.compatibilityDriftFields,
    blockers: readiness.blockers,
  };
}

export interface CompatibilitySyncResult {
  key: string;
  path: string;
  changed: boolean;
  previousExists: boolean;
  driftFields: string[];
}

export function syncCompatibilityConfig(options: {
  manifest: ProjectManifest;
  dryRun?: boolean;
}): CompatibilitySyncResult {
  const { manifest, dryRun = false } = options;
  const compatibilityConfigPath =
    manifest.compatibilityConfigPath ??
    `${manifest.path}/.autoclaw/config.json`;
  const nextConfig = `${JSON.stringify(buildCompatibilityConfig(manifest), null, 2)}\n`;
  const previousExists = existsSync(compatibilityConfigPath);
  let currentConfig = "";

  if (previousExists) {
    try {
      currentConfig = `${JSON.stringify(
        JSON.parse(readFileSync(compatibilityConfigPath, "utf-8")),
        null,
        2,
      )}\n`;
    } catch {
      currentConfig = "";
    }
  }

  const changed = !previousExists || currentConfig !== nextConfig;

  if (!dryRun) {
    mkdirSync(dirname(compatibilityConfigPath), { recursive: true });
    writeFileSync(compatibilityConfigPath, nextConfig, "utf-8");
  }

  return {
    key: manifest.key,
    path: compatibilityConfigPath,
    changed,
    previousExists,
    driftFields: manifest.compatibilityDriftFields,
  };
}
