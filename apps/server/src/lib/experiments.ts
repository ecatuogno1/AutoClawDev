import { readFile } from "node:fs/promises";
import { getWorkspaceDir, getWorkspacePath } from "./paths.js";

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
    } catch {
      // Try the next recovery strategy.
    }
  }

  return null;
}

export async function getExperiments(key: string): Promise<Experiment[]> {
  try {
    const filePath = getWorkspacePath(`experiments-${key}.jsonl`);
    const raw = await readFile(filePath, "utf-8");
    if (!raw.trim()) return [];
    const lines = raw.trim().split("\n").filter(Boolean);
    const experiments: Experiment[] = [];

    for (const line of lines) {
      const parsed = parseExperimentLine(line);
      if (!parsed) continue;
      experiments.push({
        ...parsed,
        project: key,
      });
    }

    return experiments;
  } catch {
    return [];
  }
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
