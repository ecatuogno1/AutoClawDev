import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import {
  useProject,
  useProjectExperiments,
  useGithub,
  useActiveRuns,
} from "@/lib/api";
import { ExperimentRow } from "@/components/ExperimentRow";
import { CycleTimeline } from "@/components/CycleTimeline";
import { RunButton } from "@/components/RunButton";
import { RunChat } from "@/components/RunChat";
import { StatsBar } from "@/components/StatsBar";
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

function ProjectDetail() {
  const { projectKey } = Route.useParams();
  const { data: project, isLoading } = useProject(projectKey);
  const { data: experiments } = useProjectExperiments(projectKey);
  const { data: github } = useGithub(projectKey, !!project?.gh_repo);
  const { data: activeRuns } = useActiveRuns();
  const isRunning = activeRuns?.[projectKey];

  if (isLoading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-8 animate-pulse h-96" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-8 text-center">
          <p className="text-[#f85149] text-lg">Project not found</p>
          <Link to="/projects" className="text-sm text-[#58a6ff] mt-2 inline-block">
            Back to projects
          </Link>
        </div>
      </div>
    );
  }

  // Calculate pass rate over time for chart
  const passRateOverTime =
    experiments?.reduce(
      (acc, exp, i) => {
        const passed = acc.passed + (exp.result === "pass" ? 1 : 0);
        const total = i + 1;
        acc.points.push({ rate: Math.round((passed / total) * 100), label: `#${exp.id}` });
        acc.passed = passed;
        return acc;
      },
      { points: [] as Array<{ rate: number; label: string }>, passed: 0 },
    )?.points ?? [];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link to="/" className="text-[#58a6ff] hover:underline">
          Home
        </Link>
        <span className="text-[#6e7681]">/</span>
        <Link to="/projects" className="text-[#58a6ff] hover:underline">
          Projects
        </Link>
        <span className="text-[#6e7681]">/</span>
        <span className="text-[#e6edf3]">{project.name}</span>
      </div>

      {/* Sub-page tabs */}
      <div className="flex gap-1 border-b border-[#30363d]">
        <span className="px-4 py-2 text-sm font-medium text-[#e6edf3] border-b-2 border-[#58a6ff]">
          Runs
        </span>
        <Link
          to="/projects/$projectKey/reviews"
          params={{ projectKey }}
          className="px-4 py-2 text-sm font-medium text-[#8b949e] hover:text-[#e6edf3] transition-colors"
        >
          Deep Reviews
        </Link>
        <Link
          to="/projects/$projectKey/memory"
          params={{ projectKey }}
          className="px-4 py-2 text-sm font-medium text-[#8b949e] hover:text-[#e6edf3] transition-colors"
        >
          Knowledge Base
        </Link>
      </div>

      {/* Project header */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-[#e6edf3]">{project.name}</h1>
            <span className="mono text-sm text-[#d29922]">{project.key}</span>
          </div>
          <RunButton projectKey={project.key} />
        </div>

        <p className="text-sm text-[#8b949e] mb-4">{project.description}</p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-[#6e7681] text-xs block">Path</span>
            <span className="mono text-xs text-[#e6edf3] break-all">{project.path}</span>
          </div>
          <div>
            <span className="text-[#6e7681] text-xs block">Package Manager</span>
            <span className="text-[#e6edf3]">{project.package_manager}</span>
          </div>
          <div>
            <span className="text-[#6e7681] text-xs block">Test Command</span>
            <span className="mono text-xs text-[#e6edf3]">{project.test_cmd}</span>
          </div>
          <div>
            <span className="text-[#6e7681] text-xs block">Lint Command</span>
            <span className="mono text-xs text-[#e6edf3]">{project.lint_cmd}</span>
          </div>
        </div>

        {/* Run defaults */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm mt-4">
          <div>
            <span className="text-[#6e7681] text-xs block">Team Profile</span>
            <span className="px-2 py-0.5 rounded-full text-xs bg-[#388bfd20] text-[#58a6ff] border border-[#388bfd40] inline-block">
              {project.team_profile || "reliability"}
            </span>
          </div>
          <div>
            <span className="text-[#6e7681] text-xs block">Speed</span>
            <span className="text-[#e6edf3] text-xs">{project.speed_profile || "balanced"}</span>
          </div>
          <div>
            <span className="text-[#6e7681] text-xs block">Workflow</span>
            <span className="text-[#e6edf3] text-xs">{project.workflow_type || "standard"}</span>
          </div>
          <div>
            <span className="text-[#6e7681] text-xs block">Default Cycles</span>
            <span className="text-[#e6edf3] text-xs">{project.default_cycles ?? 5}</span>
          </div>
          <div>
            <span className="text-[#6e7681] text-xs block">Parallel</span>
            <span className="text-[#e6edf3] text-xs">{project.max_parallel_cycles ?? 1}</span>
          </div>
        </div>

        {/* Validation commands summary */}
        {(project.security_cmd || project.performance_cmd || project.profile_validation) && (
          <div className="mt-3 pt-3 border-t border-[#30363d]">
            <span className="text-[#6e7681] text-xs block mb-2">Validation Profiles</span>
            <div className="flex flex-wrap gap-1.5">
              {project.security_cmd && (
                <span className="px-2 py-0.5 rounded-full text-xs bg-[#f8514920] text-[#f85149] border border-[#f8514940]">
                  security
                </span>
              )}
              {project.performance_cmd && (
                <span className="px-2 py-0.5 rounded-full text-xs bg-[#d2992220] text-[#d29922] border border-[#d2992240]">
                  performance
                </span>
              )}
              {project.profile_validation && Object.keys(project.profile_validation).map((name) => (
                <span
                  key={name}
                  className="px-2 py-0.5 rounded-full text-xs bg-[#3fb95020] text-[#3fb950] border border-[#3fb95040]"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        )}

        {project.gh_repo && (
          <div className="mt-3 pt-3 border-t border-[#30363d]">
            <span className="text-[#6e7681] text-xs">GitHub: </span>
            <a
              href={`https://github.com/${project.gh_repo}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mono text-xs text-[#58a6ff] hover:underline"
            >
              {project.gh_repo}
            </a>
            {project.gh_upstream && (
              <>
                <span className="text-[#6e7681] text-xs ml-3">Upstream: </span>
                <a
                  href={`https://github.com/${project.gh_upstream}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mono text-xs text-[#58a6ff] hover:underline"
                >
                  {project.gh_upstream}
                </a>
              </>
            )}
          </div>
        )}

        {/* Focus areas */}
        {project.focus.length > 0 && (
          <div className="mt-3 pt-3 border-t border-[#30363d]">
            <span className="text-[#6e7681] text-xs block mb-2">Focus Areas</span>
            <div className="flex flex-wrap gap-1.5">
              {project.focus.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded-full text-xs bg-[#388bfd20] text-[#58a6ff] border border-[#388bfd40]"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
        <h2 className="text-base font-semibold text-[#e6edf3] mb-4">Statistics</h2>
        <StatsBar
          passed={project.stats.passed}
          failed={project.stats.failed}
          total={project.stats.total}
          passRate={project.stats.passRate}
        />

        {/* Simple pass rate chart */}
        {passRateOverTime.length > 1 && (
          <div className="mt-6">
            <span className="text-xs text-[#6e7681] block mb-2">
              Pass Rate Trend
            </span>
            <div className="flex items-end gap-px h-24">
              {passRateOverTime.slice(-50).map((point, i) => (
                <div
                  key={i}
                  className="flex-1 min-w-[3px] rounded-t transition-all"
                  style={{
                    height: `${point.rate}%`,
                    backgroundColor:
                      point.rate >= 70
                        ? "#3fb950"
                        : point.rate >= 40
                          ? "#d29922"
                          : "#f85149",
                    opacity: 0.8,
                  }}
                  title={`${point.label}: ${point.rate}%`}
                />
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-[#6e7681] mt-1">
              <span>Oldest</span>
              <span>Latest</span>
            </div>
          </div>
        )}
      </div>

      {/* Pipeline */}
      <CycleTimeline />

      {/* Live Run Section */}
      <LiveRunPanel projectKey={projectKey} />

      {/* Two column layout: experiments + github */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Experiments */}
        <div className="lg:col-span-2">
          <h2 className="text-base font-semibold text-[#e6edf3] mb-4">
            Experiment History
          </h2>
          {experiments && experiments.length > 0 ? (
            <div className="bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden">
              {experiments.map((exp, i) => (
                <ExpandableExperiment key={i} experiment={exp} projectKey={projectKey} />
              ))}
            </div>
          ) : (
            <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-8 text-center">
              <p className="text-[#8b949e]">No experiments yet</p>
            </div>
          )}
        </div>

        {/* GitHub panel */}
        <div>
          {project.gh_repo && (
            <div className="space-y-4">
              {/* Issues */}
              <div>
                <h2 className="text-base font-semibold text-[#e6edf3] mb-4">
                  Open Issues
                </h2>
                <div className="bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden">
                  {github?.issues && github.issues.length > 0 ? (
                    github.issues.map((issue) => (
                      <div
                        key={issue.number}
                        className="px-4 py-3 border-b border-[#30363d] hover:bg-[#0d1117]"
                      >
                        <div className="flex items-start gap-2">
                          <span className="text-[#3fb950] text-xs mt-0.5">&#9679;</span>
                          <div>
                            <a
                              href={`https://github.com/${project.gh_repo}/issues/${issue.number}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-[#e6edf3] hover:text-[#58a6ff]"
                            >
                              #{issue.number} {issue.title}
                            </a>
                            <div className="flex gap-1 mt-1">
                              {issue.labels?.map((l) => (
                                <span
                                  key={l.name}
                                  className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#30363d] text-[#8b949e]"
                                >
                                  {l.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-sm text-[#8b949e] text-center">
                      No open issues
                    </div>
                  )}
                </div>
              </div>

              {/* PRs */}
              <div>
                <h2 className="text-base font-semibold text-[#e6edf3] mb-4">
                  Recent PRs
                </h2>
                <div className="bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden">
                  {github?.prs && github.prs.length > 0 ? (
                    github.prs.map((pr) => (
                      <div
                        key={pr.number}
                        className="px-4 py-3 border-b border-[#30363d] hover:bg-[#0d1117]"
                      >
                        <a
                          href={`https://github.com/${project.gh_repo}/pull/${pr.number}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-[#e6edf3] hover:text-[#58a6ff]"
                        >
                          #{pr.number} {pr.title}
                        </a>
                        <span
                          className={`text-[10px] ml-2 px-1.5 py-0.5 rounded-full ${
                            pr.state === "MERGED"
                              ? "bg-[#bc8cff20] text-[#bc8cff]"
                              : pr.state === "OPEN"
                                ? "bg-[#3fb95020] text-[#3fb950]"
                                : "bg-[#f8514920] text-[#f85149]"
                          }`}
                        >
                          {pr.state}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-sm text-[#8b949e] text-center">
                      No recent PRs
                    </div>
                  )}
                </div>
              </div>

              {/* Upstream issues */}
              {project.gh_upstream && github?.upstreamIssues && github.upstreamIssues.length > 0 && (
                <div>
                  <h2 className="text-base font-semibold text-[#e6edf3] mb-4">
                    Upstream Issues
                  </h2>
                  <div className="bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden">
                    {github.upstreamIssues.map((issue) => (
                      <div
                        key={issue.number}
                        className="px-4 py-3 border-b border-[#30363d] hover:bg-[#0d1117]"
                      >
                        <a
                          href={`https://github.com/${project.gh_upstream}/issues/${issue.number}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-[#e6edf3] hover:text-[#58a6ff]"
                        >
                          #{issue.number} {issue.title}
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Live Run Panel Component ──────────────────────────────────────────
function LiveRunPanel({ projectKey }: { projectKey: string }) {
  const { data: activeRuns } = useActiveRuns();
  const isRunning = activeRuns?.[projectKey];
  const [events, setEvents] = useState<RunConsoleEvent[]>([]);
  const [activePhases, setActivePhases] = useState<Record<number, boolean>>({});
  const [phaseStatuses, setPhaseStatuses] = useState<Record<number, RunStatus>>({});
  const [selectedPhase, setSelectedPhase] = useState<number | null>(null);
  const activePhasesRef = useRef<Record<number, boolean>>({});
  const wasRunningRef = useRef(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [lastLogEvents, setLastLogEvents] = useState<RunConsoleEvent[]>([]);
  const eventCounterRef = useRef(0);

  useEffect(() => {
    setEvents([]);
    setLastLogEvents([]);
    setSelectedPhase(null);
    setPhaseStatuses({});
    setActivePhases({});
    activePhasesRef.current = {};
    eventCounterRef.current = 0;
  }, [projectKey]);

  useEffect(() => {
    if (!isRunning) {
      wasRunningRef.current = false;
      setActivePhases({});
      activePhasesRef.current = {};
      return;
    }
    if (!wasRunningRef.current) {
      setEvents([]);
      setSelectedPhase(null);
      setPhaseStatuses({});
      setActivePhases({});
      activePhasesRef.current = {};
      eventCounterRef.current = 0;
    }
    wasRunningRef.current = true;

    const es = new EventSource("/api/events");
    es.addEventListener("output", (e) => {
      const data = JSON.parse(e.data);
      if (data.project !== projectKey) return;
      eventCounterRef.current += 1;
      const nextEvent = hydrateOutputEvent(data, `project-output-${eventCounterRef.current}`);
      setEvents((prev) => [...prev.slice(-400), nextEvent]);

      const phaseIdx = resolvePhaseIndex(nextEvent);
      if (phaseIdx >= 0 && nextEvent.status) {
        setPhaseStatuses((prev) => ({ ...prev, [phaseIdx]: nextEvent.status as RunStatus }));
        setActivePhases((prev) => {
          const next = { ...prev };
          if (nextEvent.status === "working") {
            next[phaseIdx] = true;
          } else {
            delete next[phaseIdx];
          }
          activePhasesRef.current = next;
          return next;
        });
      }
    });

    es.addEventListener("done", (e) => {
      const data = JSON.parse(e.data);
      if (data.project === projectKey) {
        setActivePhases({});
        activePhasesRef.current = {};
      }
    });

    return () => es.close();
  }, [isRunning, projectKey]);

  useEffect(() => {
    if (!isRunning && events.length === 0) {
      fetch(`/api/projects/${projectKey}/lastlog`)
        .then(r => r.ok ? r.json() : { events: [] })
        .then((data) => {
          const hydrated = Array.isArray(data.events)
            ? data.events.map((event: Omit<RunConsoleEvent, "id" | "type">, index: number) =>
              hydrateOutputEvent(event, `project-log-${index}`),
            )
            : [];
          setLastLogEvents(hydrated);
        })
        .catch(() => {});
    }
  }, [events.length, isRunning, projectKey]);

  const displayEvents = isRunning ? events : (events.length > 0 ? events : lastLogEvents);
  const hasContent = displayEvents.length > 0 || Object.keys(phaseStatuses).length > 0;

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden">
      <div className="px-5 py-3 border-b border-[#30363d] flex items-center gap-3">
        {isRunning ? (
          <div className="w-2 h-2 rounded-full bg-[#3fb950] animate-pulse" />
        ) : (
          <div className="w-2 h-2 rounded-full bg-[#484f58]" />
        )}
        <span className="text-sm font-semibold text-[#e6edf3]">
          {isRunning ? "Live Run" : "Run Console"}
        </span>
        {isRunning && (
          <span className="text-xs text-[#8b949e]">{isRunning.cycles} cycles</span>
        )}
        {!isRunning && !hasContent && (
          <span className="text-xs text-[#484f58]">No runs yet — start one above</span>
        )}
        {displayEvents.length > 0 && (
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`ml-auto text-xs px-3 py-1 rounded-full ${autoScroll ? "bg-[#388bfd20] text-[#58a6ff]" : "bg-[#30363d] text-[#8b949e]"}`}
          >
            {autoScroll ? "Auto-scroll ON" : "Auto-scroll OFF"}
          </button>
        )}
      </div>

      <RunChat
        activePhases={activePhases}
        autoScroll={autoScroll}
        emptyText="Run a cycle to see agent output here."
        events={displayEvents}
        isRunning={!!isRunning}
        onAutoScrollChange={setAutoScroll}
        onSelectPhase={setSelectedPhase}
        phaseStatuses={phaseStatuses}
        selectedPhase={selectedPhase}
        waitingText="The active run is connected. Agent threads will appear as work starts."
      />
    </div>
  );
}

// ── Expandable Experiment Row with Per-Agent Details ───────────────────
interface CycleData {
  id: string;
  phases: Array<{
    name: string;
    tool: string;
    status: string;
    output: string;
    elapsed: number;
  }>;
  result: string;
}

function ExpandableExperiment({ experiment, projectKey }: { experiment: any; projectKey: string }) {
  const [expanded, setExpanded] = useState(false);
  const [cycleData, setCycleData] = useState<CycleData | null>(null);
  const [loading, setLoading] = useState(false);

  const loadCycleData = async () => {
    if (cycleData) { setExpanded(!expanded); return; }
    setLoading(true);
    setExpanded(true);
    try {
      const res = await fetch(`/api/projects/${projectKey}/cycles/${experiment.id}`);
      if (res.ok) {
        setCycleData(await res.json());
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  const tools = Array.isArray(experiment.tools)
    ? experiment.tools
    : typeof experiment.tools === 'string'
      ? experiment.tools.split('+')
      : [];

  const elapsed = experiment.elapsed
    ? experiment.elapsed > 60
      ? `${Math.floor(experiment.elapsed / 60)}m ${experiment.elapsed % 60}s`
      : `${experiment.elapsed}s`
    : '';

  return (
    <div className="border-b border-[#30363d]">
      {/* Main row — clickable */}
      <div
        onClick={loadCycleData}
        className="flex items-center gap-3 px-4 py-3 hover:bg-[#0d1117] cursor-pointer"
      >
        {/* Expand icon */}
        <span className={`text-[#484f58] text-xs transition-transform ${expanded ? 'rotate-90' : ''}`}>▶</span>

        {/* Result icon */}
        <span className={experiment.result === 'pass' ? 'text-[#3fb950]' : 'text-[#f85149]'}>
          {experiment.result === 'pass' ? '✓' : '✗'}
        </span>

        {/* ID */}
        <span className="mono text-xs text-[#8b949e] w-16 shrink-0">{experiment.id}</span>

        {/* Description */}
        <span className="text-sm text-[#e6edf3] truncate flex-1">
          {experiment.description || experiment.directive || '?'}
        </span>

        {/* Domain badge */}
        {experiment.domain && experiment.domain !== 'unknown' && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
            experiment.domain === 'frontend'
              ? 'bg-[#bc8cff20] text-[#bc8cff]'
              : 'bg-[#388bfd20] text-[#58a6ff]'
          }`}>
            {experiment.domain}
          </span>
        )}

        {/* Tools */}
        <div className="hidden lg:flex items-center gap-1 shrink-0">
          {tools.slice(0, 3).map((tool: string, i: number) => (
            <AgentBadge key={i} agent={tool} />
          ))}
        </div>

        {/* Time */}
        <span className="text-xs text-[#484f58] w-14 text-right shrink-0">{elapsed}</span>

        {/* Commit */}
        <span className="mono text-xs text-[#bc8cff] w-16 text-right shrink-0">
          {experiment.commit?.slice(0, 7) || ''}
        </span>
      </div>

      {/* Expanded: per-agent details */}
      {expanded && (
        <div className="bg-[#0d1117] border-t border-[#21262d] px-6 py-4">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-[#484f58]">
              <span className="animate-pulse">Loading agent details...</span>
            </div>
          ) : cycleData?.phases && cycleData.phases.length > 0 ? (
            <div className="space-y-2">
              {cycleData.phases.map((phase, i) => (
                <AgentPhaseRow key={i} phase={phase} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-[#484f58]">
              No detailed agent logs available for this cycle.
              {!cycleData && " (Run was before per-agent logging was added)"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Single Agent Phase Row ────────────────────────────────────────────
function AgentPhaseRow({ phase }: { phase: CycleData['phases'][0] }) {
  const [showOutput, setShowOutput] = useState(false);

  const statusColor = phase.status === 'ok'
    ? 'text-[#3fb950]'
    : phase.status === 'fail'
      ? 'text-[#f85149]'
      : 'text-[#d29922]';

  const statusIcon = phase.status === 'ok' ? '✓' : phase.status === 'fail' ? '✗' : '⟳';

  const toolColors: Record<string, string> = {
    gemini: 'bg-[#4285f420] text-[#8ab4f8]',
    opus: 'bg-[#bc8cff20] text-[#bc8cff]',
    claude: 'bg-[#d29922] text-[#0d1117]',
    sonnet: 'bg-[#d2992220] text-[#d29922]',
    codex: 'bg-[#3fb95020] text-[#3fb950]',
    'codex 5.4': 'bg-[#3fb95020] text-[#3fb950]',
    coderabbit: 'bg-[#f7883620] text-[#f78836]',
    direct: 'bg-[#30363d] text-[#8b949e]',
    git: 'bg-[#30363d] text-[#8b949e]',
  };

  return (
    <div>
      <div
        onClick={() => phase.output && setShowOutput(!showOutput)}
        className={`flex items-center gap-3 py-1.5 text-xs ${phase.output ? 'cursor-pointer hover:bg-[#161b22] rounded px-2 -mx-2' : ''}`}
      >
        {/* Status */}
        <span className={`${statusColor} w-4`}>{statusIcon}</span>

        {/* Agent name */}
        <span className="text-[#e6edf3] font-medium w-16">{phase.name}</span>

        {/* Tool badge */}
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${toolColors[phase.tool] || toolColors.direct}`}>
          {phase.tool}
        </span>

        {/* Output preview */}
        <span className="text-[#8b949e] truncate flex-1">
          {phase.output?.slice(0, 80) || '—'}
        </span>

        {/* Elapsed */}
        <span className="text-[#484f58] w-10 text-right">
          {phase.elapsed > 0 ? `${phase.elapsed}s` : ''}
        </span>

        {/* Expand indicator */}
        {phase.output && (
          <span className={`text-[#484f58] transition-transform ${showOutput ? 'rotate-90' : ''}`}>▶</span>
        )}
      </div>

      {/* Full output */}
      {showOutput && phase.output && (
        <div className="mt-1 mb-2 ml-7 p-3 rounded bg-[#161b22] border border-[#21262d]">
          <pre className="text-[11px] text-[#8b949e] whitespace-pre-wrap font-mono leading-relaxed max-h-[300px] overflow-y-auto">
            {phase.output}
          </pre>
        </div>
      )}
    </div>
  );
}
