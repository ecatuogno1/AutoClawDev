export interface DeepReviewSession {
  provider: string;
  sessionName: string;
  startedAt: string;
  endedAt?: string;
  exitCode?: number;
  model: string;
  projectPath: string;
  ttyLog: string;
  jsonLog?: string;
  hasAuditReport: boolean;
  hasExecutionPlan: boolean;
  hasProgress: boolean;
}

export interface DeepReviewDetail extends DeepReviewSession {
  auditReport?: string;
  executionPlan?: string;
  progress?: string;
}
