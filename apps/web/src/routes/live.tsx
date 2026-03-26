import { createFileRoute } from "@tanstack/react-router";
import { LiveConsole } from "@/components/LiveConsole";
import { CycleTimeline } from "@/components/CycleTimeline";
import { useActiveRuns } from "@/lib/api";

export const Route = createFileRoute("/live")({
  component: LivePage,
});

function LivePage() {
  const { data: activeRuns } = useActiveRuns();

  return (
    <div className="flex flex-col h-full">
      {/* Active runs + pipeline */}
      <div className="p-4 border-b border-[#30363d] bg-[#0d1117] space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-[#e6edf3]">Live Console</h1>
          {activeRuns && Object.keys(activeRuns).length > 0 && (
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#3fb950] animate-pulse" />
              <span className="text-xs text-[#3fb950]">
                Running: {Object.keys(activeRuns).join(", ")}
              </span>
            </div>
          )}
        </div>
        <CycleTimeline compact />
      </div>

      {/* Console takes remaining space */}
      <div className="flex-1 min-h-0">
        <LiveConsole />
      </div>
    </div>
  );
}
