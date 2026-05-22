export type NormalizedTeamProfile =
  | "reliability"
  | "security"
  | "performance"
  | "quality"
  | "issues";

export type NormalizedSpeedProfile = "fast" | "balanced" | "thorough";

export type NormalizedWorkflowType =
  | "standard"
  | "implement-only"
  | "review-only"
  | "fast-ship"
  | "batch-research"
  | "research-only"
  | "deep-review"
  | "audit";

export const normalizedTeamProfiles: NormalizedTeamProfile[] = [
  "reliability",
  "security",
  "performance",
  "quality",
  "issues",
];

export const normalizedSpeedProfiles: NormalizedSpeedProfile[] = [
  "fast",
  "balanced",
  "thorough",
];

export const normalizedWorkflowTypes: NormalizedWorkflowType[] = [
  "standard",
  "implement-only",
  "review-only",
  "fast-ship",
  "batch-research",
  "research-only",
  "deep-review",
  "audit",
];

const teamProfileAliases: Record<string, NormalizedTeamProfile> = {
  reliability: "reliability",
  security: "security",
  "data-integrity": "security",
  data: "security",
  "privacy-compliance": "security",
  privacy: "security",
  compliance: "security",
  "dependency-hygiene": "security",
  dependency: "security",
  dependencies: "security",
  deps: "security",
  performance: "performance",
  quality: "quality",
  "test-hardening": "quality",
  tests: "quality",
  test: "quality",
  testing: "quality",
  "frontend-quality": "quality",
  frontend: "quality",
  ui: "quality",
  "mobile-quality": "quality",
  mobile: "quality",
  "api-contract": "quality",
  contract: "quality",
  api: "quality",
  "refactor-safety": "quality",
  refactor: "quality",
  issues: "issues",
  "issue-burner": "issues",
  issue: "issues",
};

const speedProfileAliases: Record<string, NormalizedSpeedProfile> = {
  fast: "fast",
  quick: "fast",
  faster: "fast",
  thorough: "thorough",
  balanced: "balanced",
  safe: "balanced",
  default: "balanced",
};

const workflowTypeAliases: Record<string, NormalizedWorkflowType> = {
  "implement-only": "implement-only",
  impl: "implement-only",
  implement: "implement-only",
  implementation: "implement-only",
  "review-only": "review-only",
  review: "review-only",
  "review-pass": "review-only",
  "fast-ship": "fast-ship",
  fast: "fast-ship",
  fastship: "fast-ship",
  ship: "fast-ship",
  "batch-research": "batch-research",
  batch: "batch-research",
  "multi-research": "batch-research",
  "batch-impl": "batch-research",
  "research-only": "research-only",
  research: "research-only",
  findings: "research-only",
  "deep-review": "deep-review",
  deepreview: "deep-review",
  "deep-audit": "deep-review",
  stabilize: "deep-review",
  audit: "audit",
  standard: "standard",
};

function normalizeKey(value: string | undefined | null, fallback: string): string {
  const raw = String(value ?? fallback).trim().toLowerCase().replace(/[ _]+/g, "-");
  return raw || fallback;
}

export function normalizeTeamProfile(value?: string | null): NormalizedTeamProfile {
  const raw = normalizeKey(value, "reliability");
  return teamProfileAliases[raw] ?? "reliability";
}

export function normalizeSpeedProfile(value?: string | null): NormalizedSpeedProfile {
  const raw = normalizeKey(value, "balanced");
  return speedProfileAliases[raw] ?? "balanced";
}

export function normalizeWorkflowType(value?: string | null): NormalizedWorkflowType {
  const raw = normalizeKey(value, "standard");
  return workflowTypeAliases[raw] ?? "standard";
}

export function isKnownTeamProfileInput(value?: string | null): boolean {
  return normalizeKey(value, "") in teamProfileAliases;
}

export function isKnownSpeedProfileInput(value?: string | null): boolean {
  return normalizeKey(value, "") in speedProfileAliases;
}

export function isKnownWorkflowTypeInput(value?: string | null): boolean {
  return normalizeKey(value, "") in workflowTypeAliases;
}

export function profileDisplayLabel(value: string): string {
  return value
    .split("-")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}
