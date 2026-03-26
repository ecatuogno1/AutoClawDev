import { createFileRoute } from "@tanstack/react-router";
import { useProjects, useHealthMatrix } from "@/lib/api";
import { ProjectCard } from "@/components/ProjectCard";
import { useMemo } from "react";

export const Route = createFileRoute("/projects/")({
  component: ProjectsList,
});

function ProjectsList() {
  const { data: projects, isLoading } = useProjects();
  const { data: healthData } = useHealthMatrix();

  const healthMap = useMemo(() => {
    const map: Record<string, { recentTrend: string; hasMemory: boolean; lastDeepReview?: string; activeRun: boolean }> = {};
    for (const p of healthData?.projects ?? []) {
      map[p.key] = {
        recentTrend: p.recentTrend,
        hasMemory: p.hasMemory,
        lastDeepReview: p.lastDeepReview,
        activeRun: p.activeRun,
      };
    }
    return map;
  }, [healthData]);

  // Sort: active runs first, then by experiment count desc
  const sorted = useMemo(() => {
    if (!projects) return [];
    return [...projects].sort((a, b) => {
      const aActive = healthMap[a.key]?.activeRun ? 1 : 0;
      const bActive = healthMap[b.key]?.activeRun ? 1 : 0;
      if (bActive !== aActive) return bActive - aActive;
      return b.stats.total - a.stats.total;
    });
  }, [projects, healthMap]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#e6edf3]">Projects</h1>
        <p className="text-sm text-[#8b949e] mt-1">
          {sorted.length} project{sorted.length !== 1 ? "s" : ""} registered
          {sorted.filter((p) => healthMap[p.key]?.activeRun).length > 0 &&
            ` — ${sorted.filter((p) => healthMap[p.key]?.activeRun).length} running`}
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
          {sorted.map((p) => (
            <ProjectCard
              key={p.key}
              project={p}
              health={healthMap[p.key]}
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
