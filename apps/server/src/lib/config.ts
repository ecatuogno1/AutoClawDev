import { readdir, readFile } from "node:fs/promises";
import { getProjectsDir, getProjectsPath } from "./paths.js";

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

  // Validation commands
  security_cmd?: string;
  security_dependency_cmd?: string;
  performance_cmd?: string;
  profile_validation?: Record<string, ProfileValidationEntry>;

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

const PROJECTS_DIR = getProjectsDir();

export async function listProjects(): Promise<ProjectConfig[]> {
  try {
    const files = await readdir(PROJECTS_DIR);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));
    const projects: ProjectConfig[] = [];
    for (const file of jsonFiles) {
      try {
        const raw = await readFile(getProjectsPath(file), "utf-8");
        const data = JSON.parse(raw);
        const key = file.replace(/\.json$/, "");
        projects.push({ key, ...data });
      } catch {
        // skip malformed files
      }
    }
    return projects;
  } catch {
    return [];
  }
}

export async function getProject(
  key: string,
): Promise<ProjectConfig | undefined> {
  try {
    const raw = await readFile(getProjectsPath(`${key}.json`), "utf-8");
    const data = JSON.parse(raw);
    return { key, ...data };
  } catch {
    return undefined;
  }
}
