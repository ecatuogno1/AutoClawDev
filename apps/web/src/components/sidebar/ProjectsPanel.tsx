import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useHealthMatrix, useProjects } from "@/lib/api";

export function ProjectsPanel() {
  const { data: projects, isLoading } = useProjects();
  const { data: healthData } = useHealthMatrix();

  const healthMap = useMemo(() => {
    return Object.fromEntries((healthData?.projects ?? []).map((project) => [project.key, project]));
  }, [healthData]);

  const sortedProjects = useMemo(() => {
    return [...(projects ?? [])].sort((left, right) => {
      const leftRunning = healthMap[left.key]?.activeRun ? 1 : 0;
      const rightRunning = healthMap[right.key]?.activeRun ? 1 : 0;
      if (rightRunning !== leftRunning) return rightRunning - leftRunning;
      return right.stats.total - left.stats.total;
    });
  }, [healthMap, projects]);

  return (
    <div className="flex h-full flex-col p-4">
      <div className="rounded-xl border border-[#30363d] bg-[#0d1117] p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-[#6e7681]">
            Projects
          </span>
          <span className="text-xs text-[#8b949e]">{projects?.length ?? 0} total</span>
        </div>
      </div>

      <div className="mt-4 flex-1 space-y-2 overflow-y-auto">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-16 animate-pulse rounded-xl border border-[#30363d] bg-[#0d1117]"
            />
          ))
        ) : (
          sortedProjects.map((project) => {
            const health = healthMap[project.key];
            return (
              <Link
                key={project.key}
                to="/projects/$projectKey"
                params={{ projectKey: project.key }}
                className="block rounded-xl border border-[#30363d] bg-[#0d1117] p-3 transition-colors hover:border-[#484f58] hover:bg-[#131a22]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-[#e6edf3]">
                      {project.name}
                    </div>
                    <div className="mt-1 text-xs text-[#8b949e]">
                      {project.stats.total} runs
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {health?.activeRun ? (
                      <span className="size-2 rounded-full bg-[#3fb950] animate-pulse" />
                    ) : null}
                    <span className="text-xs text-[#8b949e]">{project.stats.passRate}%</span>
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>

      <Link
        to="/projects"
        className="mt-4 rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-2 text-center text-sm text-[#8b949e] transition-colors hover:text-[#e6edf3]"
      >
        View all projects
      </Link>
    </div>
  );
}
