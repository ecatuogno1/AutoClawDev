import { Link } from "@tanstack/react-router";
import { useAllHistory } from "@/lib/api";

function formatRelativeTime(timestamp: string) {
  const deltaMs = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.max(1, Math.floor(deltaMs / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ExperimentsPanel({
  projectKey: _projectKey,
}: {
  projectKey: string | null;
}) {
  const globalHistoryQuery = useAllHistory();
  const runs = globalHistoryQuery.data?.runs;
  const isLoading = globalHistoryQuery.isLoading;
  const recentRuns = runs?.slice(0, 10) ?? [];

  return (
    <div className="flex h-full flex-col p-4">
      <div className="rounded-xl border border-[#30363d] bg-[#0d1117] p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-[#6e7681]">
            Recent History
          </span>
          <span className="text-xs text-[#8b949e]">{runs?.length ?? 0} total</span>
        </div>
      </div>

      <div className="mt-4 flex-1 space-y-2 overflow-y-auto">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-18 animate-pulse rounded-xl border border-[#30363d] bg-[#0d1117]"
            />
          ))
        ) : recentRuns.length > 0 ? (
          recentRuns.map((run) => (
            <Link
              key={run.id}
              to={run.projectKey ? "/projects/$projectKey" : "/experiments"}
              params={run.projectKey ? { projectKey: run.projectKey } : undefined}
              className="block rounded-xl border border-[#30363d] bg-[#0d1117] p-3 transition-colors hover:border-[#484f58] hover:bg-[#131a22]"
            >
              <div className="flex items-center justify-between gap-3">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] ${
                    run.outcome === "clean_pass"
                      ? "bg-[#3fb95018] text-[#3fb950]"
                      : run.outcome === "degraded_pass"
                        ? "bg-[#d2992218] text-[#d29922]"
                        : "bg-[#f8514918] text-[#f85149]"
                  }`}
                >
                  {run.outcome ?? run.status}
                </span>
                <span className="text-[11px] text-[#6e7681]">
                  {formatRelativeTime(run.createdAt)}
                </span>
              </div>
              <div className="mt-2 line-clamp-2 text-sm text-[#e6edf3]">
                {run.summary || `${run.mode} run`}
              </div>
              <div className="mt-2 text-xs text-[#8b949e]">
                {run.projectKey}
              </div>
            </Link>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-[#30363d] bg-[#0d1117] p-4 text-sm text-[#8b949e]">
            No run history yet.
          </div>
        )}
      </div>

      <Link
        to="/experiments"
        className="mt-4 rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-2 text-center text-sm text-[#8b949e] transition-colors hover:text-[#e6edf3]"
      >
        View all history
      </Link>
    </div>
  );
}
