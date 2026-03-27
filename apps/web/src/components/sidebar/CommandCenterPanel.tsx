import { Link } from "@tanstack/react-router";
import { useActiveRuns, useHealthMatrix, useProject, useProjectExperiments } from "@/lib/api";

function rateColor(rate: number) {
  if (rate >= 80) return "bg-[#3fb950]";
  if (rate >= 50) return "bg-[#d29922]";
  if (rate > 0) return "bg-[#f85149]";
  return "bg-[#484f58]";
}

export function CommandCenterPanel({
  projectKey,
}: {
  projectKey: string | null;
}) {
  const enabled = Boolean(projectKey);
  const { data: health, isLoading } = useHealthMatrix();
  const { data: activeRuns } = useActiveRuns();
  const { data: project } = useProject(projectKey ?? "", enabled);
  const { data: experiments } = useProjectExperiments(projectKey ?? "", enabled);
  const activeCount = activeRuns ? Object.keys(activeRuns).length : 0;
  const activeRun = projectKey ? activeRuns?.[projectKey] : null;
  const projectHealth = projectKey
    ? health?.projects.find((entry) => entry.key === projectKey)
    : null;

  if (projectKey) {
    return (
      <div className="flex h-full flex-col p-4">
        <div className="rounded-xl border border-[#30363d] bg-[#0d1117] p-4">
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-[#6e7681]">
            Project Health
          </div>
          <div className="mt-2 text-sm font-semibold text-[#e6edf3]">
            {project?.name ?? projectKey}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-center text-xs">
            <div className="rounded-lg border border-[#30363d] bg-[#161b22] px-2 py-3 text-[#8b949e]">
              <div className="text-sm font-semibold text-[#e6edf3]">
                {projectHealth?.passRate ?? project?.stats.passRate ?? 0}%
              </div>
              <div>Pass Rate</div>
            </div>
            <div className="rounded-lg border border-[#30363d] bg-[#161b22] px-2 py-3 text-[#8b949e]">
              <div className="text-sm font-semibold text-[#e6edf3]">
                {experiments?.length ?? project?.stats.total ?? 0}
              </div>
              <div>Runs</div>
            </div>
            <div className="rounded-lg border border-[#30363d] bg-[#161b22] px-2 py-3 text-[#8b949e]">
              <div className="text-sm font-semibold text-[#e6edf3]">
                {projectHealth?.recentTrend ?? "unknown"}
              </div>
              <div>Trend</div>
            </div>
            <div className="rounded-lg border border-[#30363d] bg-[#161b22] px-2 py-3 text-[#8b949e]">
              <div className="text-sm font-semibold text-[#e6edf3]">
                {activeRun ? "Running" : "Idle"}
              </div>
              <div>Status</div>
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <Link
            to="/projects/$projectKey"
            params={{ projectKey }}
            className="block rounded-xl border border-[#30363d] bg-[#0d1117] p-3 text-sm text-[#e6edf3] transition-colors hover:border-[#484f58] hover:bg-[#131a22]"
          >
            Open project overview
          </Link>
          <Link
            to="/projects/$projectKey/reviews"
            params={{ projectKey }}
            className="block rounded-xl border border-[#30363d] bg-[#0d1117] p-3 text-sm text-[#e6edf3] transition-colors hover:border-[#484f58] hover:bg-[#131a22]"
          >
            Open code review
          </Link>
          <Link
            to="/projects/$projectKey/memory"
            params={{ projectKey }}
            className="block rounded-xl border border-[#30363d] bg-[#0d1117] p-3 text-sm text-[#e6edf3] transition-colors hover:border-[#484f58] hover:bg-[#131a22]"
          >
            Open knowledge base
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col p-4">
      <div className="rounded-xl border border-[#30363d] bg-[#0d1117] p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-[#6e7681]">
            Fleet
          </span>
          <span className="text-xs text-[#8b949e]">
            {health?.projects.length ?? 0} projects
          </span>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className={`size-2 rounded-full ${activeCount > 0 ? "bg-[#3fb950] animate-pulse" : "bg-[#484f58]"}`} />
          <span className="text-sm text-[#e6edf3]">
            {activeCount > 0
              ? `${activeCount} active run${activeCount === 1 ? "" : "s"}`
              : "No active runs"}
          </span>
        </div>
      </div>

      <div className="mt-4 flex-1 space-y-2 overflow-y-auto">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-14 animate-pulse rounded-xl border border-[#30363d] bg-[#0d1117]"
            />
          ))
        ) : (
          health?.projects.slice(0, 10).map((project) => (
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
                    {project.totalExperiments} runs
                  </div>
                </div>
                <span className="text-xs text-[#8b949e]">{project.passRate}%</span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#21262d]">
                <div
                  className={`h-full rounded-full ${rateColor(project.passRate)}`}
                  style={{ width: `${project.passRate}%` }}
                />
              </div>
            </Link>
          ))
        )}
      </div>

      <Link
        to="/"
        className="mt-4 rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-2 text-center text-sm text-[#8b949e] transition-colors hover:text-[#e6edf3]"
      >
        Open command center
      </Link>
    </div>
  );
}
