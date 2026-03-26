import { createFileRoute, Link } from "@tanstack/react-router";
import { useHealthMatrix, useAllExperiments, useActiveRuns } from "@/lib/api";
import { ExperimentRow } from "@/components/ExperimentRow";

export const Route = createFileRoute("/")({
  component: CommandCenter,
});

const trendIcon: Record<string, string> = {
  improving: "trending_up",
  declining: "trending_down",
  stable: "trending_flat",
  unknown: "remove",
};

const trendColor: Record<string, string> = {
  improving: "text-[#3fb950]",
  declining: "text-[#f85149]",
  stable: "text-[#8b949e]",
  unknown: "text-[#484f58]",
};

function rateColor(rate: number) {
  if (rate >= 80) return "bg-[#3fb950]";
  if (rate >= 50) return "bg-[#d29922]";
  if (rate > 0) return "bg-[#f85149]";
  return "bg-[#484f58]";
}

function CommandCenter() {
  const { data: health, isLoading: healthLoading } = useHealthMatrix();
  const { data: experiments, isLoading: expLoading } = useAllExperiments();
  const { data: activeRuns } = useActiveRuns();

  const activeCount = activeRuns ? Object.keys(activeRuns).length : 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#e6edf3]">Command Center</h1>
          <p className="text-sm text-[#8b949e] mt-1">
            Cross-project health and activity
          </p>
        </div>
        {activeCount > 0 && (
          <div className="flex items-center gap-2 bg-[#3fb95010] border border-[#3fb95040] rounded-lg px-4 py-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#3fb950] animate-pulse" />
            <span className="text-sm text-[#3fb950] font-medium">
              {activeCount} active
            </span>
          </div>
        )}
      </div>

      {/* Health Matrix */}
      <div>
        <h2 className="text-lg font-semibold text-[#e6edf3] mb-4">
          Health Matrix
        </h2>
        {healthLoading ? (
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg animate-pulse h-64" />
        ) : health?.projects && health.projects.length > 0 ? (
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#30363d]">
                  <th className="text-left p-3 text-[#8b949e] font-medium">
                    Project
                  </th>
                  <th className="text-center p-3 text-[#8b949e] font-medium w-24">
                    Pass Rate
                  </th>
                  <th className="text-center p-3 text-[#8b949e] font-medium w-20">
                    Trend
                  </th>
                  <th className="text-center p-3 text-[#8b949e] font-medium w-20">
                    Runs
                  </th>
                  <th className="text-center p-3 text-[#8b949e] font-medium w-24">
                    Deep Review
                  </th>
                  <th className="text-center p-3 text-[#8b949e] font-medium w-20">
                    Memory
                  </th>
                  <th className="text-center p-3 text-[#8b949e] font-medium w-24">
                    Profiles
                  </th>
                  <th className="text-center p-3 text-[#8b949e] font-medium w-20">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {health.projects.map((p) => (
                  <tr
                    key={p.key}
                    className="border-b border-[#30363d] last:border-0 hover:bg-[#1c2128] transition-colors"
                  >
                    <td className="p-3">
                      <Link
                        to="/projects/$projectKey"
                        params={{ projectKey: p.key }}
                        className="text-[#58a6ff] hover:underline font-medium"
                      >
                        {p.name}
                      </Link>
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-12 h-2 bg-[#21262d] rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${rateColor(p.passRate)}`}
                            style={{ width: `${p.passRate}%` }}
                          />
                        </div>
                        <span className="text-xs text-[#e6edf3] mono w-8">
                          {p.passRate}%
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`text-xs ${trendColor[p.recentTrend]}`}
                        title={p.recentTrend}
                      >
                        {p.recentTrend === "improving"
                          ? "↑"
                          : p.recentTrend === "declining"
                            ? "↓"
                            : p.recentTrend === "stable"
                              ? "→"
                              : "—"}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <span className="text-xs text-[#8b949e] mono">
                        {p.totalExperiments}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      {p.lastDeepReview ? (
                        <span
                          className="text-xs text-[#3fb950]"
                          title={p.lastDeepReview}
                        >
                          ✓
                        </span>
                      ) : (
                        <span className="text-xs text-[#484f58]">—</span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      {p.hasMemory ? (
                        <span className="text-xs text-[#3fb950]">✓</span>
                      ) : (
                        <span className="text-xs text-[#484f58]">—</span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      {Object.keys(p.profiles).length > 0 ? (
                        <div className="flex gap-1 justify-center">
                          {Object.entries(p.profiles).map(([k, v]) => (
                            <span
                              key={k}
                              className={`w-2 h-2 rounded-full ${v === "pass" ? "bg-[#3fb950]" : v === "fail" ? "bg-[#f85149]" : "bg-[#484f58]"}`}
                              title={`${k}: ${v}`}
                            />
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-[#484f58]">—</span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      {p.activeRun ? (
                        <span className="w-2.5 h-2.5 rounded-full bg-[#3fb950] animate-pulse inline-block" />
                      ) : (
                        <span className="w-2.5 h-2.5 rounded-full bg-[#484f58] inline-block" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-8 text-center">
            <p className="text-[#8b949e]">No projects registered</p>
          </div>
        )}
      </div>

      {/* Recent Activity */}
      <div>
        <h2 className="text-lg font-semibold text-[#e6edf3] mb-4">
          Recent Activity
        </h2>
        {expLoading ? (
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg animate-pulse h-48" />
        ) : experiments && experiments.length > 0 ? (
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden">
            {experiments.slice(0, 10).map((exp) => (
              <ExperimentRow key={exp.id} experiment={exp} showProject />
            ))}
          </div>
        ) : (
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-8 text-center">
            <p className="text-[#8b949e]">No experiments yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
