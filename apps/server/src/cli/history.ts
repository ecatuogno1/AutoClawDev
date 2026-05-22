import { listProjectsDetailed } from "../lib/config.js";
import { buildProjectStatsFromRuns, importLegacyHistory } from "../lib/history.js";
import { listRunRecords } from "../lib/runRecords.js";

interface ParsedArgs {
  command: "audit" | "import";
  dryRun: boolean;
  json: boolean;
  project?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    command: "audit",
    dryRun: false,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "audit" || arg === "import") {
      parsed.command = arg;
      continue;
    }
    if (arg === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }
    if (arg === "--json") {
      parsed.json = true;
      continue;
    }
    if (arg === "--project") {
      parsed.project = argv[index + 1];
      index += 1;
    }
  }

  return parsed;
}

function pad(value: string, width: number): string {
  if (value.length >= width) return `${value.slice(0, Math.max(0, width - 1))}\u2026`;
  return value.padEnd(width, " ");
}

async function runAudit(json: boolean) {
  const manifests = await listProjectsDetailed();
  const projects = manifests.map((manifest) => {
    const runs = listRunRecords(manifest.path, 500);
    const stats = buildProjectStatsFromRuns(runs, { project: manifest.key });
    const imported = runs.filter((record) => record.source === "legacy_import").length;
    const native = runs.filter((record) => record.source === "native").length;
    const partial = runs.filter((record) => record.historyCompleteness === "partial").length;
    return {
      key: manifest.key,
      total: stats.total,
      clean: stats.cleanPassed ?? 0,
      degraded: stats.degradedPassed ?? 0,
      failed: stats.failed,
      recovery: stats.recoveryRequired ?? 0,
      imported,
      native,
      partial,
    };
  });

  if (json) {
    console.log(JSON.stringify({ generatedAt: new Date().toISOString(), projects }, null, 2));
    return;
  }

  const header = [
    pad("Project", 24),
    pad("Total", 7),
    pad("Clean", 7),
    pad("Degraded", 10),
    pad("Failed", 8),
    pad("Recovery", 10),
    pad("Imported", 10),
    "Partial",
  ].join("  ");
  console.log(header);
  console.log("-".repeat(header.length));
  for (const row of projects) {
    console.log([
      pad(row.key, 24),
      pad(String(row.total), 7),
      pad(String(row.clean), 7),
      pad(String(row.degraded), 10),
      pad(String(row.failed), 8),
      pad(String(row.recovery), 10),
      pad(String(row.imported), 10),
      String(row.partial),
    ].join("  "));
  }
}

async function runImport(options: { project?: string; dryRun: boolean; json: boolean }) {
  const payload = await importLegacyHistory({
    projectKey: options.project,
    dryRun: options.dryRun,
  });

  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(options.dryRun ? "Legacy history import preview" : "Legacy history import");
  for (const result of payload.projects) {
    console.log(
      `- ${result.key}: ${result.imported} ${options.dryRun ? "would import" : "imported"}, ${result.skipped} skipped, ${result.partialHistory} partial`,
    );
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.command === "audit") {
    await runAudit(args.json);
    return;
  }

  await runImport({
    project: args.project,
    dryRun: args.dryRun,
    json: args.json,
  });
}

void main();
