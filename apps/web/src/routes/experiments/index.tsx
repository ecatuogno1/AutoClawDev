import { createFileRoute } from "@tanstack/react-router";
import { useAllHistory } from "@/lib/api";
import { HistoryRow } from "@/components/HistoryRow";
import { useState } from "react";

export const Route = createFileRoute("/experiments/")({
  component: ExperimentsPage,
});

function ExperimentsPage() {
  const { data, isLoading } = useAllHistory();
  const [filter, setFilter] = useState<"all" | "clean_pass" | "degraded_pass" | "failed" | "recovery_required">("all");
  const runs = data?.runs ?? [];

  const filtered =
    runs.filter((run) => {
      if (filter === "all") return true;
      if (filter === "failed") {
        return run.outcome === "failed";
      }
      return run.outcome === filter;
    });

  const cleanCount = runs.filter((run) => run.outcome === "clean_pass").length;
  const degradedCount = runs.filter((run) => run.outcome === "degraded_pass").length;
  const failCount = runs.filter((run) => run.outcome === "failed").length;
  const recoveryCount = runs.filter(
    (run) => run.recovery?.required === true && (run.recovery.status ?? "open") === "open",
  ).length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#e6edf3]">Run History</h1>
          <p className="text-sm text-[#8b949e] mt-1">
            Compatibility view projected from the typed run ledger
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilter("all")}
            className={`text-xs px-3 py-1.5 rounded-md ${
              filter === "all"
                ? "bg-[#30363d] text-[#e6edf3]"
                : "text-[#8b949e] hover:text-[#e6edf3]"
            }`}
          >
            All ({runs.length})
          </button>
          <button
            onClick={() => setFilter("clean_pass")}
            className={`text-xs px-3 py-1.5 rounded-md ${
              filter === "clean_pass"
                ? "bg-[#3fb95020] text-[#3fb950] border border-[#3fb95040]"
                : "text-[#8b949e] hover:text-[#3fb950]"
            }`}
          >
            Clean ({cleanCount})
          </button>
          <button
            onClick={() => setFilter("degraded_pass")}
            className={`text-xs px-3 py-1.5 rounded-md ${
              filter === "degraded_pass"
                ? "bg-[#d2992220] text-[#d29922] border border-[#d2992240]"
                : "text-[#8b949e] hover:text-[#d29922]"
            }`}
          >
            Degraded ({degradedCount})
          </button>
          <button
            onClick={() => setFilter("failed")}
            className={`text-xs px-3 py-1.5 rounded-md ${
              filter === "failed"
                ? "bg-[#f8514920] text-[#f85149] border border-[#f8514940]"
                : "text-[#8b949e] hover:text-[#f85149]"
            }`}
          >
            Failed ({failCount})
          </button>
          <button
            onClick={() => setFilter("recovery_required")}
            className={`text-xs px-3 py-1.5 rounded-md ${
              filter === "recovery_required"
                ? "bg-[#f8514920] text-[#f85149] border border-[#f8514940]"
                : "text-[#8b949e] hover:text-[#f85149]"
            }`}
          >
            Recovery ({recoveryCount})
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg animate-pulse h-96" />
      ) : filtered.length > 0 ? (
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden">
          {filtered.map((run) => (
            <HistoryRow key={run.id} run={run} showProject />
          ))}
        </div>
      ) : (
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-12 text-center">
          <p className="text-[#8b949e]">No runs found</p>
        </div>
      )}
    </div>
  );
}
