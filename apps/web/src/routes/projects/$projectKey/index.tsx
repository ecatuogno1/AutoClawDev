import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import {
  useProject,
  useProjectExperiments,
  useGithub,
  useActiveRuns,
  useHealthMatrix,
  useReviews,
  useProjectMemory,
} from "@/lib/api";
import { ExperimentRow } from "@/components/ExperimentRow";
import { RunButton } from "@/components/RunButton";
import { RunChat } from "@/components/RunChat";
import { AgentBadge } from "@/components/AgentBadge";
import {
  hydrateOutputEvent,
  resolvePhaseIndex,
  type RunConsoleEvent,
  type RunStatus,
} from "@/lib/runConsole";

export const Route = createFileRoute("/projects/$projectKey/")({
  component: ProjectDetail,
});

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

function trendInfo(trend: string) {
  switch (trend) {
    case "improving": return { icon: "↑", color: "text-[#3fb950]", bg: "bg-[#3fb95015]", label: "Improving" };
    case "declining": return { icon: "↓", color: "text-[#f85149]", bg: "bg-[#f8514915]", label: "Declining" };
    case "stable": return { icon: "→", color: "text-[#8b949e]", bg: "bg-[#8b949e15]", label: "Stable" };
    default: return { icon: "—", color: "text-[#484f58]", bg: "bg-[#484f5815]", label: "New" };
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
      <div className={`text-2xl font-bold ${color || "text-[#e6edf3]"}`}>{value}</div>
      <div className="text-xs text-[#8b949e] mt-0.5">{label}</div>
      {sub && <div className="text-xs text-[#484f58] mt-0.5">{sub}</div>}
    </div>
  );
}

function ProjectDetail() {
  const { projectKey } = Route.useParams();
  const { data: project, isLoading } = useProject(projectKey);
  const { data: experiments } = useProjectExperiments(projectKey);
  const { data: github } = useGithub(projectKey, !!project?.gh_repo);
  const { data: activeRuns } = useActiveRuns();
  const { data: healthData } = useHealthMatrix();
  const { data: reviewsData } = useReviews(projectKey);
  const { data: memory } = useProjectMemory(projectKey);
  const isRunning = activeRuns?.[projectKey];

  const health = healthData?.projects?.find((p) => p.key === projectKey);
  const trend = trendInfo(health?.recentTrend || "unknown");
  const reviewCount = reviewsData?.reviews?.length ?? 0;
  const openFindings = memory?.openFindings?.length ?? 0;

  if (isLoading) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl animate-pulse h-96" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-12 text-center">
          <p className="text-[#f85149] text-lg">Project not found</p>
          <Link to="/projects" className="text-sm text-[#58a6ff] mt-2 inline-block">
            Back to projects
          </Link>
        </div>
      </div>
    );
  }

  const passRateOverTime =
    experiments?.reduce(
      (acc, exp, i) => {
        const passed = acc.passed + (exp.result === "pass" ? 1 : 0);
        const total = i + 1;
        acc.points.push({ rate: Math.round((passed / total) * 100) });
        acc.passed = passed;
        return acc;
      },
      { points: [] as Array<{ rate: number }>, passed: 0 },
    )?.points ?? [];

  const lastExpTime = project.stats.lastExperiment?.timestamp;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-[#8b949e]">
        <Link to="/" className="hover:text-[#58a6ff]">Home</Link>
        <span>/</span>
        <Link to="/projects" className="hover:text-[#58a6ff]">Projects</Link>
        <span>/</span>
        <span className="text-[#e6edf3]">{project.name}</span>
      </div>

      {/* Hero header */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              {isRunning ? (
                <span className="w-3 h-3 rounded-full bg-[#3fb950] animate-pulse" />
              ) : (
                <span className="w-3 h-3 rounded-full bg-[#30363d]" />
              )}
              <h1 className="text-2xl font-bold text-[#e6edf3]">{project.name}</h1>
            </div>
            <p className="text-sm text-[#8b949e] mb-4">{project.description}</p>

            {/* Badges */}
            <div className="flex flex-wrap gap-2">
              {isRunning && (
                <span className="text-xs bg-[#3fb95020] text-[#3fb950] px-2.5 py-1 rounded-full font-medium animate-pulse">
                  Running
                </span>
              )}
              {health?.hasMemory && (
                <span className="text-xs bg-[#1f6feb15] text-[#58a6ff] px-2.5 py-1 rounded-full">
                  Memory Active
                </span>
              )}
              {reviewCount > 0 && (
                <span className="text-xs bg-[#3fb95015] text-[#3fb950] px-2.5 py-1 rounded-full">
                  {reviewCount} Review{reviewCount !== 1 ? "s" : ""}
                </span>
              )}
              {openFindings > 0 && (
                <span className="text-xs bg-[#d2992215] text-[#d29922] px-2.5 py-1 rounded-full">
                  {openFindings} Open Finding{openFindings !== 1 ? "s" : ""}
                </span>
              )}
              <span className={`text-xs ${trend.bg} ${trend.color} px-2.5 py-1 rounded-full`}>
                {trend.icon} {trend.label}
              </span>
            </div>
          </div>

          {/* Pass rate */}
          <div className="text-right ml-6">
            {project.stats.total > 0 ? (
              <>
                <div className={`text-5xl font-bold ${rateColor(project.stats.passRate)}`}>
                  {project.stats.passRate}%
                </div>
                <div className="text-xs text-[#8b949e] mt-1">
                  {project.stats.passed} passed / {project.stats.failed} failed
                </div>
              </>
            ) : (
              <div className="text-3xl font-bold text-[#484f58]">—</div>
            )}
            <div className="mt-3" onClick={(e) => e.stopPropagation()}>
              <RunButton projectKey={project.key} />
            </div>
          </div>
        </div>

        {/* Pass rate bar */}
        {project.stats.total > 0 && (
          <div className="mt-4">
            <div className="w-full h-2 bg-[#21262d] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${rateBg(project.stats.passRate)}`}
                style={{ width: `${project.stats.passRate}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 border-b border-[#30363d]">
        <span className="px-5 py-3 text-sm font-medium text-[#e6edf3] border-b-2 border-[#58a6ff]">
          Runs
        </span>
        <Link
          to="/projects/$projectKey/reviews"
          params={{ projectKey }}
          className="px-5 py-3 text-sm font-medium text-[#8b949e] hover:text-[#e6edf3] transition-colors"
        >
          Code Review
          {reviewCount > 0 && (
            <span className="ml-1.5 text-xs bg-[#21262d] px-1.5 py-0.5 rounded-full">{reviewCount}</span>
          )}
        </Link>
        <Link
          to="/projects/$projectKey/memory"
          params={{ projectKey }}
          className="px-5 py-3 text-sm font-medium text-[#8b949e] hover:text-[#e6edf3] transition-colors"
        >
          Knowledge Base
          {openFindings > 0 && (
            <span className="ml-1.5 text-xs bg-[#d2992220] text-[#d29922] px-1.5 py-0.5 rounded-full">{openFindings}</span>
          )}
        </Link>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Runs"
          value={project.stats.total}
          sub={lastExpTime ? `Last: ${timeAgo(lastExpTime)}` : undefined}
        />
        <StatCard
          label="Pass Rate"
          value={`${project.stats.passRate}%`}
          color={rateColor(project.stats.passRate)}
        />
        <StatCard
          label="Passed"
          value={project.stats.passed}
          color="text-[#3fb950]"
        />
        <StatCard
          label="Failed"
          value={project.stats.failed}
          color="text-[#f85149]"
        />
      </div>

      {/* Trend chart */}
      {passRateOverTime.length > 1 && (
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5">
          <h2 className="text-sm font-medium text-[#8b949e] mb-3">Pass Rate Trend</h2>
          <div className="flex items-end gap-px h-20">
            {passRateOverTime.slice(-60).map((point, i) => (
              <div
                key={i}
                className="flex-1 min-w-[2px] rounded-t"
                style={{
                  height: `${Math.max(point.rate, 2)}%`,
                  backgroundColor:
                    point.rate >= 70 ? "#3fb950" : point.rate >= 40 ? "#d29922" : "#f85149",
                  opacity: 0.7 + (i / passRateOverTime.slice(-60).length) * 0.3,
                }}
                title={`${point.rate}%`}
              />
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-[#484f58] mt-1">
            <span>Oldest</span>
            <span>Latest</span>
          </div>
        </div>
      )}

      {/* Live Run Section */}
      <LiveRunPanel projectKey={projectKey} />

      {/* Experiments + GitHub */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <h2 className="text-base font-semibold text-[#e6edf3] mb-3">
            Recent Experiments
          </h2>
          {experiments && experiments.length > 0 ? (
            <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
              {experiments.slice(0, 20).map((exp, i) => (
                <ExpandableExperiment key={i} experiment={exp} projectKey={projectKey} />
              ))}
            </div>
          ) : (
            <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-8 text-center">
              <p className="text-[#8b949e]">No experiments yet</p>
              <p className="text-xs text-[#484f58] mt-1">
                Run <code className="text-[#d29922]">autoclaw run {projectKey}</code> to start
              </p>
            </div>
          )}
        </div>

        {/* GitHub sidebar */}
        <div>
          {project.gh_repo && github?.issues && github.issues.length > 0 && (
            <div>
              <h2 className="text-base font-semibold text-[#e6edf3] mb-3">
                Open Issues
              </h2>
              <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
                {github.issues.slice(0, 10).map((issue) => (
                  <a
                    key={issue.number}
                    href={`https://github.com/${project.gh_repo}/issues/${issue.number}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-2 px-4 py-3 border-b border-[#30363d] last:border-0 hover:bg-[#0d111780] transition-colors"
                  >
                    <span className="text-[#3fb950] text-xs mt-0.5 shrink-0">●</span>
                    <div className="min-w-0">
                      <span className="text-sm text-[#e6edf3] hover:text-[#58a6ff]">
                        #{issue.number} {issue.title}
                      </span>
                      {issue.labels.length > 0 && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {issue.labels.slice(0, 3).map((l) => (
                            <span key={l.name} className="text-[10px] bg-[#21262d] text-[#8b949e] px-1.5 py-0.5 rounded">
                              {l.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Quick config */}
          <div className={project.gh_repo && github?.issues?.length ? "mt-4" : ""}>
            <h2 className="text-base font-semibold text-[#e6edf3] mb-3">Config</h2>
            <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[#8b949e]">Package manager</span>
                <span className="text-[#e6edf3]">{project.package_manager}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8b949e]">Test</span>
                <span className="mono text-xs text-[#e6edf3]">{project.test_cmd}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8b949e]">Lint</span>
                <span className="mono text-xs text-[#e6edf3]">{project.lint_cmd}</span>
              </div>
              {project.gh_repo && (
                <div className="flex justify-between">
                  <span className="text-[#8b949e]">GitHub</span>
                  <a
                    href={`https://github.com/${project.gh_repo}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mono text-xs text-[#58a6ff] hover:underline"
                  >
                    {project.gh_repo}
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Live Run Panel ───────────────────────────────────────────────────
// (Kept from original — handles SSE streaming and phase display)

function LiveRunPanel({ projectKey }: { projectKey: string }) {
  const { data: activeRuns } = useActiveRuns();
  const isRunning = activeRuns?.[projectKey];
  const [events, setEvents] = useState<RunConsoleEvent[]>([]);
  const [phases, setPhases] = useState<Record<number, RunStatus>>({});
  const [activePhaseMap, setActivePhaseMap] = useState<Record<number, boolean>>({});
  const [selectedPhase, setSelectedPhase] = useState<number | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!isRunning) {
      // Load last log when not running
      fetch(`/api/projects/${projectKey}/lastlog`)
        .then((r) => r.json())
        .then((data) => {
          if (data.events?.length) {
            const hydrated = data.events.map((evt: any, i: number) => hydrateOutputEvent(evt, `last-${i}`)).filter(Boolean) as RunConsoleEvent[];
            setEvents(hydrated);
            const newPhases: Record<number, RunStatus> = {};
            const newActive: Record<number, boolean> = {};
            for (const evt of hydrated) {
              const idx = resolvePhaseIndex(evt);
              if (idx >= 0) {
                newActive[idx] = true;
                newPhases[idx] = evt.kind === "phase_done" ? (evt.status === "fail" ? "fail" : "done") : "working";
              }
            }
            setPhases(newPhases);
            setActivePhaseMap(newActive);
          }
        })
        .catch(() => {});

      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      return;
    }

    const es = new EventSource("/api/events");
    eventSourceRef.current = es;

    const handler = (e: Event) => {
      try {
        const data = JSON.parse((e as MessageEvent).data);
        if (data.project !== projectKey) return;
        const hydrated = hydrateOutputEvent(data, `live-${Date.now()}`);
        if (!hydrated) return;
        setEvents((prev) => [...prev.slice(-500), hydrated]);
        const idx = resolvePhaseIndex(hydrated);
        if (idx >= 0) {
          setActivePhaseMap((prev) => ({ ...prev, [idx]: true }));
          setPhases((prev) => ({
            ...prev,
            [idx]: hydrated.kind === "phase_done" ? (hydrated.status === "fail" ? "fail" : "done") : "working",
          }));
        }
      } catch {}
    };

    for (const type of ["output", "start", "done", "stop"]) {
      es.addEventListener(type, handler);
    }

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
      setTimeout(() => {
        if (isRunning) {
          const retry = new EventSource("/api/events");
          eventSourceRef.current = retry;
        }
      }, 3000);
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [isRunning, projectKey]);

  if (events.length === 0) return null;

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#30363d]">
        <h2 className="text-sm font-medium text-[#e6edf3]">
          {isRunning ? "Live Output" : "Last Run Output"}
        </h2>
        <div className="flex gap-2">
          {isRunning && (
            <span className="w-2 h-2 rounded-full bg-[#3fb950] animate-pulse" />
          )}
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`text-xs px-2 py-0.5 rounded ${autoScroll ? "bg-[#21262d] text-[#e6edf3]" : "text-[#8b949e]"}`}
          >
            Auto-scroll
          </button>
        </div>
      </div>
      <div className="max-h-[400px] overflow-hidden">
        <RunChat
          events={events}
          activePhases={activePhaseMap}
          phaseStatuses={phases}
          selectedPhase={selectedPhase}
          onSelectPhase={setSelectedPhase}
          autoScroll={autoScroll}
          onAutoScrollChange={setAutoScroll}
          emptyText="No output yet"
        />
      </div>
    </div>
  );
}

// ── Expandable Experiment ────────────────────────────────────────────

function ExpandableExperiment({
  experiment,
  projectKey,
}: {
  experiment: { id: string; timestamp: string; directive: string; description: string; result: string; elapsed?: number; tools?: string[]; commit?: string };
  projectKey: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [cycleData, setCycleData] = useState<any>(null);

  useEffect(() => {
    if (expanded && !cycleData) {
      fetch(`/api/projects/${projectKey}/cycles/${experiment.id}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => setCycleData(data))
        .catch(() => {});
    }
  }, [expanded, cycleData, experiment.id, projectKey]);

  return (
    <div className="border-b border-[#30363d] last:border-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-4 py-3 hover:bg-[#0d111780] transition-colors flex items-center gap-3"
      >
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${experiment.result === "pass" ? "bg-[#3fb950]" : "bg-[#f85149]"}`}
        />
        <span className="mono text-xs text-[#484f58] w-16 shrink-0">{experiment.id}</span>
        <span className="text-sm text-[#c9d1d9] flex-1 truncate">{experiment.description}</span>
        {experiment.tools && experiment.tools.length > 0 && (
          <div className="flex gap-1 shrink-0">
            {experiment.tools.slice(0, 3).map((t) => (
              <AgentBadge key={t} agent={t} />
            ))}
          </div>
        )}
        {experiment.elapsed && (
          <span className="text-xs text-[#484f58] shrink-0">
            {experiment.elapsed > 60 ? `${Math.round(experiment.elapsed / 60)}m` : `${experiment.elapsed}s`}
          </span>
        )}
        <span className="text-xs text-[#484f58]">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && cycleData && (
        <div className="px-4 pb-3 space-y-2">
          {(cycleData.phases || []).map((phase: any, i: number) => (
            <AgentPhaseRow key={i} phase={phase} />
          ))}
        </div>
      )}
    </div>
  );
}

function AgentPhaseRow({ phase }: { phase: { name: string; tool: string; status: string; output: string; elapsed: number } }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="bg-[#0d1117] rounded-lg border border-[#21262d]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-3 py-2 flex items-center gap-2"
      >
        <span
          className={`w-1.5 h-1.5 rounded-full ${phase.status === "done" ? "bg-[#3fb950]" : phase.status === "fail" ? "bg-[#f85149]" : "bg-[#d29922]"}`}
        />
        <AgentBadge agent={phase.name || phase.tool} />
        <span className="text-xs text-[#8b949e] flex-1 truncate">{phase.output?.slice(0, 80)}</span>
        {phase.elapsed > 0 && (
          <span className="text-[10px] text-[#484f58]">
            {phase.elapsed > 60 ? `${Math.round(phase.elapsed / 60)}m` : `${phase.elapsed}s`}
          </span>
        )}
      </button>
      {expanded && phase.output && (
        <pre className="px-3 pb-2 text-xs text-[#8b949e] whitespace-pre-wrap max-h-48 overflow-auto">
          {phase.output}
        </pre>
      )}
    </div>
  );
}
