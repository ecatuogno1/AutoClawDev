import type { ProjectExecutionModeSummary, SSEEventData } from "@autoclawdev/types";
import { useEffect, useRef, useState } from "react";
import { RunChat } from "@/components/RunChat";
import { useActiveRuns, useRunEvents } from "@/lib/api";
import {
  hydrateOutputEvent,
  resolvePhaseIndex,
  type RunConsoleEvent,
  type RunStatus,
} from "@/lib/runConsole";
import { timeAgo } from "@/components/project-overview/overviewModel";

function formatModeLabel(mode?: string) {
  if (!mode) return "Execution";
  return mode.charAt(0).toUpperCase() + mode.slice(1);
}

function formatStatusLabel(status?: string) {
  return status ? status.replace(/_/g, " ") : "unknown";
}

function statusTint(status?: string) {
  switch (status) {
    case "running":
      return "bg-[#3fb95015] text-[#3fb950]";
    case "queued":
      return "bg-[#58a6ff15] text-[#58a6ff]";
    case "awaiting_approval":
      return "bg-[#d2992215] text-[#d29922]";
    case "completed":
      return "bg-[#3fb95015] text-[#3fb950]";
    case "failed":
    case "stopped":
    case "cancelled":
      return "bg-[#f8514915] text-[#f85149]";
    default:
      return "bg-[#8b949e15] text-[#8b949e]";
  }
}

export function ProjectLiveRunPanel({
  projectKey,
  activeRecord,
  latestRecord,
}: {
  projectKey: string;
  activeRecord?: ProjectExecutionModeSummary | null;
  latestRecord?: ProjectExecutionModeSummary | null;
}) {
  const { data: activeRuns } = useActiveRuns();
  const isRunning = activeRuns?.[projectKey];
  const focusedRecord = activeRecord ?? latestRecord;
  const { data: managedEventsData } = useRunEvents(focusedRecord?.runId, Boolean(focusedRecord?.runId));
  const [events, setEvents] = useState<RunConsoleEvent[]>([]);
  const [phases, setPhases] = useState<Record<number, RunStatus>>({});
  const [activePhaseMap, setActivePhaseMap] = useState<Record<number, boolean>>({});
  const [selectedPhase, setSelectedPhase] = useState<number | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!isRunning) {
      fetch(`/api/projects/${projectKey}/lastlog`)
        .then((response) => response.json())
        .then((data) => {
          if (!data.events?.length) {
            return;
          }

          const hydrated = data.events
            .map((event: unknown, index: number) =>
              hydrateOutputEvent(event as SSEEventData, `last-${index}`),
            )
            .filter(Boolean) as RunConsoleEvent[];

          setEvents(hydrated);
          const nextPhases: Record<number, RunStatus> = {};
          const nextActive: Record<number, boolean> = {};

          for (const event of hydrated) {
            const phaseIndex = resolvePhaseIndex(event);
            if (phaseIndex < 0) {
              continue;
            }

            nextActive[phaseIndex] = true;
            nextPhases[phaseIndex] =
              event.kind === "phase_done"
                ? event.status === "fail"
                  ? "fail"
                  : "done"
                : "working";
          }

          setPhases(nextPhases);
          setActivePhaseMap(nextActive);
        })
        .catch(() => {});

      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      return;
    }

    let disposed = false;
    let retryTimer: number | null = null;

    const attachEventSource = () => {
      if (disposed) {
        return;
      }

      const eventSource = new EventSource("/api/events");
      eventSourceRef.current = eventSource;

      const handleEvent = (event: Event) => {
        try {
          const data = JSON.parse((event as MessageEvent).data);
          if (data.project !== projectKey) {
            return;
          }

          const hydrated = hydrateOutputEvent(data, `live-${Date.now()}`);
          if (!hydrated) {
            return;
          }

          setEvents((previous) => [...previous.slice(-500), hydrated]);
          const phaseIndex = resolvePhaseIndex(hydrated);
          if (phaseIndex >= 0) {
            setActivePhaseMap((previous) => ({ ...previous, [phaseIndex]: true }));
            setPhases((previous) => ({
              ...previous,
              [phaseIndex]:
                hydrated.kind === "phase_done"
                  ? hydrated.status === "fail"
                    ? "fail"
                    : "done"
                  : "working",
            }));
          }
        } catch {}
      };

      for (const type of ["output", "start", "done", "stop"]) {
        eventSource.addEventListener(type, handleEvent);
      }

      eventSource.onerror = () => {
        eventSource.close();
        if (eventSourceRef.current === eventSource) {
          eventSourceRef.current = null;
        }
        if (disposed) {
          return;
        }
        if (retryTimer) {
          window.clearTimeout(retryTimer);
        }
        retryTimer = window.setTimeout(() => {
          attachEventSource();
        }, 3000);
      };
    };

    attachEventSource();

    return () => {
      disposed = true;
      if (retryTimer) {
        window.clearTimeout(retryTimer);
      }
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, [isRunning, projectKey]);

  if (events.length === 0 && !focusedRecord) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[#30363d] bg-[#161b22]">
      <div className="flex items-center justify-between border-b border-[#30363d] px-4 py-3">
        <div>
          <h2 className="text-sm font-medium text-[#e6edf3]">
            {isRunning
              ? `Live ${formatModeLabel(focusedRecord?.mode)}`
              : focusedRecord
                ? `Last ${formatModeLabel(focusedRecord.mode)}`
                : "Last Run Output"}
          </h2>
          {focusedRecord ? (
            <div className="mt-1 flex items-center gap-2 text-xs text-[#8b949e]">
              <span className={`rounded-full px-2 py-0.5 ${statusTint(focusedRecord.status)}`}>
                {formatStatusLabel(focusedRecord.status)}
              </span>
              <span>{focusedRecord.updatedAt ? `Updated ${timeAgo(focusedRecord.updatedAt)}` : null}</span>
            </div>
          ) : null}
        </div>
        <div className="flex gap-2">
          {isRunning ? <span className="h-2 w-2 rounded-full bg-[#3fb950] animate-pulse" /> : null}
          <button
            type="button"
            onClick={() => setAutoScroll((current) => !current)}
            className={`rounded px-2 py-0.5 text-xs ${
              autoScroll ? "bg-[#21262d] text-[#e6edf3]" : "text-[#8b949e]"
            }`}
          >
            Auto-scroll
          </button>
        </div>
      </div>
      {focusedRecord ? (
        <div className="border-b border-[#30363d] px-4 py-3">
          {focusedRecord.summary ? (
            <p className="text-sm text-[#c9d1d9]">{focusedRecord.summary}</p>
          ) : null}
          {focusedRecord.phases && focusedRecord.phases.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {focusedRecord.phases.map((phase, index) => (
                <div
                  key={`${focusedRecord.runId ?? focusedRecord.mode}-${phase.name}-${index}`}
                  className="rounded-md border border-[#30363d] bg-[#0d1117] px-2.5 py-1.5"
                >
                  <div className="text-[11px] uppercase tracking-[0.12em] text-[#6e7681]">{phase.name}</div>
                  <div className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] ${statusTint(phase.status)}`}>
                    {formatStatusLabel(phase.status)}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {managedEventsData?.events?.length ? (
            <div className="mt-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#6e7681]">
                Recent Events
              </div>
              <div className="space-y-2">
                {managedEventsData.events.slice(-5).reverse().map((event) => (
                  <div
                    key={event.id}
                    className="rounded-md border border-[#30363d] bg-[#0d1117] px-3 py-2 text-xs"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-[#e6edf3]">{event.message ?? event.type}</span>
                      <span className="text-[#6e7681]">{timeAgo(event.timestamp)}</span>
                    </div>
                    <div className="mt-1 text-[#8b949e]">{event.type}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {events.length > 0 ? (
      <div className="max-h-[400px] overflow-hidden">
        <RunChat
          events={events}
          activePhases={activePhaseMap}
          phaseStatuses={phases}
          selectedPhase={selectedPhase}
          onSelectPhase={setSelectedPhase}
          autoScroll={autoScroll}
          onAutoScrollChange={setAutoScroll}
          emptyText="No output yet"
        />
      </div>
      ) : focusedRecord ? null : null}
    </div>
  );
}
