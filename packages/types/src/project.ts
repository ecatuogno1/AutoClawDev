import type { ExecutionKind, RunRecord } from "./control-plane.js";
import type { ActiveRun } from "./sse.js";
export type ValidationOverrideReason =
  | "baseline_match"
  | "environment_issue"
  | "broad_repo_failure"
  | "preexisting_unrelated_failure";

export interface ProfileValidationEntry {
  command: string;
  relevance_paths: string[];
  run_on_baseline: boolean;
}

export type ProjectCapabilityKey =
  | "test"
  | "lint"
  | "security"
  | "performance"
  | "browser"
  | "github";

export type ProjectCapabilityStatus = "ready" | "partial" | "missing";

export interface ProjectCapability {
  key: ProjectCapabilityKey;
  configured: boolean;
  status: ProjectCapabilityStatus;
  summary: string;
  command?: string;
  source?: string;
}

export interface ValidationProfile {
  key: string;
  command: string;
  relevancePaths: string[];
  runOnBaseline: boolean;
  source: "explicit" | "derived";
}

export interface ProjectConfig {
  key: string;
  name: string;
  path: string;
  description: string;
  package_manager: string;
  test_cmd: string;
  lint_cmd: string;
  focus: string[];
  gh_repo?: string;
  gh_upstream?: string;
  security_cmd?: string;
  security_dependency_cmd?: string;
  performance_cmd?: string;
  profile_validation?: Record<string, ProfileValidationEntry>;
  team_profile?: string;
  speed_profile?: string;
  workflow_type?: string;
  default_cycles?: number;
  max_parallel_cycles?: number;
  batch_research_count?: number;
  base_branch?: string;
  integration_branch?: string;
  landing_repo?: string;
  dev_url?: string;
  audit_url?: string;
  research_model?: string;
  planning_model?: string;
  impl_model?: string;
  review_model?: string;
  codex_model?: string;
  codex_fix_model?: string;
  allowed_override_reasons?: ValidationOverrideReason[];
}

export interface ProjectManifest extends ProjectConfig {
  schemaVersion: 2;
  manifestSource: string;
  localConfigSource?: string;
  configAuthority: "global-registry";
  packageManager: string;
  authoritativeFields: string[];
  declaredDevUrl?: string;
  declaredAuditUrl?: string;
  inferredDevUrl?: string;
  compatibilityConfigPath?: string;
  compatibilityFallbackFields: string[];
  compatibilityDriftFields: string[];
  allowedOverrideReasons: ValidationOverrideReason[];
  capabilities: Record<ProjectCapabilityKey, ProjectCapability>;
  validationProfiles: ValidationProfile[];
}

export interface ProjectStats {
  total: number;
  passed: number;
  cleanPassed?: number;
  degradedPassed?: number;
  failed: number;
  recoveryRequired?: number;
  passRate: number;
  lastRun?: RunRecord | null;
}

export interface ProjectWithStats extends ProjectConfig {
  stats: ProjectStats;
}

export interface ProjectDetail extends ProjectConfig {
  stats: ProjectStats;
  recentRuns: RunRecord[];
}

export interface ProjectExecutionModeSummary {
  mode: ExecutionKind;
  runId?: string;
  status?: string;
  summary?: string;
  updatedAt?: string;
  active: boolean;
  canResume: boolean;
  approvalsPending: string[];
  phases?: Array<{
    name: string;
    status: string;
    detail?: string;
  }>;
}

export interface ProjectExecutionSummary {
  projectKey: string;
  activeRun?: ActiveRun;
  activeRecord?: ProjectExecutionModeSummary | null;
  latestOverall?: ProjectExecutionModeSummary | null;
  latestByMode: Record<ExecutionKind, ProjectExecutionModeSummary>;
}
