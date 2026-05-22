import type { ProjectConfig, ProjectManifest } from "@autoclawdev/types";
import {
  getProjectManifest,
  listProjectManifests,
} from "./projectManifest.js";

export async function listProjects(): Promise<ProjectConfig[]> {
  return listProjectManifests();
}

export async function getProject(
  key: string,
): Promise<ProjectConfig | undefined> {
  return getProjectManifest(key);
}

export async function listProjectsDetailed(): Promise<ProjectManifest[]> {
  return listProjectManifests();
}

export async function getProjectDetailed(
  key: string,
): Promise<ProjectManifest | undefined> {
  return getProjectManifest(key);
}
