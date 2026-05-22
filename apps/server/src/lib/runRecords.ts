import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  readdirSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import type { EventRecord, RunRecord } from "@autoclawdev/types";
import {
  getProjectRunDir,
  getProjectRunEventsPath,
  getProjectRunRecordPath,
  getProjectRunsDir,
} from "./paths.js";

function ensureDir(path: string) {
  mkdirSync(path, { recursive: true });
}

export function createRunId(projectKey: string): string {
  return `${projectKey}-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

export function writeRunRecord(projectPath: string, record: RunRecord): RunRecord {
  ensureDir(getProjectRunDir(projectPath, record.id));
  writeFileSync(
    getProjectRunRecordPath(projectPath, record.id),
    `${JSON.stringify(record, null, 2)}\n`,
    "utf-8",
  );
  return record;
}

export function readRunRecord(
  projectPath: string,
  runId: string,
): RunRecord | undefined {
  const recordPath = getProjectRunRecordPath(projectPath, runId);
  if (!existsSync(recordPath)) return undefined;
  try {
    return JSON.parse(readFileSync(recordPath, "utf-8")) as RunRecord;
  } catch {
    return undefined;
  }
}

export function updateRunRecord(
  projectPath: string,
  runId: string,
  updater: (record: RunRecord) => RunRecord,
): RunRecord | undefined {
  const current = readRunRecord(projectPath, runId);
  if (!current) return undefined;
  const next = updater(current);
  next.updatedAt = new Date().toISOString();
  return writeRunRecord(projectPath, next);
}

export function appendRunEvent(projectPath: string, event: EventRecord): void {
  ensureDir(getProjectRunDir(projectPath, event.runId));
  appendFileSync(
    getProjectRunEventsPath(projectPath, event.runId),
    `${JSON.stringify(event)}\n`,
    "utf-8",
  );
}

export function replaceRunEvents(
  projectPath: string,
  runId: string,
  events: EventRecord[],
): void {
  ensureDir(getProjectRunDir(projectPath, runId));
  writeFileSync(
    getProjectRunEventsPath(projectPath, runId),
    events.map((event) => JSON.stringify(event)).join("\n").concat(events.length > 0 ? "\n" : ""),
    "utf-8",
  );
}

export function listRunRecords(
  projectPath: string,
  limit = 25,
): RunRecord[] {
  const runsDir = getProjectRunsDir(projectPath);
  if (!existsSync(runsDir)) return [];

  return readdirSync(runsDir)
    .map((entry) => readRunRecord(projectPath, entry))
    .filter((record): record is RunRecord => Boolean(record))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export function readRunEvents(
  projectPath: string,
  runId: string,
): EventRecord[] {
  const eventsPath = getProjectRunEventsPath(projectPath, runId);
  if (!existsSync(eventsPath)) return [];

  try {
    return readFileSync(eventsPath, "utf-8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as EventRecord);
  } catch {
    return [];
  }
}
