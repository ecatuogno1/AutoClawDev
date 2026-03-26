import { Link } from "@tanstack/react-router";
import type { ProjectWithStats } from "@autoclawdev/types";

interface ProjectCardProps {
  project: ProjectWithStats;
  health?: {
    recentTrend: string;
    hasMemory: boolean;
    lastDeepReview?: string;
    activeRun: boolean;
  };
}

function rateColor(rate: number) {
  if (rate >= 80) return "text-[#3fb950]";
  if (rate >= 50) return "text-[#d29922]";
  if (rate > 0) return "text-[#f85149]";
  return "text-[#484f58]";
}

function rateBg(rate: number) {
  if (rate >= 80) return "bg-[#3fb950]";
  if (rate >= 50) return "bg-[#d29922]";
  if (rate > 0) return "bg-[#f85149]";
  return "bg-[#484f58]";
}

function trendLabel(trend: string) {
  switch (trend) {
    case "improving": return { icon: "↑", color: "text-[#3fb950]", text: "Improving" };
    case "declining": return { icon: "↓", color: "text-[#f85149]", text: "Declining" };
    case "stable": return { icon: "→", color: "text-[#8b949e]", text: "Stable" };
    default: return { icon: "—", color: "text-[#484f58]", text: "New" };
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

export function ProjectCard({ project, health }: ProjectCardProps) {
  const { stats } = project;
  const trend = trendLabel(health?.recentTrend || "unknown");
  const lastExp = stats.lastExperiment;

  return (
    <Link
      to="/projects/$projectKey"
      params={{ projectKey: project.key }}
      className="group block bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden hover:border-[#58a6ff40] transition-all"
    >
      {/* Top bar — pass rate + trend */}
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <div className="flex items-center gap-3">
          {/* Status dot */}
          {health?.activeRun ? (
            <span className="w-2.5 h-2.5 rounded-full bg-[#3fb950] animate-pulse" title="Running" />
          ) : (
            <span className="w-2.5 h-2.5 rounded-full bg-[#30363d]" />
          )}
          <h3 className="text-base font-semibold text-[#e6edf3] group-hover:text-[#58a6ff] transition-colors">
            {project.name}
          </h3>
        </div>
        {stats.total > 0 && (
          <div className="flex items-center gap-2">
            <span className={`text-2xl font-bold ${rateColor(stats.passRate)}`}>
              {stats.passRate}%
            </span>
            <span className={`text-sm ${trend.color}`} title={trend.text}>
              {trend.icon}
            </span>
          </div>
        )}
      </div>

      {/* Description */}
      <p className="text-sm text-[#8b949e] px-5 pb-3 line-clamp-1">
        {project.description}
      </p>

      {/* Pass rate bar */}
      {stats.total > 0 && (
        <div className="mx-5 mb-3">
          <div className="w-full h-1.5 bg-[#21262d] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${rateBg(stats.passRate)}`}
              style={{ width: `${stats.passRate}%` }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-xs text-[#3fb950]">{stats.passed} passed</span>
            <span className="text-xs text-[#f85149]">{stats.failed} failed</span>
          </div>
        </div>
      )}

      {/* Feature indicators */}
      <div className="flex gap-2 px-5 pb-3">
        {health?.hasMemory && (
          <span className="text-xs bg-[#1f6feb15] text-[#58a6ff] px-2 py-0.5 rounded-full" title="Knowledge base active">
            Memory
          </span>
        )}
        {health?.lastDeepReview && (
          <span className="text-xs bg-[#3fb95015] text-[#3fb950] px-2 py-0.5 rounded-full" title={`Last review: ${health.lastDeepReview}`}>
            Reviewed
          </span>
        )}
        {stats.total > 0 && (
          <span className="text-xs bg-[#21262d] text-[#8b949e] px-2 py-0.5 rounded-full">
            {stats.total} runs
          </span>
        )}
        {health?.activeRun && (
          <span className="text-xs bg-[#3fb95015] text-[#3fb950] px-2 py-0.5 rounded-full animate-pulse">
            Running
          </span>
        )}
      </div>

      {/* Last experiment */}
      {lastExp && (
        <div className="px-5 py-3 border-t border-[#30363d] bg-[#0d111780]">
          <div className="flex items-center gap-2">
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${lastExp.result === "pass" ? "bg-[#3fb950]" : "bg-[#f85149]"}`}
            />
            <span className="text-xs text-[#c9d1d9] truncate flex-1">
              {lastExp.description}
            </span>
            {lastExp.timestamp && (
              <span className="text-xs text-[#484f58] shrink-0">
                {timeAgo(lastExp.timestamp)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {stats.total === 0 && (
        <div className="px-5 py-4 border-t border-[#30363d] bg-[#0d111780] text-center">
          <span className="text-xs text-[#484f58]">
            No runs yet — start with <code className="text-[#d29922]">autoclaw run {project.key}</code>
          </span>
        </div>
      )}
    </Link>
  );
}
