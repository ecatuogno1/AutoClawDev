import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import type {
  WebAuditEvent,
  WebAuditEvidence,
  WebAuditFinding,
  WebAuditHypothesis,
  WebAuditOperatorCommand,
  WebAuditRunDetail,
  WebAuditRunSummary,
} from "@autoclawdev/types";
import {
  getProjectWebAuditEvidencePath,
  getProjectWebAuditEventsPath,
  getProjectWebAuditFindingsPath,
  getProjectWebAuditHypothesesPath,
  getProjectWebAuditOperatorCommandsPath,
  getProjectWebAuditRecordPath,
  getProjectWebAuditRunDir,
  getProjectWebAuditsDir,
} from "./paths.js";

function ensureDir(path: string) {
  mkdirSync(path, { recursive: true });
}

function readJsonFile<T>(path: string, fallback: T): T {
  if (!existsSync(path)) {
    return fallback;
  }

  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function readJsonFileFromRoot<T>(root: string, name: string, fallback: T): T {
  return readJsonFile(`${root}/${name}`, fallback);
}

export function createWebAuditRunId(projectKey: string): string {
  return `wa-${projectKey}-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

export function writeWebAuditRunRecord(
  projectPath: string,
  record: WebAuditRunSummary,
): WebAuditRunSummary {
  ensureDir(getProjectWebAuditRunDir(projectPath, record.id));
  writeFileSync(
    getProjectWebAuditRecordPath(projectPath, record.id),
    `${JSON.stringify(record, null, 2)}\n`,
    "utf-8",
  );
  return record;
}

export function readWebAuditRunRecord(
  projectPath: string,
  runId: string,
): WebAuditRunSummary | undefined {
  const path = getProjectWebAuditRecordPath(projectPath, runId);
  if (!existsSync(path)) {
    return undefined;
  }

  try {
    return JSON.parse(readFileSync(path, "utf-8")) as WebAuditRunSummary;
  } catch {
    return undefined;
  }
}

export function updateWebAuditRunRecord(
  projectPath: string,
  runId: string,
  updater: (record: WebAuditRunSummary) => WebAuditRunSummary,
): WebAuditRunSummary | undefined {
  const current = readWebAuditRunRecord(projectPath, runId);
  if (!current) {
    return undefined;
  }

  const next = updater(current);
  next.updatedAt = new Date().toISOString();
  return writeWebAuditRunRecord(projectPath, next);
}

export function appendWebAuditEvent(projectPath: string, event: WebAuditEvent): void {
  ensureDir(getProjectWebAuditRunDir(projectPath, event.runId));
  appendFileSync(
    getProjectWebAuditEventsPath(projectPath, event.runId),
    `${JSON.stringify(event)}\n`,
    "utf-8",
  );
}

export function readWebAuditEvents(
  projectPath: string,
  runId: string,
): WebAuditEvent[] {
  const path = getProjectWebAuditEventsPath(projectPath, runId);
  if (!existsSync(path)) {
    return [];
  }

  try {
    return readFileSync(path, "utf-8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as WebAuditEvent);
  } catch {
    return [];
  }
}

export function writeWebAuditFindings(
  projectPath: string,
  runId: string,
  findings: WebAuditFinding[],
): void {
  ensureDir(getProjectWebAuditRunDir(projectPath, runId));
  writeFileSync(
    getProjectWebAuditFindingsPath(projectPath, runId),
    `${JSON.stringify(findings, null, 2)}\n`,
    "utf-8",
  );
}

export function readWebAuditFindings(
  projectPath: string,
  runId: string,
): WebAuditFinding[] {
  return readJsonFile(getProjectWebAuditFindingsPath(projectPath, runId), []);
}

export function writeWebAuditEvidence(
  projectPath: string,
  runId: string,
  evidence: WebAuditEvidence[],
): void {
  ensureDir(getProjectWebAuditRunDir(projectPath, runId));
  writeFileSync(
    getProjectWebAuditEvidencePath(projectPath, runId),
    `${JSON.stringify(evidence, null, 2)}\n`,
    "utf-8",
  );
}

export function readWebAuditEvidence(
  projectPath: string,
  runId: string,
): WebAuditEvidence[] {
  return readJsonFile(getProjectWebAuditEvidencePath(projectPath, runId), []);
}

export function writeWebAuditHypotheses(
  projectPath: string,
  runId: string,
  hypotheses: WebAuditHypothesis[],
): void {
  ensureDir(getProjectWebAuditRunDir(projectPath, runId));
  writeFileSync(
    getProjectWebAuditHypothesesPath(projectPath, runId),
    `${JSON.stringify(hypotheses, null, 2)}\n`,
    "utf-8",
  );
}

export function readWebAuditHypotheses(
  projectPath: string,
  runId: string,
): WebAuditHypothesis[] {
  return readJsonFile(getProjectWebAuditHypothesesPath(projectPath, runId), []);
}

export function writeWebAuditOperatorCommands(
  projectPath: string,
  runId: string,
  commands: WebAuditOperatorCommand[],
): void {
  ensureDir(getProjectWebAuditRunDir(projectPath, runId));
  writeFileSync(
    getProjectWebAuditOperatorCommandsPath(projectPath, runId),
    `${JSON.stringify(commands, null, 2)}\n`,
    "utf-8",
  );
}

export function readWebAuditOperatorCommands(
  projectPath: string,
  runId: string,
): WebAuditOperatorCommand[] {
  return readJsonFile(getProjectWebAuditOperatorCommandsPath(projectPath, runId), []);
}

export function listProjectWebAuditRuns(
  projectPath: string,
  limit = 25,
): WebAuditRunSummary[] {
  const auditsDir = getProjectWebAuditsDir(projectPath);
  if (!existsSync(auditsDir)) {
    return [];
  }

  return readdirSync(auditsDir)
    .map((entry) => readWebAuditRunRecord(projectPath, entry))
    .filter((record): record is WebAuditRunSummary => Boolean(record))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export function readWebAuditRunDetail(
  projectPath: string,
  runId: string,
): WebAuditRunDetail | undefined {
  const record = readWebAuditRunRecord(projectPath, runId);
  if (!record) {
    return undefined;
  }

  return {
    ...record,
    findings: readWebAuditFindings(projectPath, runId),
    evidence: readWebAuditEvidence(projectPath, runId),
    hypotheses: readWebAuditHypotheses(projectPath, runId),
    operatorCommands: readWebAuditOperatorCommands(projectPath, runId),
  };
}

export function readWebAuditRunDetailFromRoot(
  artifactRoot: string,
): WebAuditRunDetail | undefined {
  const record = readJsonFileFromRoot<WebAuditRunDetail | null>(artifactRoot, "run.json", null);
  if (!record) {
    return undefined;
  }

  return {
    ...record,
    findings: readJsonFileFromRoot(artifactRoot, "findings.json", []),
    evidence: readJsonFileFromRoot(artifactRoot, "evidence.json", []),
    hypotheses: readJsonFileFromRoot(artifactRoot, "hypotheses.json", []),
    operatorCommands: readJsonFileFromRoot(artifactRoot, "operator-commands.json", []),
  };
}

export function updateWebAuditRunRecordFromRoot(
  artifactRoot: string,
  updater: (record: WebAuditRunSummary) => WebAuditRunSummary,
): WebAuditRunSummary | undefined {
  const record = readJsonFileFromRoot<WebAuditRunSummary | null>(artifactRoot, "run.json", null);
  if (!record) {
    return undefined;
  }

  const next = updater(record);
  next.updatedAt = new Date().toISOString();
  writeFileSync(
    `${artifactRoot}/run.json`,
    `${JSON.stringify(next, null, 2)}\n`,
    "utf-8",
  );
  return next;
}

export function readWebAuditEventsFromRoot(artifactRoot: string): WebAuditEvent[] {
  const path = `${artifactRoot}/events.jsonl`;
  if (!existsSync(path)) {
    return [];
  }

  try {
    return readFileSync(path, "utf-8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as WebAuditEvent);
  } catch {
    return [];
  }
}
