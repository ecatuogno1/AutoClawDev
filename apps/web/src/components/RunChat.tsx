import { useEffect, useRef } from "react";
import {
  PHASES,
  buildRunTimeline,
  formatEventBody,
  formatRunTimestamp,
  formatSessionTitle,
  formatSystemText,
  getPhaseCounts,
  phaseLabelFromEvent,
  type RunConsoleEvent,
  type RunStatus,
} from "@/lib/runConsole";

interface RunChatProps {
  autoScroll: boolean;
  emptyText: string;
  events: RunConsoleEvent[];
  isRunning?: boolean;
  maxHeightClassName?: string;
  onAutoScrollChange: (next: boolean) => void;
  onSelectPhase: (phase: number | null) => void;
  phaseStatuses?: Record<number, RunStatus>;
  activePhases?: Record<number, boolean>;
  selectedPhase: number | null;
  showProject?: boolean;
  waitingText?: string;
}

function getAccentClasses(status?: RunStatus) {
  if (status === "done") {
    return {
      avatar: "border-[#2f6f4f] bg-[#10261c] text-[#3fb950]",
      bubble: "border-[#244734] bg-[#101a15] text-[#d8ffe2]",
      badge: "border-[#2f6f4f] bg-[#12261b] text-[#3fb950]",
    };
  }
  if (status === "fail") {
    return {
      avatar: "border-[#6f2f35] bg-[#241115] text-[#f85149]",
      bubble: "border-[#51242a] bg-[#1a1012] text-[#ffd9d6]",
      badge: "border-[#6f2f35] bg-[#271215] text-[#f85149]",
    };
  }
  return {
    avatar: "border-[#2b3a4b] bg-[#121b24] text-[#7cc2ff]",
    bubble: "border-[#253240] bg-[#111923] text-[#d7e9f7]",
    badge: "border-[#2b3a4b] bg-[#131d28] text-[#7cc2ff]",
  };
}

export function RunChat({
  autoScroll,
  emptyText,
  events,
  isRunning,
  maxHeightClassName = "max-h-[440px]",
  onAutoScrollChange,
  onSelectPhase,
  phaseStatuses = {},
  activePhases = {},
  selectedPhase,
  showProject,
  waitingText = "Waiting for output...",
}: RunChatProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const phaseCounts = getPhaseCounts(events);
  const timeline = buildRunTimeline(events);
  const visibleItems = timeline.filter((item) => {
    if (selectedPhase === null) return true;
    if (item.type === "system") return false;
    return item.phaseIdx === selectedPhase;
  });

  useEffect(() => {
    if (!autoScroll || !containerRef.current) return;
    containerRef.current.scrollTop = containerRef.current.scrollHeight;
  }, [autoScroll, events, selectedPhase]);

  return (
    <>
      <div className="border-b border-[#30363d] bg-[linear-gradient(180deg,#11161d_0%,#0d1117_100%)] px-5 py-4">
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <div className="flex min-w-full flex-nowrap gap-2">
            <button
              onClick={() => onSelectPhase(null)}
              className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                selectedPhase === null
                  ? "border-[#3a6ea5] bg-[#14263b] text-[#8dccff]"
                  : "border-[#2a3138] bg-[#14181d] text-[#7d8792] hover:border-[#3b434d] hover:text-[#c2cad2]"
              }`}
            >
              All agents
            </button>
            {PHASES.map((phase, index) => {
              const isSelected = selectedPhase === index;
              const isActive = !!activePhases[index];
              const status = phaseStatuses[index];
              const count = phaseCounts[index] ?? 0;
              const hasOutput = count > 0;
              return (
                <button
                  key={phase.key}
                  onClick={() => onSelectPhase(isSelected ? null : index)}
                  className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    isSelected
                      ? "border-[#3a6ea5] bg-[#12263a] text-[#9bd2ff]"
                      : isActive
                        ? "border-[#406a93] bg-[#112130] text-[#7cc2ff]"
                        : status === "done"
                          ? "border-[#315840] bg-[#101b15] text-[#67d387]"
                          : status === "fail"
                            ? "border-[#6f3138] bg-[#1b1013] text-[#ff8e88]"
                            : hasOutput
                              ? "border-[#2a3138] bg-[#14181d] text-[#b4bcc5] hover:border-[#3b434d] hover:text-[#e1e8ef]"
                              : "border-[#24292f] bg-[#12161a] text-[#626d78] hover:text-[#9aa3ab]"
                  }`}
                >
                  <span>{phase.icon}</span>
                  <span className="font-medium">{phase.name}</span>
                  {isActive && <span className="h-2 w-2 rounded-full bg-[#58a6ff] animate-pulse" />}
                  {count > 0 && <span className="text-[10px] text-[#7d8792]">{count}</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div
        ref={containerRef}
        className={`overflow-y-auto bg-[radial-gradient(circle_at_top,#121a24_0%,#0d1117_55%)] px-4 py-5 sm:px-5 ${maxHeightClassName}`}
        onScroll={(event) => {
          const element = event.currentTarget;
          const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 28;
          if (!atBottom && autoScroll) onAutoScrollChange(false);
        }}
      >
        {visibleItems.length === 0 ? (
          <div className="flex min-h-[220px] items-center justify-center">
            <div className="max-w-sm rounded-[28px] border border-[#222a32] bg-[#11161d] px-6 py-5 text-center shadow-[0_24px_80px_rgba(0,0,0,0.25)]">
              <p className="text-sm font-medium text-[#e6edf3]">
                {selectedPhase !== null
                  ? `No output yet for ${PHASES[selectedPhase]?.name}`
                  : isRunning
                    ? waitingText
                    : emptyText}
              </p>
              <p className="mt-2 text-xs leading-6 text-[#7d8792]">
                Agent runs will land here as threaded updates instead of a flat terminal dump.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {visibleItems.map((item) => {
              if (item.type === "system") {
                return (
                  <div key={item.id} className="flex justify-center">
                    <div className="rounded-full border border-[#2a3138] bg-[#12171d] px-3 py-1 text-[11px] text-[#9aa4ae]">
                      {formatSystemText(item.event)}
                    </div>
                  </div>
                );
              }

              const phase = item.phaseIdx >= 0 ? PHASES[item.phaseIdx] : null;
              const agentLabel = phaseLabelFromEvent(item.event, item.phaseIdx);
              const toolLabel = item.event.tool ?? phase?.tool ?? "agent";
              const accent = getAccentClasses(item.event.status);

              return (
                <div key={item.id} className="flex items-start gap-3">
                  <div
                    className={`mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border text-base shadow-[0_12px_30px_rgba(0,0,0,0.18)] ${accent.avatar}`}
                  >
                    {phase?.icon ?? agentLabel.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#7d8792]">
                      <span className="text-sm font-semibold text-[#e6edf3]">{agentLabel}</span>
                      {showProject && item.event.project && (
                        <span className="rounded-full border border-[#2a3138] bg-[#12171d] px-2 py-0.5 mono text-[10px] text-[#d29922]">
                          {item.event.project}
                        </span>
                      )}
                      <span className="rounded-full border border-[#29313a] bg-[#12181f] px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-[#8b949e]">
                        {toolLabel}
                      </span>
                      {item.event.status && (
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${accent.badge}`}>
                          {item.event.status}
                        </span>
                      )}
                      <span className="ml-auto text-[10px] text-[#6e7681]">
                        {formatRunTimestamp(item.event.timestamp)}
                      </span>
                    </div>

                    {item.type === "message" ? (
                      <div
                        className={`mt-1.5 max-w-[min(100%,56rem)] rounded-[24px] border px-4 py-3 text-sm leading-6 shadow-[0_24px_80px_rgba(0,0,0,0.22)] ${accent.bubble}`}
                      >
                        {formatEventBody(item.event)}
                      </div>
                    ) : (
                      <div className="mt-1.5 max-w-[min(100%,56rem)] overflow-hidden rounded-[28px] border border-[#243240] bg-[#101722] shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
                        <div className="flex items-center justify-between gap-3 border-b border-[#1f2a35] bg-[#121c28] px-4 py-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[#e6edf3]">
                              {formatSessionTitle(item.event.session, agentLabel)}
                            </p>
                            <p className="mt-0.5 text-[11px] text-[#8b949e]">
                              {item.event.session}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em]">
                            <span className="rounded-full border border-[#2a3947] bg-[#101924] px-2 py-1 text-[#8fbde6]">
                              {item.lines.length} msg{item.lines.length === 1 ? "" : "s"}
                            </span>
                            <span
                              className={`rounded-full border px-2 py-1 ${
                                item.closed
                                  ? "border-[#315840] bg-[#101b15] text-[#67d387]"
                                  : "border-[#406a93] bg-[#112130] text-[#7cc2ff]"
                              }`}
                            >
                              {item.closed ? "closed" : "live"}
                            </span>
                          </div>
                        </div>
                        <div className="space-y-2 bg-[#0f1620] p-3">
                          {item.previewLines.length === 0 ? (
                            <div className="rounded-[20px] border border-dashed border-[#2a3947] bg-[#101924] px-3 py-2 text-xs text-[#7d8792]">
                              {item.lines.length === 0
                                ? "Session opened. Waiting for agent replies."
                                : "Session active. Transcript noise hidden until a meaningful update lands."}
                            </div>
                          ) : (
                            item.previewLines.map((line) => (
                              <div
                                key={line.id}
                                className="rounded-[20px] border border-[#213140] bg-[#121c28] px-3 py-2 text-sm leading-6 text-[#d7e9f7]"
                              >
                                {line.text}
                              </div>
                            ))
                          )}
                          {item.hiddenLineCount > 0 && (
                            <div className="rounded-[20px] border border-dashed border-[#2a3947] bg-[#101924] px-3 py-2 text-xs text-[#7d8792]">
                              {item.hiddenLineCount} low-signal line
                              {item.hiddenLineCount === 1 ? "" : "s"} hidden to keep the run readable.
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
