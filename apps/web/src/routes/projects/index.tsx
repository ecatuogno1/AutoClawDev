import { createFileRoute } from "@tanstack/react-router";
import { useProjectsReadiness } from "@/lib/api";
import { ProjectCard } from "@/components/ProjectCard";
import { useMemo } from "react";

export const Route = createFileRoute("/projects/")({
  component: ProjectsList,
});

function ProjectsList() {
  const { data, isLoading } = useProjectsReadiness();

  // Sort: active runs first, then by experiment count desc
  const sorted = useMemo(() => {
    if (!data?.projects) return [];
    return [...data.projects].sort((a, b) => {
      const aActive = a.activeRun ? 1 : 0;
      const bActive = b.activeRun ? 1 : 0;
      if (bActive !== aActive) return bActive - aActive;
      if (b.readinessScore !== a.readinessScore) {
        return b.readinessScore - a.readinessScore;
      }
      return b.stats.total - a.stats.total;
    });
  }, [data]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#e6edf3]">Projects</h1>
        <p className="text-sm text-[#8b949e] mt-1">
          {sorted.length} project{sorted.length !== 1 ? "s" : ""} registered
          {sorted.filter((p) => p.activeRun).length > 0 &&
            ` — ${sorted.filter((p) => p.activeRun).length} running`}
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-[#161b22] border border-[#30363d] rounded-xl h-52 animate-pulse"
            />
          ))}
        </div>
      ) : sorted.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sorted.map((entry) => (
            <ProjectCard
              key={entry.key}
              project={{
                ...entry.manifest,
                stats: entry.stats,
              }}
              readiness={entry}
              health={{
                recentTrend: entry.stats.passRate >= 80 ? "improving" : "stable",
                hasMemory: entry.warnings.every((warning) => warning !== "No memory cache initialized"),
                lastDeepReview: entry.lastDeepReview,
                activeRun: entry.activeRun,
              }}
            />
          ))}
        </div>
      ) : (
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-12 text-center space-y-3">
          <div className="text-4xl">📁</div>
          <p className="text-[#8b949e] text-lg">No projects registered</p>
          <p className="text-[#6e7681] text-sm">
            Run{" "}
            <code className="mono text-[#d29922]">autoclaw add /path/to/project</code>
            {" "}to get started
          </p>
        </div>
      )}
    </div>
  );
}
