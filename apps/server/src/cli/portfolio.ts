import { listProjectsDetailed } from "../lib/config.js";
import { listPortfolioAuditRows } from "../lib/orchestrator.js";
import { syncCompatibilityConfig } from "../lib/portfolio.js";

interface ParsedArgs {
  command: "audit" | "sync";
  dryRun: boolean;
  json: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    command: "audit",
    dryRun: false,
    json: false,
  };

  for (const arg of argv) {
    if (arg === "audit" || arg === "sync") {
      parsed.command = arg;
      continue;
    }
    if (arg === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }
    if (arg === "--json") {
      parsed.json = true;
    }
  }

  return parsed;
}

function pad(value: string, width: number): string {
  if (value.length >= width) {
    return `${value.slice(0, Math.max(0, width - 1))}\u2026`;
  }
  return value.padEnd(width, " ");
}

function printAuditTable(rows: Awaited<ReturnType<typeof listPortfolioAuditRows>>) {
  const header = [
    pad("Project", 24),
    pad("Complete", 10),
    pad("Baseline", 10),
    pad("Drift", 7),
    pad("Dev URL", 24),
    pad("Derived", 20),
    "Missing",
  ].join("  ");

  console.log(header);
  console.log("-".repeat(header.length));

  for (const row of rows) {
    console.log(
      [
        pad(row.key, 24),
        pad(row.manifestComplete ? "yes" : "no", 10),
        pad(row.baselineReady ? "yes" : "no", 10),
        pad(row.configDrift ? "yes" : "no", 7),
        pad(row.effectiveDevUrl ?? "-", 24),
        pad(row.derivedValidationProfiles.join(",") || "-", 20),
        row.missingBaselineFields.join(", ") || "-",
      ].join("  "),
    );
  }
}

async function runAudit(json: boolean) {
  const rows = await listPortfolioAuditRows();
  if (json) {
    console.log(JSON.stringify({ generatedAt: new Date().toISOString(), projects: rows }, null, 2));
    return;
  }
  printAuditTable(rows);
}

async function runSync(options: { dryRun: boolean; json: boolean }) {
  const manifests = await listProjectsDetailed();
  const results = manifests.map((manifest) =>
    syncCompatibilityConfig({ manifest, dryRun: options.dryRun }),
  );

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          dryRun: options.dryRun,
          results,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(options.dryRun ? "Compatibility sync preview" : "Compatibility sync");
  for (const result of results) {
    console.log(
      `- ${result.key}: ${result.changed ? (options.dryRun ? "would update" : "updated") : "unchanged"} (${result.path})`,
    );
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.command === "audit") {
    await runAudit(args.json);
    return;
  }

  await runSync({ dryRun: args.dryRun, json: args.json });
}

void main();
