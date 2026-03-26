import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useActiveRuns, useProjects } from "@/lib/api";

function formatDuration(startedAt: string) {
  const minutes = Math.max(1, Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
}

export function LivePanel() {
  const { data: activeRuns } = useActiveRuns();
  const { data: projects } = useProjects();

  const projectNames = useMemo(() => {
    return Object.fromEntries((projects ?? []).map((project) => [project.key, project.name]));
  }, [projects]);

  const runs = Object.values(activeRuns ?? {});

  return (
    <div className="flex h-full flex-col p-4">
      <div className="rounded-xl border border-[#30363d] bg-[#0d1117] p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-[#6e7681]">
            Active Runs
          </span>
          <span className="text-xs text-[#8b949e]">{runs.length} running</span>
        </div>
      </div>

      <div className="mt-4 flex-1 space-y-2 overflow-y-auto">
        {runs.length > 0 ? (
          runs.map((run) => (
            <Link
              key={run.project}
              to="/projects/$projectKey"
              params={{ projectKey: run.project }}
              className="block rounded-xl border border-[#30363d] bg-[#0d1117] p-3 transition-colors hover:border-[#484f58] hover:bg-[#131a22]"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="size-2 rounded-full bg-[#3fb950] animate-pulse" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-[#e6edf3]">
                      {projectNames[run.project] ?? run.project}
                    </div>
                    <div className="mt-1 text-xs text-[#8b949e]">
                      {run.cycles} cycle{run.cycles === 1 ? "" : "s"}
                    </div>
                  </div>
                </div>
                <span className="text-[11px] text-[#6e7681]">{formatDuration(run.startedAt)}</span>
              </div>
            </Link>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-[#30363d] bg-[#0d1117] p-4 text-sm text-[#8b949e]">
            No active runs right now.
          </div>
        )}
      </div>

      <Link
        to="/live"
        className="mt-4 rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-2 text-center text-sm text-[#8b949e] transition-colors hover:text-[#e6edf3]"
      >
        Open live console
      </Link>
    </div>
  );
}
