import type { Experiment } from "./experiment.js";

export interface ProfileValidationEntry {
  command: string;
  relevance_paths: string[];
  run_on_baseline: boolean;
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
