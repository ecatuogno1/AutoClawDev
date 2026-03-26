export type ExperimentResult = "pass" | "fail";

export type ExperimentDomain = "backend" | "frontend" | "unknown";

export interface Experiment {
  id: string;
  timestamp: string;
  directive: string;
  description: string;
  result: ExperimentResult;
  metrics_before?: Record<string, number>;
  metrics_after?: Record<string, number>;
  commit?: string;
  elapsed?: number;
  tools?: string[];
  project?: string;
  domain?: ExperimentDomain;
  gh_issue?: string | number;
}
