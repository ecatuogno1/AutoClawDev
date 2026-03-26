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

  // Validation commands
  security_cmd?: string;
  security_dependency_cmd?: string;
  performance_cmd?: string;
  profile_validation?: Record<string, { command: string; relevance_paths: string[]; run_on_baseline: boolean }>;

  // Run defaults
  team_profile?: string;
  speed_profile?: string;
  workflow_type?: string;
  default_cycles?: number;
  max_parallel_cycles?: number;
  batch_research_count?: number;

  // Git/infra
  base_branch?: string;
  integration_branch?: string;
  landing_repo?: string;
  dev_url?: string;

  // Model overrides
  research_model?: string;
  planning_model?: string;
  impl_model?: string;
  review_model?: string;
  codex_model?: string;
  codex_fix_model?: string;
}

export interface ProjectStats {
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  lastExperiment?: Experiment | null;
}

export interface ProjectWithStats extends ProjectConfig {
  stats: ProjectStats;
}

export interface ProjectDetail extends ProjectConfig {
  stats: ProjectStats;
  recentExperiments: Experiment[];
}

export interface Experiment {
  id: string;
  timestamp: string;
  directive: string;
  description: string;
  result: "pass" | "fail";
  metrics_before?: Record<string, number>;
  metrics_after?: Record<string, number>;
  commit?: string;
  elapsed?: number;
  tools?: string[];
  project?: string;
}

export interface GithubData {
  issues: GithubIssue[];
  prs: GithubPR[];
  upstreamIssues: GithubIssue[];
}

export interface GithubIssue {
  number: number;
  title: string;
  labels: Array<{ name: string }>;
  createdAt: string;
}

export interface GithubPR {
  number: number;
  title: string;
  state: string;
  createdAt: string;
}

export interface ActiveRun {
  project: string;
  cycles: number;
  startedAt: string;
}

// Deep Review types
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

// Health Matrix types
export interface ProjectHealth {
  key: string;
  name: string;
  passRate: number;
  totalExperiments: number;
  recentTrend: "improving" | "declining" | "stable" | "unknown";
  lastRun?: string;
  lastDeepReview?: string;
  hasMemory: boolean;
  profiles: Record<string, "pass" | "fail" | "unknown">;
  activeRun: boolean;
}

// Memory types
export interface MemoryFinding {
  title: string;
  directive: string;
  domain: string;
  status: string;
  targetFiles: string[];
  firstSeenExp: string | null;
  lastSeenExp: string | null;
  resolutionCommit: string | null;
  notes: string | null;
  updatedAt: string | null;
}

export interface ProjectMemory {
  project: string;
  summary: string | null;
  updatedAt: string | null;
  sourceCommit: string | null;
  hotspots: Array<{ path: string; count: number }>;
  openFindings: MemoryFinding[];
  resolvedFindings: MemoryFinding[];
  fileMemoryCount: number;
  totalFindings: number;
}

export interface WorkspaceFileEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  language?: string;
}

export interface WorkspaceDirectoryListing {
  path: string;
  entries: WorkspaceFileEntry[];
}

export interface WorkspaceFileContent {
  path: string;
  name: string;
  content: string;
  language: string;
  size: number;
}

export interface WorkspaceGitFileStatus {
  status: string;
  path: string;
}

export interface WorkspaceGitStatus {
  branch: string;
  lastCommit: string;
  files: WorkspaceGitFileStatus[];
  clean: boolean;
  error?: string;
}

export interface SSEEvent {
  type: "output" | "start" | "stop" | "done" | "connected";
  data: {
    project?: string;
    text?: string;
    timestamp: string;
    cycles?: number;
    code?: number;
    kind?: "line" | "phase_start" | "phase_done" | "phase_detail" | "session_start" | "session_end" | "session_line" | "cycle";
    agent?: string;
    tool?: string;
    status?: "working" | "done" | "fail";
    session?: string;
  };
}
