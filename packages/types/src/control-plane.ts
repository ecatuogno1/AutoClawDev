import type {
  ProjectCapability,
  ProjectCapabilityKey,
  ProjectManifest,
  ProjectStats,
  ValidationProfile,
} from "./project.js";
import type { DeepReviewDetail } from "./review.js";
import type { WebAuditRunDetail } from "./web-audit.js";

export type ExecutionKind = "run" | "review" | "build" | "audit";
export type RunMode = ExecutionKind;

export type ExecutionStatus =
  | "queued"
  | "preflight_failed"
  | "running"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "stopped"
  | "cancelled";
export type RunStatus = ExecutionStatus;

export type ExecutionPhaseStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "skipped";
export type PhaseStatus = ExecutionPhaseStatus;
export type RunOutcome =
  | "clean_pass"
  | "degraded_pass"
  | "failed"
  | "recovery_required";
export type RunSource = "native" | "legacy_import";
export type RunHistoryCompleteness = "full" | "partial";
export type RunRecoveryStatus = "open" | "resolved" | "abandoned";
export type RunOverrideReason =
  | "baseline_match"
  | "environment_issue"
  | "broad_repo_failure"
  | "preexisting_unrelated_failure";
export type EventRecordType =
  | "queued"
  | "preflight_passed"
  | "preflight_failed"
  | "phase_started"
  | "phase_finished"
  | "validation_failed"
  | "validation_override_accepted"
  | "committed"
  | "reverted"
  | "stopped"
  | "log_started"
  | "log_completed"
  | "merge_started"
  | "merge_failed"
  | "revert_started"
  | "revert_failed"
  | "recovery_resolved"
  | "recovery_abandoned"
  | "history_imported"
  | "output"
  | "system"
  | "approval_requested"
  | "approval_granted"
  | "operator_command_started"
  | "operator_command_completed";

export interface ExecutionPhaseRecord {
  id: string;
  runId: string;
  name: string;
  status: ExecutionPhaseStatus;
  startedAt?: string;
  completedAt?: string;
  detail?: string;
}
export type RunPhaseRecord = ExecutionPhaseRecord;

export interface ExecutionArtifactRecord {
  key: string;
  label: string;
  path: string;
  contentType?: string;
  kind?: "report" | "log" | "export" | "data";
}

export interface ExecutionArtifactIndex {
  root: string;
  items: ExecutionArtifactRecord[];
}

export interface ExecutionApproval {
  gate: string;
  status: "pending" | "approved" | "rejected";
  requestedAt: string;
  approvedAt?: string;
  approver?: string;
  note?: string;
}

export interface RunPlan {
  projectKey: string;
  mode: ExecutionKind;
  cycles: number;
  workflowType: string;
  teamProfile: string;
  phases: string[];
  validationProfiles: ValidationProfile[];
  artifactRoot: string;
}

export interface ExecutionRunRecord {
  id: string;
  projectKey: string;
  mode: ExecutionKind;
  status: ExecutionStatus;
  source: RunSource;
  cycles: number;
  workflowType: string;
  teamProfile: string;
  createdAt: string;
  updatedAt: string;
  artifactRoot: string;
  manifestSource: string;
  outcome?: RunOutcome;
  historyCompleteness: RunHistoryCompleteness;
  overrideReason?: RunOverrideReason;
  recovery?: {
    required: boolean;
    status?: RunRecoveryStatus;
    branch?: string;
    worktree?: string;
    summaryPath?: string;
    note?: string;
    resolvedAt?: string;
  };
  preflightOk?: boolean;
  summary?: string;
  phases: ExecutionPhaseRecord[];
  artifacts?: ExecutionArtifactIndex;
  approvals?: ExecutionApproval[];
  runDetail?: Record<string, unknown>;
  reviewDetail?: DeepReviewDetail | Record<string, unknown>;
  auditDetail?: WebAuditRunDetail | Record<string, unknown>;
}
export type RunRecord = ExecutionRunRecord;

export interface ExecutionEvent {
  id: string;
  runId: string;
  projectKey: string;
  type: EventRecordType;
  timestamp: string;
  message?: string;
  data?: Record<string, unknown>;
}
export type EventRecord = ExecutionEvent;

export type PreflightCheckStatus = "pass" | "warn" | "fail";

export interface PreflightCheck {
  id: string;
  label: string;
  status: PreflightCheckStatus;
  detail: string;
}

export interface PreflightReport {
  projectKey: string;
  mode: ExecutionKind;
  checkedAt: string;
  ok: boolean;
  blockingCount: number;
  warningCount: number;
  checks: PreflightCheck[];
  capabilities: Record<ProjectCapabilityKey, ProjectCapability>;
}

export interface ProjectReadiness {
  key: string;
  name: string;
  description: string;
  readinessScore: number;
  manifestComplete: boolean;
  baselineReady: boolean;
  configDrift: boolean;
  missingBaselineFields: string[];
  advancedCapabilities: ProjectCapabilityKey[];
  blockers: string[];
  warnings: string[];
  openFindings: number;
  activeRun: boolean;
  lastRun?: string;
  lastDeepReview?: string;
  manifest: ProjectManifest;
  stats: ProjectStats;
}

export interface PortfolioAuditRow {
  key: string;
  name: string;
  manifestComplete: boolean;
  baselineReady: boolean;
  configDrift: boolean;
  readinessScore: number;
  declaredDevUrl?: string;
  inferredDevUrl?: string;
  effectiveDevUrl?: string;
  derivedValidationProfiles: string[];
  missingBaselineFields: string[];
  driftFields: string[];
  blockers: string[];
}

export interface SystemHealthReport {
  generatedAt: string;
  registeredProjects: number;
  activeRuns: number;
  serverBuilt: boolean;
  webBuilt: boolean;
  authMode: "session";
  sessionCookieName: string;
  capabilities?: {
    browserAutomation: {
      available: boolean;
      adapter: "playwright-package" | "playwright-cli" | "playwright-mcp" | "unavailable";
      reason: string;
    };
    telegramControl?: {
      enabled: boolean;
      running: boolean;
      username?: string;
      allowedChats: number[];
      lastUpdateId?: number;
      lastError?: string;
    };
  };
}
