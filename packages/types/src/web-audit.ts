export type WebAuditRunStatus =
  | "queued"
  | "running"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "cancelled";

export type WebAuditSeverity = "critical" | "high" | "medium" | "low" | "info";

export type WebAuditRiskLevel = "critical" | "high" | "medium" | "low" | "info";

export type WebAuditModuleClass =
  | "recon"
  | "browser"
  | "api"
  | "auth"
  | "analysis"
  | "advanced"
  | "operator"
  | "reporting";

export type WebAuditModuleStatus = "queued" | "running" | "completed" | "failed" | "skipped";

export type WebAuditEventType =
  | "module.started"
  | "module.completed"
  | "evidence.discovered"
  | "finding.opened"
  | "finding.updated"
  | "escalation.requested"
  | "escalation.approved"
  | "auth.session_ready"
  | "operator.command_started"
  | "operator.command_completed"
  | "run.note"
  | "run.completed"
  | "run.failed";

export interface WebAuditTarget {
  url: string;
  hostname: string;
  projectKey?: string;
  label?: string;
}

export interface WebAuditPolicy {
  version: number;
  targetScope: string[];
  allowedModuleClasses: WebAuditModuleClass[];
  browserEnabled: boolean;
  apiEnabled: boolean;
  ownedTarget: boolean;
  authorizationNote?: string;
  maxConcurrency: number;
  requestBudget: number;
  rateLimitPerSecond: number;
  allowDestructiveActions: boolean;
  operatorCommandBudget: number;
  operatorAllowedCommands: string[];
  approvalRequiredFor: string[];
  escalationApprovals: Record<string, boolean>;
}

export interface WebAuditSession {
  id: string;
  kind: "anonymous" | "token" | "cookie" | "api_key" | "login_recipe" | "browser_agent";
  label: string;
  reused: boolean;
  privilegeLevel?: "anonymous" | "authenticated" | "privileged";
  browserStatePath?: string;
  httpHeaders?: Record<string, string>;
  cookies?: string[];
  observedRoutes?: string[];
  createdAt: string;
}

export interface WebAuditOperatorCommand {
  id: string;
  command: string;
  moduleId: string;
  startedAt: string;
  completedAt?: string;
  exitCode?: number;
  status: "running" | "completed" | "failed";
  stdoutExcerpt?: string;
  stderrExcerpt?: string;
}

export interface WebAuditEvidence {
  id: string;
  runId: string;
  timestamp: string;
  kind: string;
  moduleId: string;
  severityHint?: WebAuditSeverity;
  url?: string;
  title: string;
  summary: string;
  data: Record<string, unknown>;
}

export interface WebAuditFinding {
  id: string;
  runId: string;
  ruleId: string;
  createdAt: string;
  updatedAt: string;
  severity: WebAuditSeverity;
  confidence: number;
  exploitability: number;
  moduleId: string;
  title: string;
  summary: string;
  remediation: string;
  evidenceIds: string[];
  authContext: "anonymous" | "authenticated";
  status: "open" | "updated";
}

export interface WebAuditHypothesis {
  id: string;
  createdAt: string;
  provider: "heuristic" | "claude" | "codex" | "shell";
  model: string;
  hypothesis: string;
  correlationGroup: string;
  confidence: number;
  recommendedNextModule?: string;
  rationale: string;
}

export interface WebAuditModuleRecord {
  id: string;
  label: string;
  className: WebAuditModuleClass;
  status: WebAuditModuleStatus;
  startedAt?: string;
  completedAt?: string;
  detail?: string;
}

export interface WebAuditRiskSummary {
  score: number;
  level: WebAuditRiskLevel;
  findingCounts: Record<WebAuditSeverity, number>;
}

export interface WebAuditExportPaths {
  json?: string;
  html?: string;
  markdown?: string;
  pdf?: string;
}

export interface WebAuditRunSummary {
  id: string;
  projectKey?: string;
  target: WebAuditTarget;
  policy: WebAuditPolicy;
  status: WebAuditRunStatus;
  mode: "triage" | "deep";
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  artifactRoot: string;
  currentPhase: string;
  summary?: string;
  findingsCount: number;
  evidenceCount: number;
  approvalsPending: string[];
  approvedGates: string[];
  authContexts: WebAuditSession[];
  risk: WebAuditRiskSummary;
  exports: WebAuditExportPaths;
  modules: WebAuditModuleRecord[];
  latestHypothesis?: WebAuditHypothesis;
}

export interface WebAuditRunDetail extends WebAuditRunSummary {
  findings: WebAuditFinding[];
  evidence: WebAuditEvidence[];
  hypotheses: WebAuditHypothesis[];
  operatorCommands: WebAuditOperatorCommand[];
  session?: WebAuditSession;
}

export interface WebAuditEvent {
  id: string;
  runId: string;
  projectKey?: string;
  timestamp: string;
  type: WebAuditEventType;
  message: string;
  data?: Record<string, unknown>;
}
