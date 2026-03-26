import { createFileRoute } from "@tanstack/react-router";
import { useAllExperiments } from "@/lib/api";
import { ExperimentRow } from "@/components/ExperimentRow";
import { useState } from "react";

export const Route = createFileRoute("/experiments/")({
  component: ExperimentsPage,
});

function ExperimentsPage() {
  const { data: experiments, isLoading } = useAllExperiments();
  const [filter, setFilter] = useState<"all" | "pass" | "fail">("all");

  const filtered =
    experiments?.filter((e) => {
      if (filter === "all") return true;
      return e.result === filter;
    }) ?? [];

  const passCount = experiments?.filter((e) => e.result === "pass").length ?? 0;
  const failCount = experiments?.filter((e) => e.result === "fail").length ?? 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#e6edf3]">Experiments</h1>
          <p className="text-sm text-[#8b949e] mt-1">
            All experiments across projects
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
            All ({experiments?.length ?? 0})
          </button>
          <button
            onClick={() => setFilter("pass")}
            className={`text-xs px-3 py-1.5 rounded-md ${
              filter === "pass"
                ? "bg-[#3fb95020] text-[#3fb950] border border-[#3fb95040]"
                : "text-[#8b949e] hover:text-[#3fb950]"
            }`}
          >
            Passed ({passCount})
          </button>
          <button
            onClick={() => setFilter("fail")}
            className={`text-xs px-3 py-1.5 rounded-md ${
              filter === "fail"
                ? "bg-[#f8514920] text-[#f85149] border border-[#f8514940]"
                : "text-[#8b949e] hover:text-[#f85149]"
            }`}
          >
            Failed ({failCount})
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg animate-pulse h-96" />
      ) : filtered.length > 0 ? (
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden">
          {filtered.map((exp) => (
            <ExperimentRow key={exp.id} experiment={exp} showProject />
          ))}
        </div>
      ) : (
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-12 text-center">
          <p className="text-[#8b949e]">No experiments found</p>
        </div>
      )}
    </div>
  );
}
