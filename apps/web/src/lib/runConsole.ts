import type { SSEEvent } from "@/types";

export type RunStatus = NonNullable<SSEEvent["data"]["status"]>;
export type RunOutputKind = NonNullable<SSEEvent["data"]["kind"]>;
export type RunEventType = SSEEvent["type"];

export interface RunConsoleEvent {
  id: string;
  type: RunEventType;
  timestamp: string;
  project?: string;
  text?: string;
  cycles?: number;
  code?: number;
  kind?: RunOutputKind;
  agent?: string;
  tool?: string;
  status?: RunStatus;
  session?: string;
}

export interface PhaseDefinition {
  icon: string;
  key: string;
  name: string;
  tool: string;
  role: string;
}

export const PHASES: PhaseDefinition[] = [
  { icon: "🔎", key: "olivia", name: "Olivia", tool: "opus", role: "Research" },
  { icon: "🧭", key: "jessica", name: "Jessica", tool: "opus", role: "Planning" },
  { icon: "🛠️", key: "terry", name: "Terry", tool: "codex", role: "Backend" },
  { icon: "🎨", key: "jerry", name: "Jerry", tool: "codex", role: "Frontend" },
  { icon: "🐰", key: "review", name: "Review", tool: "coderabbit", role: "Code Review" },
  { icon: "🔧", key: "fix", name: "Fix", tool: "sonnet", role: "Fix Issues" },
  { icon: "🧐", key: "penny", name: "Penny", tool: "opus", role: "Deep Review" },
  { icon: "👁️", key: "visual", name: "Visual", tool: "opus", role: "Frontend Check" },
  { icon: "🧪", key: "tests", name: "Tests", tool: "direct", role: "Test Suite" },
  { icon: "🛡️", key: "lint", name: "Lint", tool: "direct", role: "Lint Check" },
  { icon: "🚀", key: "commit", name: "Commit", tool: "git", role: "Release" },
];

export interface RunTimelineSystemItem {
  id: string;
  type: "system";
  event: RunConsoleEvent;
}

export interface RunTimelineMessageItem {
  id: string;
  type: "message";
  event: RunConsoleEvent;
  phaseIdx: number;
}

export interface RunTimelineSessionItem {
  id: string;
  type: "session";
  event: RunConsoleEvent;
  phaseIdx: number;
  lines: RunConsoleEvent[];
  previewLines: RunConsoleEvent[];
  hiddenLineCount: number;
  closed: boolean;
  endEvent?: RunConsoleEvent;
}

export type RunTimelineItem =
  | RunTimelineSystemItem
  | RunTimelineMessageItem
  | RunTimelineSessionItem;

export function hydrateOutputEvent(
  data: SSEEvent["data"],
  key: string,
): RunConsoleEvent {
  return {
    id: key,
    type: "output",
    ...data,
  };
}

export function hydrateSystemEvent(
  type: Exclude<RunEventType, "output">,
  data: SSEEvent["data"],
  key: string,
): RunConsoleEvent {
  return {
    id: key,
    type,
    ...data,
  };
}

export function resolvePhaseIndex(event: {
  kind?: string;
  agent?: string;
  tool?: string;
  session?: string;
  text?: string;
}): number {
  const agent = event.agent?.toLowerCase() ?? "";
  const session = event.session?.toLowerCase() ?? "";
  const text = event.text?.toLowerCase() ?? "";

  if (session.includes("visual") || agent === "visual") return 7;
  if (agent === "olivia") return 0;
  if (agent === "jessica") return 1;
  if (agent === "terry") return 2;
  if (agent === "jerry") return 3;
  if (agent === "review" || agent === "coderabbit" || session.includes("coderabbit")) return 4;
  if (agent === "fix" || session.includes("fix/sonnet")) return 5;
  if (agent === "penny") return 6;
  if (agent === "tests" || text.includes("running suite") || text.includes("re-running (fix")) return 8;
  if (agent === "lint") return 9;
  if (agent === "commit" || agent === "revert") return 10;
  return -1;
}

export function getPhaseCounts(events: RunConsoleEvent[]): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const event of events) {
    const phaseIdx = resolvePhaseIndex(event);
    if (phaseIdx >= 0) {
      counts[phaseIdx] = (counts[phaseIdx] ?? 0) + 1;
    }
  }
  return counts;
}

export function buildRunTimeline(events: RunConsoleEvent[]): RunTimelineItem[] {
  const items: RunTimelineItem[] = [];
  const sessionMap = new Map<string, RunTimelineSessionItem>();

  for (const event of events) {
    const phaseIdx = resolvePhaseIndex(event);
    const sessionKey = `${event.project ?? ""}:${event.session ?? ""}`;

    if (event.kind === "session_start" && event.session) {
      const item: RunTimelineSessionItem = {
        id: event.id,
        type: "session",
        event,
        phaseIdx,
        lines: [],
        previewLines: [],
        hiddenLineCount: 0,
        closed: false,
      };
      items.push(item);
      sessionMap.set(sessionKey, item);
      continue;
    }

    if (event.kind === "session_line" && event.session) {
      const existing = sessionMap.get(sessionKey);
      if (existing) {
        existing.lines.push(event);
      } else {
        const item: RunTimelineSessionItem = {
          id: `${event.id}-session`,
          type: "session",
          event: {
            ...event,
            id: `${event.id}-start`,
            kind: "session_start",
          },
          phaseIdx,
          lines: [event],
          previewLines: [],
          hiddenLineCount: 0,
          closed: false,
        };
        items.push(item);
        sessionMap.set(sessionKey, item);
      }
      continue;
    }

    if (event.kind === "session_end" && event.session) {
      const existing = sessionMap.get(sessionKey);
      if (existing) {
        existing.closed = true;
        existing.endEvent = event;
        sessionMap.delete(sessionKey);
      } else {
        items.push({
          id: event.id,
          type: "message",
          event,
          phaseIdx,
        });
      }
      continue;
    }

    if (event.type !== "output" || (!event.agent && !event.session)) {
      items.push({ id: event.id, type: "system", event });
      continue;
    }

    items.push({
      id: event.id,
      type: "message",
      event,
      phaseIdx,
    });
  }

  for (const item of items) {
    if (item.type !== "session") continue;
    const { previewLines, hiddenLineCount } = summarizeSessionLines(item.lines);
    item.previewLines = previewLines;
    item.hiddenLineCount = hiddenLineCount;
  }

  return items;
}

export function formatRunTimestamp(timestamp?: string): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatSystemText(event: RunConsoleEvent): string {
  if (event.type === "connected") return "Connected to live run stream";
  if (event.type === "start") {
    return `Run started${event.project ? ` for ${event.project}` : ""}${event.cycles ? ` (${event.cycles} cycles)` : ""}`;
  }
  if (event.type === "done") {
    return `Run finished${event.project ? ` for ${event.project}` : ""}${typeof event.code === "number" ? ` (exit ${event.code})` : ""}`;
  }
  if (event.type === "stop") return `Run stopped${event.project ? ` for ${event.project}` : ""}`;
  return event.text ?? "";
}

export function formatEventBody(event: RunConsoleEvent): string {
  if (event.kind === "phase_start") return event.text ?? "Working";
  if (event.kind === "phase_done") return event.text ?? (event.status === "done" ? "Completed" : "Failed");
  return event.text ?? "";
}

export function formatSessionTitle(session?: string, agentLabel?: string): string {
  if (!session) return "Agent session";
  if (agentLabel && session.toLowerCase().startsWith(`${agentLabel.toLowerCase()}/`)) {
    const compact = session.slice(agentLabel.length + 1);
    return compact || session;
  }
  return session;
}

export function phaseLabelFromEvent(event: RunConsoleEvent, phaseIdx: number): string {
  if (phaseIdx >= 0) return PHASES[phaseIdx]?.name ?? event.agent ?? "Agent";
  if (!event.agent) return "System";
  return event.agent.charAt(0).toUpperCase() + event.agent.slice(1);
}

const SESSION_NOISE_PATTERNS = [
  /^codex$/i,
  /^exec$/i,
  /^apply_patch\b/i,
  /^file update:$/i,
  /^diff --git\b/i,
  /^index [0-9a-f]{7,}\.\.[0-9a-f]{7,}/i,
  /^--- [ab]\//,
  /^\+\+\+ [ab]\//,
  /^@@/,
  /^[+-]{3}\s/,
  /^m \/users\//i,
  /^\/bin\/(?:ba|z)sh -lc\b/i,
  /^\d{4}-\d{2}-\d{2}t.*\bwarn codex_core::features:/i,
  /\bmcp\b.*\bauth\b/i,
];

const SESSION_SIGNAL_PATTERNS = [
  /\bfail(?:ed|ure)?\b/i,
  /\berror\b/i,
  /\breject(?:ed)?\b/i,
  /\bclean\b/i,
  /\bfixed?\b/i,
  /\bapplied\b/i,
  /\bverification\b/i,
  /\btesting\b/i,
  /\blint\b/i,
  /\btest(?:s|ing)?\b/i,
  /\bfinding:/i,
  /\bgoal:/i,
  /\bacceptance:/i,
  /\bverdict:/i,
  /\bremaining_issues:/i,
];

function isNoiseSessionLine(text: string): boolean {
  return SESSION_NOISE_PATTERNS.some((pattern) => pattern.test(text));
}

function isSignalSessionLine(text: string): boolean {
  return SESSION_SIGNAL_PATTERNS.some((pattern) => pattern.test(text));
}

function summarizeSessionLines(lines: RunConsoleEvent[]): {
  previewLines: RunConsoleEvent[];
  hiddenLineCount: number;
} {
  const candidates = lines.filter((line) => {
    const text = line.text?.trim() ?? "";
    return text.length > 0 && !isNoiseSessionLine(text);
  });

  const previewLines: RunConsoleEvent[] = [];
  const seen = new Set<string>();

  const pushUnique = (line?: RunConsoleEvent) => {
    if (!line) return;
    const key = (line.text ?? "").trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    previewLines.push(line);
  };

  for (const line of candidates) {
    if (previewLines.length >= 4) break;
    if (isSignalSessionLine(line.text?.trim() ?? "")) {
      pushUnique(line);
    }
  }

  pushUnique(candidates[0]);

  const trailing = candidates.slice(-2);
  for (const line of trailing) {
    if (previewLines.length >= 4) break;
    pushUnique(line);
  }

  for (const line of candidates) {
    if (previewLines.length >= 4) break;
    pushUnique(line);
  }

  return {
    previewLines,
    hiddenLineCount: Math.max(lines.length - previewLines.length, 0),
  };
}
