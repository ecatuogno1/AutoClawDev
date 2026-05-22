export type RunOutputKind =
  | "line"
  | "phase_start"
  | "phase_done"
  | "phase_detail"
  | "session_start"
  | "session_end"
  | "session_line"
  | "cycle";

export type RunOutputStatus = "working" | "done" | "fail";

export interface ActiveRun {
  runId?: string;
  project: string;
  cycles: number;
  startedAt: string;
}

export interface RunOutputEvent {
  runId?: string;
  project: string;
  text: string;
  timestamp: string;
  kind?: RunOutputKind;
  agent?: string;
  tool?: string;
  status?: RunOutputStatus;
  session?: string;
}

export type SSEEventType = "output" | "start" | "stop" | "done" | "connected";

export interface SSEEventData {
  runId?: string;
  project?: string;
  text?: string;
  timestamp: string;
  cycles?: number;
  code?: number;
  kind?: RunOutputKind;
  agent?: string;
  tool?: string;
  status?: RunOutputStatus;
  session?: string;
}

export interface SSEEvent {
  type: SSEEventType;
  data: SSEEventData;
}
