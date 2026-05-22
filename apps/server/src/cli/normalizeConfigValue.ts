import process from "node:process";
import {
  isKnownSpeedProfileInput,
  isKnownTeamProfileInput,
  isKnownWorkflowTypeInput,
  normalizeSpeedProfile,
  normalizeTeamProfile,
  normalizeWorkflowType,
  normalizedSpeedProfiles,
  normalizedTeamProfiles,
  normalizedWorkflowTypes,
} from "@autoclawdev/types";

type Kind = "team" | "speed" | "workflow";

function parseArgs(argv: string[]) {
  const args = {
    kind: undefined as Kind | undefined,
    value: "",
    strict: false,
    list: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--strict") {
      args.strict = true;
      continue;
    }
    if (token === "--list") {
      args.list = true;
      continue;
    }
    if (token === "--kind") {
      const kind = argv[index + 1];
      if (kind === "team" || kind === "speed" || kind === "workflow") {
        args.kind = kind;
      }
      index += 1;
      continue;
    }
    if (token === "--value") {
      args.value = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
  }

  return args;
}

function usage(): never {
  process.stderr.write(
    "Usage: normalizeConfigValue.ts --kind team|speed|workflow [--value VALUE] [--strict|--list]\n",
  );
  process.exit(2);
}

function listValues(kind: Kind): string[] {
  switch (kind) {
    case "team":
      return normalizedTeamProfiles;
    case "speed":
      return normalizedSpeedProfiles;
    case "workflow":
      return normalizedWorkflowTypes;
  }
}

function normalize(kind: Kind, value: string): string {
  switch (kind) {
    case "team":
      return normalizeTeamProfile(value);
    case "speed":
      return normalizeSpeedProfile(value);
    case "workflow":
      return normalizeWorkflowType(value);
  }
}

function isKnown(kind: Kind, value: string): boolean {
  switch (kind) {
    case "team":
      return isKnownTeamProfileInput(value);
    case "speed":
      return isKnownSpeedProfileInput(value);
    case "workflow":
      return isKnownWorkflowTypeInput(value);
  }
}

const args = parseArgs(process.argv.slice(2));
if (!args.kind) {
  usage();
}

if (args.list) {
  process.stdout.write(`${listValues(args.kind).join("\n")}\n`);
  process.exit(0);
}

if (args.strict && args.value.trim() && !isKnown(args.kind, args.value)) {
  process.exit(1);
}

process.stdout.write(normalize(args.kind, args.value));
