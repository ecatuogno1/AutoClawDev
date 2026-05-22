export interface DeepReviewManagedPhase {
  name: string;
  status: string;
  detail?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface DeepReviewManagedEvent {
  type: string;
  message?: string;
  timestamp: string;
}

export interface DeepReviewManagedRun {
  runId: string;
  status: string;
  summary?: string;
  workflowType?: string;
  createdAt: string;
  updatedAt: string;
  phases: DeepReviewManagedPhase[];
  latestEvents: DeepReviewManagedEvent[];
}

export interface DeepReviewSession {
  provider: string;
  sessionName: string;
  startedAt: string;
  endedAt?: string;
  exitCode?: number;
  runId?: string;
  runStatus?: string;
  model: string;
  projectPath: string;
  ttyLog: string;
  jsonLog?: string;
  promptSource?: string;
  resumeHint?: string;
  generatedReports?: string[];
  hasAuditReport: boolean;
  hasExecutionPlan: boolean;
  hasProgress: boolean;
}

export interface DeepReviewDetail extends DeepReviewSession {
  auditReport?: string;
  executionPlan?: string;
  progress?: string;
  managedRun?: DeepReviewManagedRun;
}
