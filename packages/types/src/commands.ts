import type {
  EventRecord,
  PreflightReport,
  RunMode,
  RunRecord,
} from "./control-plane.js";
import type { ProjectConfig, ProjectDetail } from "./project.js";
import type { DeepReviewDetail } from "./review.js";
import type { ActiveRun } from "./sse.js";
import type { WebAuditRunDetail } from "./web-audit.js";

export type RemoteCommandName =
  | "projects"
  | "status"
  | "preflight"
  | "run"
  | "review"
  | "build"
  | "audit"
  | "stop"
  | "approve"
  | "resume"
  | "run-detail"
  | "events"
  | "review-latest"
  | "audit-latest";

export interface RemoteCommandArgument {
  name: string;
  type: "string" | "number" | "boolean" | "string[]";
  required?: boolean;
  description: string;
}

export interface RemoteCommandDefinition {
  name: RemoteCommandName;
  slash: `/${string}`;
  category: "project" | "execution" | "approval" | "inspection";
  description: string;
  arguments: RemoteCommandArgument[];
}

export interface RemoteCommandInput {
  command: RemoteCommandName;
  project?: string;
  runId?: string;
  mode?: RunMode;
  cycles?: number;
  target?: string;
  auditMode?: "triage" | "deep";
  ownedTarget?: boolean;
  authorizationNote?: string;
  gate?: string;
  approveGates?: string[];
}

export interface RemoteCommandOutputMap {
  projects: { projects: ProjectConfig[] | ProjectDetail[] };
  status: { active: ActiveRun[]; runs: RunRecord[] };
  preflight: { preflight: PreflightReport };
  run: { run: RunRecord; preflight: PreflightReport };
  review: { run: RunRecord; preflight: PreflightReport };
  build: { run: RunRecord; preflight: PreflightReport };
  audit: { run: RunRecord; preflight: PreflightReport };
  stop: { ok: boolean; project: string };
  approve: { run: RunRecord };
  resume: { run: RunRecord };
  "run-detail": { run: RunRecord; events: EventRecord[]; auditDetail?: WebAuditRunDetail | null };
  events: { events: EventRecord[] };
  "review-latest": { review: DeepReviewDetail | null };
  "audit-latest": { audit: WebAuditRunDetail | null };
}

export interface RemoteCommandResult<T = unknown> {
  ok: boolean;
  command: RemoteCommandName;
  message: string;
  data?: T;
}
