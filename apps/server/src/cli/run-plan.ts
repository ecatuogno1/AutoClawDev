import { resolveRunRequest } from "../lib/orchestrator.js";

interface ParsedArgs {
  project?: string;
  cycles?: number;
  mode: "run" | "review" | "build";
  json: boolean;
  enforce: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    mode: "run",
    json: false,
    enforce: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--project":
        parsed.project = argv[index + 1];
        index += 1;
        break;
      case "--cycles":
        parsed.cycles = Number(argv[index + 1]);
        index += 1;
        break;
      case "--mode":
        if (
          argv[index + 1] === "run" ||
          argv[index + 1] === "review" ||
          argv[index + 1] === "build"
        ) {
          parsed.mode = argv[index + 1] as "run" | "review" | "build";
        }
        index += 1;
        break;
      case "--json":
        parsed.json = true;
        break;
      case "--enforce":
        parsed.enforce = true;
        break;
      default:
        if (!arg.startsWith("--") && !parsed.project) {
          parsed.project = arg;
        }
        break;
    }
  }

  return parsed;
}

function printText(payload: Awaited<ReturnType<typeof resolveRunRequest>>) {
  const { plan, preflight, record } = payload;
  console.log(`Project: ${plan.projectKey}`);
  console.log(`Mode: ${plan.mode}`);
  console.log(`Cycles: ${plan.cycles}`);
  console.log(`Workflow: ${plan.workflowType}`);
  console.log(`Team profile: ${plan.teamProfile}`);
  console.log(`Run ID: ${record.id}`);
  console.log(`Artifact root: ${plan.artifactRoot}`);
  console.log(`Phases: ${plan.phases.join(" -> ")}`);
  console.log("");
  console.log(`Preflight: ${preflight.ok ? "PASS" : "FAIL"} (${preflight.blockingCount} blocking, ${preflight.warningCount} warnings)`);
  for (const check of preflight.checks) {
    console.log(`- [${check.status}] ${check.label}: ${check.detail}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.project) {
    console.error("Usage: node run-plan.js --project <key> [--cycles N] [--mode run|review|build] [--json] [--enforce]");
    process.exitCode = 1;
    return;
  }

  const payload = await resolveRunRequest({
    projectKey: args.project,
    cycles: args.cycles,
    mode: args.mode,
  });

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    printText(payload);
  }

  if (args.enforce && !payload.preflight.ok) {
    process.exitCode = 2;
  }
}

void main();
