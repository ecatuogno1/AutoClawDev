import type { ProjectHealth, ProjectDetail, RunRecord } from "@autoclawdev/types";

export function rateColor(rate: number) {
  if (rate >= 80) return "text-[#3fb950]";
  if (rate >= 50) return "text-[#d29922]";
  if (rate > 0) return "text-[#f85149]";
  return "text-[#484f58]";
}

export function rateBg(rate: number) {
  if (rate >= 80) return "bg-[#3fb950]";
  if (rate >= 50) return "bg-[#d29922]";
  if (rate > 0) return "bg-[#f85149]";
  return "bg-[#484f58]";
}

export function trendInfo(trend: string) {
  switch (trend) {
    case "improving":
      return { icon: "↑", color: "text-[#3fb950]", bg: "bg-[#3fb95015]", label: "Improving" };
    case "declining":
      return { icon: "↓", color: "text-[#f85149]", bg: "bg-[#f8514915]", label: "Declining" };
    case "stable":
      return { icon: "→", color: "text-[#8b949e]", bg: "bg-[#8b949e15]", label: "Stable" };
    default:
      return { icon: "—", color: "text-[#484f58]", bg: "bg-[#484f5815]", label: "New" };
  }
}

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function buildPassRateTrend(runs: Array<{ outcome?: string }>) {
  let passed = 0;

  return [...runs].reverse().map((run, index) => {
    if (run.outcome === "clean_pass" || run.outcome === "degraded_pass") {
      passed += 1;
    }

    return {
      rate: Math.round((passed / (index + 1)) * 100),
    };
  });
}

export function findProjectHealth(
  healthProjects: ProjectHealth[] | undefined,
  projectKey: string,
) {
  return healthProjects?.find((project) => project.key === projectKey);
}

export function getRecoveryRuns(runs: RunRecord[] | undefined) {
  return (runs ?? []).filter(
    (run) => run.recovery?.required === true && (run.recovery.status ?? "open") === "open",
  );
}

export interface ProjectOverviewSummary {
  health: ProjectHealth | undefined;
  trend: ReturnType<typeof trendInfo>;
  reviewCount: number;
  openFindings: number;
  recoveryRuns: RunRecord[];
  passRateOverTime: Array<{ rate: number }>;
  lastRunCreatedAt?: string;
}

export function buildProjectOverviewSummary({
  healthProjects,
  historyRuns,
  projectKey,
  reviewCount,
  openFindings,
  project,
}: {
  healthProjects: ProjectHealth[] | undefined;
  historyRuns: RunRecord[] | undefined;
  projectKey: string;
  reviewCount: number;
  openFindings: number;
  project: ProjectDetail;
}): ProjectOverviewSummary {
  const health = findProjectHealth(healthProjects, projectKey);
  return {
    health,
    trend: trendInfo(health?.recentTrend || "unknown"),
    reviewCount,
    openFindings,
    recoveryRuns: getRecoveryRuns(historyRuns),
    passRateOverTime: buildPassRateTrend(historyRuns ?? []),
    lastRunCreatedAt: project.stats.lastRun?.createdAt,
  };
}
