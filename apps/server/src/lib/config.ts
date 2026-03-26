import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ProjectConfig } from "@autoclawdev/types";
import { getProjectsDir, getProjectsPath } from "./paths.js";

const PROJECTS_DIR = getProjectsDir();

async function tryReadProjectConfig(
  filePath: string,
  key: string,
): Promise<ProjectConfig | null> {
  try {
    const raw = await readFile(filePath, "utf-8");
    const data = JSON.parse(raw);
    return { key, ...data };
  } catch {
    return null;
  }
}

export async function listProjects(): Promise<ProjectConfig[]> {
  const projects: ProjectConfig[] = [];
  const seenKeys = new Set<string>();

  // Read from legacy projects dir
  try {
    const files = await readdir(PROJECTS_DIR);
    for (const file of files.filter((f) => f.endsWith(".json"))) {
      const key = file.replace(/\.json$/, "");
      const config = await tryReadProjectConfig(
        getProjectsPath(file),
        key,
      );
      if (config) {
        // Also check for .autoclaw/config.json in the project path and merge
        if (config.path) {
          const localConfig = await tryReadProjectConfig(
            join(config.path, ".autoclaw", "config.json"),
            key,
          );
          if (localConfig) {
            Object.assign(config, localConfig, { key });
          }
        }
        projects.push(config);
        seenKeys.add(key);
      }
    }
  } catch {
    // projects dir may not exist
  }

  return projects;
}

export async function getProject(
  key: string,
): Promise<ProjectConfig | undefined> {
  // Try legacy location first (it has the path we need)
  const legacyConfig = await tryReadProjectConfig(
    getProjectsPath(`${key}.json`),
    key,
  );

  if (legacyConfig?.path) {
    // Check for .autoclaw/config.json override
    const localPath = join(legacyConfig.path, ".autoclaw", "config.json");
    if (existsSync(localPath)) {
      const localConfig = await tryReadProjectConfig(localPath, key);
      if (localConfig) {
        return { ...legacyConfig, ...localConfig, key };
      }
    }
    return legacyConfig;
  }

  return legacyConfig ?? undefined;
}
