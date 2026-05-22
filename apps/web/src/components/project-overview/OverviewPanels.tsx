import type { ActiveRun, ExecutionKind, ProjectDetail, ProjectHealth, RunRecord } from "@autoclawdev/types";
import type { GithubData } from "@/types";
import { HistoryRow } from "@/components/HistoryRow";
import { rateBg, rateColor, timeAgo } from "@/components/project-overview/overviewModel";

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-4">
      <div className={`text-2xl font-bold ${color || "text-[#e6edf3]"}`}>{value}</div>
      <div className="mt-0.5 text-xs text-[#8b949e]">{label}</div>
      {sub ? <div className="mt-0.5 text-xs text-[#484f58]">{sub}</div> : null}
    </div>
  );
}

export function ProjectHeroCard({
  auditStatus,
  health,
  isRunning,
  openFindings,
  project,
  recoveryCount,
  reviewCount,
  reviewStatus,
  trend,
}: {
  auditStatus?: string;
  health?: ProjectHealth;
  isRunning: boolean;
  openFindings: number;
  project: ProjectDetail;
  recoveryCount: number;
  reviewCount: number;
  reviewStatus?: string;
  trend: { icon: string; color: string; bg: string; label: string };
}) {
  return (
    <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-6">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="mb-1 flex items-center gap-3">
            <span
              className={`h-3 w-3 rounded-full ${isRunning ? "animate-pulse bg-[#3fb950]" : "bg-[#30363d]"}`}
            />
            <h1 className="text-2xl font-bold text-[#e6edf3]">{project.name}</h1>
          </div>
          <p className="mb-4 text-sm text-[#8b949e]">{project.description}</p>

          <div className="flex flex-wrap gap-2">
            {isRunning ? (
              <span className="rounded-full bg-[#3fb95020] px-2.5 py-1 text-xs font-medium text-[#3fb950] animate-pulse">
                Running
              </span>
            ) : null}
            {health?.hasMemory ? (
              <span className="rounded-full bg-[#1f6feb15] px-2.5 py-1 text-xs text-[#58a6ff]">
                Memory Active
              </span>
            ) : null}
            {reviewCount > 0 ? (
              <span className="rounded-full bg-[#3fb95015] px-2.5 py-1 text-xs text-[#3fb950]">
                {reviewCount} Review{reviewCount !== 1 ? "s" : ""}
              </span>
            ) : null}
            {reviewStatus ? (
              <span className="rounded-full bg-[#58a6ff15] px-2.5 py-1 text-xs text-[#58a6ff]">
                Review {reviewStatus.replace(/_/g, " ")}
              </span>
            ) : null}
            {auditStatus ? (
              <span className="rounded-full bg-[#d2992215] px-2.5 py-1 text-xs text-[#d29922]">
                Audit {auditStatus.replace(/_/g, " ")}
              </span>
            ) : null}
            {openFindings > 0 ? (
              <span className="rounded-full bg-[#d2992215] px-2.5 py-1 text-xs text-[#d29922]">
                {openFindings} Open Finding{openFindings !== 1 ? "s" : ""}
              </span>
            ) : null}
            {recoveryCount > 0 ? (
              <span className="rounded-full bg-[#f8514915] px-2.5 py-1 text-xs font-medium text-[#f85149]">
                {recoveryCount} Recovery
              </span>
            ) : null}
            <span className={`rounded-full px-2.5 py-1 text-xs ${trend.bg} ${trend.color}`}>
              {trend.icon} {trend.label}
            </span>
          </div>
        </div>

        <div className="ml-6 text-right">
          {project.stats.total > 0 ? (
            <>
              <div className={`text-5xl font-bold ${rateColor(project.stats.passRate)}`}>
                {project.stats.passRate}%
              </div>
              <div className="mt-1 text-xs text-[#8b949e]">
                {(project.stats.cleanPassed ?? project.stats.passed)} clean / {(project.stats.degradedPassed ?? 0)} degraded / {project.stats.failed} failed
              </div>
            </>
          ) : (
            <div className="text-3xl font-bold text-[#484f58]">—</div>
          )}
          <div className="mt-3 text-xs text-[#8b949e]">
            Managed controls now live below in the execution panel.
          </div>
        </div>
      </div>

      {project.stats.total > 0 ? (
        <div className="mt-4">
          <div className="h-2 w-full overflow-hidden rounded-full bg-[#21262d]">
            <div
              className={`h-full rounded-full ${rateBg(project.stats.passRate)}`}
              style={{ width: `${project.stats.passRate}%` }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface ExecutionPanelEntry {
  mode: ExecutionKind;
  label: string;
  status?: string;
  summary?: string;
  updatedAt?: string;
  runId?: string;
  approvalsPending?: string[];
  active: boolean;
  canResume: boolean;
}

function executionModeTint(mode: ExecutionKind) {
  switch (mode) {
    case "run":
      return {
        badge: "bg-[#3fb95015] text-[#3fb950]",
        button: "bg-[#238636] text-white hover:bg-[#2ea043]",
        outline: "border-[#3fb95040] bg-[#3fb95012] text-[#3fb950] hover:bg-[#3fb95018]",
      };
    case "review":
      return {
        badge: "bg-[#58a6ff15] text-[#58a6ff]",
        button: "bg-[#1f6feb] text-white hover:bg-[#388bfd]",
        outline: "border-[#58a6ff40] bg-[#58a6ff15] text-[#58a6ff] hover:bg-[#58a6ff20]",
      };
    case "build":
      return {
        badge: "bg-[#a371f715] text-[#a371f7]",
        button: "bg-[#8957e5] text-white hover:bg-[#a371f7]",
        outline: "border-[#a371f740] bg-[#a371f715] text-[#a371f7] hover:bg-[#a371f720]",
      };
    case "audit":
      return {
        badge: "bg-[#d2992215] text-[#d29922]",
        button: "bg-[#d29922] text-[#0d1117] hover:bg-[#e3b341]",
        outline: "border-[#d2992240] bg-[#d2992215] text-[#d29922] hover:bg-[#d2992220]",
      };
  }
}

function formatExecutionStatus(status?: string) {
  return status ? status.replace(/_/g, " ") : "idle";
}

function ExecutionModeCard({
  entry,
  hasActiveExecution,
  onApproveGate,
  onResume,
  onStart,
  onStop,
  startPending,
  resumePending,
  approvePending,
  stopPending,
}: {
  entry: ExecutionPanelEntry;
  hasActiveExecution: boolean;
  onApproveGate: (runId: string, gate: string) => void;
  onResume: (runId: string) => void;
  onStart: (mode: ExecutionKind) => void;
  onStop: () => void;
  startPending: boolean;
  resumePending: boolean;
  approvePending: boolean;
  stopPending: boolean;
}) {
  const tint = executionModeTint(entry.mode);
  const canStart = !hasActiveExecution || entry.active;

  return (
    <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-[#e6edf3]">{entry.label}</h3>
            <span className={`rounded-full px-2 py-0.5 text-[11px] ${tint.badge}`}>
              {formatExecutionStatus(entry.status)}
            </span>
          </div>
          <div className="mt-1 text-xs text-[#8b949e]">
            {entry.updatedAt ? `Updated ${timeAgo(entry.updatedAt)}` : "No managed execution yet"}
          </div>
        </div>
        {entry.active ? <span className="h-2.5 w-2.5 rounded-full bg-[#3fb950] animate-pulse" /> : null}
      </div>

      <div className="mt-3 min-h-[40px] text-sm text-[#c9d1d9]">
        {entry.summary ?? "Ready to launch from the shared control plane."}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {entry.active ? (
          <button
            type="button"
            onClick={onStop}
            disabled={stopPending}
            className="rounded-md bg-[#da3633] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#f85149] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {stopPending ? "Stopping…" : "Stop"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onStart(entry.mode)}
            disabled={startPending || !canStart}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${tint.button}`}
          >
            {startPending ? "Starting…" : entry.status ? `Start New ${entry.label}` : `Start ${entry.label}`}
          </button>
        )}
        {entry.canResume && entry.runId ? (
          <button
            type="button"
            onClick={() => onResume(entry.runId!)}
            disabled={resumePending || hasActiveExecution}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${tint.outline}`}
          >
            {resumePending ? "Resuming…" : `Resume ${entry.label}`}
          </button>
        ) : null}
      </div>

      {entry.approvalsPending && entry.approvalsPending.length > 0 && entry.runId ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {entry.approvalsPending.slice(0, 3).map((gate) => (
            <button
              key={gate}
              type="button"
              onClick={() => onApproveGate(entry.runId!, gate)}
              disabled={approvePending}
              className="rounded-md border border-[#58a6ff40] bg-[#58a6ff15] px-3 py-1.5 text-xs font-medium text-[#58a6ff] transition-colors hover:bg-[#58a6ff20] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {approvePending ? "Approving…" : `Approve ${gate}`}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ProjectExecutionPanel({
  activeRun,
  entries,
  onApproveGate,
  onResume,
  onStart,
  onStop,
  approvePending,
  resumePending,
  startPending,
  stopPending,
}: {
  activeRun?: ActiveRun;
  entries: ExecutionPanelEntry[];
  onApproveGate: (runId: string, gate: string) => void;
  onResume: (runId: string) => void;
  onStart: (mode: ExecutionKind) => void;
  onStop: () => void;
  approvePending: boolean;
  resumePending: boolean;
  startPending: boolean;
  stopPending: boolean;
}) {
  return (
    <div className="rounded-xl border border-[#30363d] bg-[#0d1117] p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-[#e6edf3]">Executions</h2>
          <p className="mt-1 text-sm text-[#8b949e]">
            One managed control plane for run, review, build, and audit.
          </p>
        </div>
        <div className="text-right text-xs text-[#8b949e]">
          {activeRun ? (
            <>
              <div className="font-medium text-[#3fb950]">Execution active</div>
              <div>Started {timeAgo(activeRun.startedAt)}</div>
            </>
          ) : (
            <div>No active execution</div>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {entries.map((entry) => (
          <ExecutionModeCard
            key={entry.mode}
            entry={entry}
            hasActiveExecution={Boolean(activeRun)}
            onApproveGate={onApproveGate}
            onResume={onResume}
            onStart={onStart}
            onStop={onStop}
            approvePending={approvePending}
            resumePending={resumePending}
            startPending={startPending}
            stopPending={stopPending}
          />
        ))}
      </div>
    </div>
  );
}

export function ProjectStatsGrid({
  lastRunCreatedAt,
  project,
}: {
  lastRunCreatedAt?: string;
  project: ProjectDetail;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
      <StatCard
        label="Total Runs"
        value={project.stats.total}
        sub={lastRunCreatedAt ? `Last: ${timeAgo(lastRunCreatedAt)}` : undefined}
      />
      <StatCard
        label="Pass Rate"
        value={`${project.stats.passRate}%`}
        color={rateColor(project.stats.passRate)}
      />
      <StatCard
        label="Passed"
        value={project.stats.cleanPassed ?? project.stats.passed}
        color="text-[#3fb950]"
      />
      <StatCard
        label="Degraded"
        value={project.stats.degradedPassed ?? 0}
        color="text-[#d29922]"
      />
      <StatCard
        label="Failed"
        value={project.stats.failed}
        color="text-[#f85149]"
      />
    </div>
  );
}

export function PassRateTrendCard({ points }: { points: Array<{ rate: number }> }) {
  if (points.length <= 1) {
    return null;
  }

  const visiblePoints = points.slice(-60);

  return (
    <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-5">
      <h2 className="mb-3 text-sm font-medium text-[#8b949e]">Pass Rate Trend</h2>
      <div className="flex h-20 items-end gap-px">
        {visiblePoints.map((point, index) => (
          <div
            key={`${point.rate}-${index}`}
            className="min-w-[2px] flex-1 rounded-t"
            style={{
              height: `${Math.max(point.rate, 2)}%`,
              backgroundColor: point.rate >= 70 ? "#3fb950" : point.rate >= 40 ? "#d29922" : "#f85149",
              opacity: 0.7 + (index / visiblePoints.length) * 0.3,
            }}
            title={`${point.rate}%`}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-[#484f58]">
        <span>Oldest</span>
        <span>Latest</span>
      </div>
    </div>
  );
}

export function RunHistoryPanel({
  projectKey,
  runs,
}: {
  projectKey: string;
  runs: RunRecord[] | undefined;
}) {
  return (
    <div className="lg:col-span-2">
      <h2 className="mb-3 text-base font-semibold text-[#e6edf3]">Run History</h2>
      {runs && runs.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-[#30363d] bg-[#161b22]">
          {runs.slice(0, 20).map((run) => (
            <HistoryRow key={run.id} run={run} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-8 text-center">
          <p className="text-[#8b949e]">No run history yet</p>
          <p className="mt-1 text-xs text-[#484f58]">
            Run <code className="text-[#d29922]">autoclaw run {projectKey}</code> to start
          </p>
        </div>
      )}
    </div>
  );
}

export function ProjectSidebar({
  github,
  project,
}: {
  github?: GithubData;
  project: ProjectDetail;
}) {
  const hasIssues = Boolean(project.gh_repo && github?.issues && github.issues.length > 0);

  return (
    <div>
      {hasIssues ? (
        <GithubIssuesPanel github={github} ghRepo={project.gh_repo!} />
      ) : null}
      <ProjectConfigPanel
        className={hasIssues ? "mt-4" : undefined}
        project={project}
      />
    </div>
  );
}

function GithubIssuesPanel({
  github,
  ghRepo,
}: {
  github: GithubData | undefined;
  ghRepo: string;
}) {
  return (
    <div>
      <h2 className="mb-3 text-base font-semibold text-[#e6edf3]">Open Issues</h2>
      <div className="overflow-hidden rounded-xl border border-[#30363d] bg-[#161b22]">
        {github?.issues.slice(0, 10).map((issue) => (
          <a
            key={issue.number}
            href={`https://github.com/${ghRepo}/issues/${issue.number}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-2 border-b border-[#30363d] px-4 py-3 transition-colors last:border-0 hover:bg-[#0d111780]"
          >
            <span className="mt-0.5 shrink-0 text-xs text-[#3fb950]">●</span>
            <div className="min-w-0">
              <span className="text-sm text-[#e6edf3] hover:text-[#58a6ff]">
                #{issue.number} {issue.title}
              </span>
              {issue.labels.length > 0 ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  {issue.labels.slice(0, 3).map((label) => (
                    <span
                      key={label.name}
                      className="rounded bg-[#21262d] px-1.5 py-0.5 text-[10px] text-[#8b949e]"
                    >
                      {label.name}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

function ProjectConfigPanel({
  className,
  project,
}: {
  className?: string;
  project: ProjectDetail;
}) {
  return (
    <div className={className}>
      <h2 className="mb-3 text-base font-semibold text-[#e6edf3]">Config</h2>
      <div className="space-y-2 rounded-xl border border-[#30363d] bg-[#161b22] p-4 text-sm">
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
        {project.gh_repo ? (
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
        ) : null}
      </div>
    </div>
  );
}
