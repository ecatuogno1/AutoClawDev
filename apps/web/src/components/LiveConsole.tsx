import { useEffect, useRef, useState } from "react";
import { RunChat } from "@/components/RunChat";
import {
  hydrateOutputEvent,
  hydrateSystemEvent,
  resolvePhaseIndex,
  type RunConsoleEvent,
  type RunStatus,
} from "@/lib/runConsole";

export function LiveConsole() {
  const [events, setEvents] = useState<RunConsoleEvent[]>([]);
  const [scrollLock, setScrollLock] = useState(false);
  const [connected, setConnected] = useState(false);
  const [selectedPhase, setSelectedPhase] = useState<number | null>(null);
  const [activePhases, setActivePhases] = useState<Record<number, boolean>>({});
  const [phaseStatuses, setPhaseStatuses] = useState<Record<number, RunStatus>>({});
  const eventCounterRef = useRef(0);

  useEffect(() => {
    const es = new EventSource("/api/events");

    es.addEventListener("connected", (event) => {
      setConnected(true);
      const data = JSON.parse((event as MessageEvent).data);
      eventCounterRef.current += 1;
      setEvents((prev) => [
        ...prev.slice(-2000),
        hydrateSystemEvent("connected", data, `connected-${eventCounterRef.current}`),
      ]);
    });

    es.addEventListener("output", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data);
        eventCounterRef.current += 1;
        const nextEvent = hydrateOutputEvent(data, `output-${eventCounterRef.current}`);

        setEvents((prev) => [...prev.slice(-2000), nextEvent]);

        const phaseIdx = resolvePhaseIndex(nextEvent);
        if (phaseIdx >= 0 && nextEvent.status) {
          setPhaseStatuses((prev) => ({ ...prev, [phaseIdx]: nextEvent.status as RunStatus }));
          setActivePhases((prev) => {
            const next = { ...prev };
            if (nextEvent.status === "working") {
              next[phaseIdx] = true;
            } else {
              delete next[phaseIdx];
            }
            return next;
          });
        }
      } catch {
        // ignore malformed events
      }
    });

    for (const type of ["start", "done", "stop"] as const) {
      es.addEventListener(type, (event) => {
        const data = JSON.parse((event as MessageEvent).data);
        eventCounterRef.current += 1;
        setEvents((prev) => [
          ...prev.slice(-2000),
          hydrateSystemEvent(type, data, `${type}-${eventCounterRef.current}`),
        ]);
        if (type === "done" || type === "stop") {
          setActivePhases({});
        }
      });
    }

    es.onerror = () => {
      setConnected(false);
    };

    return () => es.close();
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[#30363d] bg-[#161b22] px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${connected ? "bg-[#3fb950]" : "bg-[#f85149]"}`}
          />
          <span className="mono text-xs text-[#8b949e]">
            {connected ? "Connected" : "Disconnected"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setScrollLock((current) => !current)}
            className={`rounded-full px-3 py-1 text-xs ${
              scrollLock
                ? "border border-[#d2992240] bg-[#d2992220] text-[#d29922]"
                : "bg-[#30363d] text-[#8b949e]"
            }`}
          >
            {scrollLock ? "Scroll locked" : "Auto-scroll"}
          </button>
          <button
            onClick={() => {
              setEvents([]);
              setSelectedPhase(null);
              setPhaseStatuses({});
              setActivePhases({});
            }}
            className="rounded-full bg-[#30363d] px-3 py-1 text-xs text-[#8b949e] hover:text-[#e6edf3]"
          >
            Clear
          </button>
        </div>
      </div>

      <RunChat
        activePhases={activePhases}
        autoScroll={!scrollLock}
        emptyText="Start a run from the dashboard or a project page."
        events={events}
        isRunning={Object.keys(activePhases).length > 0}
        maxHeightClassName="flex-1 min-h-0"
        onAutoScrollChange={(next) => setScrollLock(!next)}
        onSelectPhase={setSelectedPhase}
        phaseStatuses={phaseStatuses}
        selectedPhase={selectedPhase}
        showProject
        waitingText="Live events will stream here as agent threads."
      />
    </div>
  );
}
