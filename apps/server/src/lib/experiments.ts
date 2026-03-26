import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { getWorkspaceDir, getWorkspacePath, getProjectExperimentsPath } from "./paths.js";
import { getProject } from "./config.js";

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

const AUTORESEARCH_DIR = getWorkspaceDir();

function normalizeTools(input: unknown): string[] | undefined {
  const tools = Array.isArray(input)
    ? input.map(String)
    : typeof input === "string"
      ? input.split("+")
      : [];

  const normalized = tools
    .map((tool) => tool.trim().toLowerCase())
    .filter(Boolean)
    .map((tool) => {
      switch (tool) {
        case "olivia":
        case "jessica":
        case "penny":
        case "terry":
        case "jerry":
        case "coderabbit":
        case "gemini":
        case "opus":
        case "codex":
          return tool;
        case "claude":
        case "sonnet":
        case "fix":
          return "sonnet";
        default:
          return tool;
      }
    });

  return normalized.length > 0 ? normalized : undefined;
}

function repairMalformedExperimentLine(line: string): string | null {
  const descriptionMarker = '"description":"';
  const resultMarker = '","result":"';
  const descriptionIndex = line.indexOf(descriptionMarker);
  if (descriptionIndex < 0) return null;

  const descriptionStart = descriptionIndex + descriptionMarker.length;
  const resultIndex = line.indexOf(resultMarker, descriptionStart);
  if (resultIndex < 0) return null;

  const rawDescription = line.slice(descriptionStart, resultIndex);
  const repairedDescription = JSON.stringify(rawDescription).slice(1, -1);
  return `${line.slice(0, descriptionStart)}${repairedDescription}${line.slice(resultIndex)}`;
}

function parseExperimentLine(line: string): Experiment | null {
  const candidates = [line, repairMalformedExperimentLine(line)];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate);
      return {
        ...parsed,
        tools: normalizeTools(parsed.tools),
      };
    } catch (err) {
      if (candidate === line) {
        // Only log on the original line (not recovery attempts)
        console.error(`Malformed experiment line: ${(err as Error).message}`);
      }
    }
  }

  return null;
}

async function readExperimentsFromFile(filePath: string, key: string): Promise<Experiment[]> {
  try {
    const raw = await readFile(filePath, "utf-8");
    if (!raw.trim()) return [];
    return raw.trim().split("\n").filter(Boolean)
      .map((line) => parseExperimentLine(line))
      .filter((e): e is Experiment => e !== null)
      .map((e) => ({ ...e, project: key }));
  } catch {
    return [];
  }
}

export async function getExperiments(key: string): Promise<Experiment[]> {
  // Try per-project .autoclaw/ first
  const project = await getProject(key);
  if (project?.path) {
    const newPath = getProjectExperimentsPath(project.path);
    if (existsSync(newPath)) {
      const results = await readExperimentsFromFile(newPath, key);
      // Also check legacy and merge (during migration period)
      const legacyPath = getWorkspacePath(`experiments-${key}.jsonl`);
      if (existsSync(legacyPath)) {
        const legacy = await readExperimentsFromFile(legacyPath, key);
        const seenIds = new Set(results.map((e) => e.id));
        for (const exp of legacy) {
          if (!seenIds.has(exp.id)) results.push(exp);
        }
      }
      return results;
    }
  }
  // Legacy fallback
  return readExperimentsFromFile(getWorkspacePath(`experiments-${key}.jsonl`), key);
}

export async function getAllExperiments(): Promise<Experiment[]> {
  const { readdir } = await import("node:fs/promises");
  try {
    const files = await readdir(AUTORESEARCH_DIR);
    const expFiles = files.filter(
      (f) => f.startsWith("experiments-") && f.endsWith(".jsonl"),
    );
    const all: Experiment[] = [];
    for (const file of expFiles) {
      const key = file.replace("experiments-", "").replace(".jsonl", "");
      const experiments = await getExperiments(key);
      all.push(...experiments);
    }
    all.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    return all;
  } catch {
    return [];
  }
}
