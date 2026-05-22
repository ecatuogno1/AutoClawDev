import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { RunRecord } from "@autoclawdev/types";
import {
  appendRunEvent,
  createRunId,
  listRunRecords,
  readRunEvents,
  readRunRecord,
  updateRunRecord,
  writeRunRecord,
} from "../src/lib/runRecords.ts";

test("run records persist metadata and event ledgers", () => {
  const projectDir = mkdtempSync(join(tmpdir(), "autoclaw-runs-"));
  mkdirSync(join(projectDir, ".autoclaw"), { recursive: true });

  const runId = createRunId("sample");
  const now = new Date().toISOString();
  const record: RunRecord = {
    id: runId,
    projectKey: "sample",
    mode: "run",
    status: "queued",
    source: "native",
    cycles: 2,
    workflowType: "standard",
    teamProfile: "reliability",
    createdAt: now,
    updatedAt: now,
    artifactRoot: join(projectDir, ".autoclaw", "runs", runId),
    manifestSource: join(projectDir, ".autoclaw", "config.json"),
    historyCompleteness: "full",
    preflightOk: true,
    phases: [],
  };

  writeRunRecord(projectDir, record);
  appendRunEvent(projectDir, {
    id: `${runId}-queued`,
    runId,
    projectKey: "sample",
    type: "queued",
    timestamp: now,
    message: "Queued",
  });

  updateRunRecord(projectDir, runId, (current) => ({
    ...current,
    status: "running",
  }));

  const stored = readRunRecord(projectDir, runId);
  assert.ok(stored);
  assert.equal(stored.status, "running");

  const records = listRunRecords(projectDir);
  assert.equal(records.length, 1);
  assert.equal(records[0]?.id, runId);

  const events = readRunEvents(projectDir, runId);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.type, "queued");

  rmSync(projectDir, { recursive: true, force: true });
});
