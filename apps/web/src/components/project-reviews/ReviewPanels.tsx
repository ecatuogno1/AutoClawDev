import { useState, type ReactNode } from "react";
import type { DeepReviewManagedRun, DeepReviewSession } from "@autoclawdev/types";
import type {
  ExecutionPlanPhase,
  ParsedAuditReport,
  ParsedProgress,
  ReviewFinding,
  ReviewSeverity,
} from "@/components/project-reviews/reviewModel";
import { severityConfig } from "@/components/project-reviews/reviewModel";

export type ReviewContentTab = "findings" | "plan" | "progress" | "sessions";

function phaseTone(status: string) {
  switch (status) {
    case "completed":
      return "border-[#3fb95040] bg-[#3fb95012] text-[#3fb950]";
    case "running":
      return "border-[#58a6ff40] bg-[#58a6ff12] text-[#58a6ff]";
    case "failed":
      return "border-[#f8514940] bg-[#f8514912] text-[#ff7b72]";
    case "skipped":
      return "border-[#8b949e30] bg-[#8b949e10] text-[#8b949e]";
    default:
      return "border-[#30363d] bg-[#0d1117] text-[#8b949e]";
  }
}

function statusTone(status: string) {
  switch (status) {
    case "completed":
      return "bg-[#3fb95020] text-[#3fb950]";
    case "running":
      return "bg-[#58a6ff20] text-[#58a6ff]";
    case "queued":
      return "bg-[#d2992220] text-[#d29922]";
    case "failed":
    case "preflight_failed":
      return "bg-[#f8514920] text-[#ff7b72]";
    default:
      return "bg-[#21262d] text-[#8b949e]";
  }
}

export function ReviewRunStatusPanel({
  managedRun,
  actions,
}: {
  managedRun: DeepReviewManagedRun;
  actions?: ReactNode;
}) {
  const activePhase = managedRun.phases.find((phase) => phase.status === "running")
    ?? managedRun.phases.find((phase) => phase.status === "queued")
    ?? managedRun.phases[managedRun.phases.length - 1];

  return (
    <section className="rounded-2xl border border-[#30363d] bg-[#161b22] p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-[#e6edf3]">Managed Review Run</h2>
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusTone(managedRun.status)}`}>
              {managedRun.status.replace(/_/g, " ")}
            </span>
          </div>
          <p className="mt-1 text-sm text-[#8b949e]">
            {managedRun.summary || "Deep review is running through the managed control plane."}
          </p>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-[#6e7681]">
            <span className="mono">runId {managedRun.runId.slice(0, 24)}</span>
            <span>started {new Date(managedRun.createdAt).toLocaleString()}</span>
            <span>updated {new Date(managedRun.updatedAt).toLocaleString()}</span>
          </div>
        </div>
        {activePhase ? (
          <div className="rounded-xl border border-[#30363d] bg-[#0d1117] px-4 py-3 text-right">
            <div className="text-xs uppercase tracking-[0.2em] text-[#6e7681]">Current Phase</div>
            <div className="mt-1 text-sm font-medium text-[#e6edf3]">{activePhase.name}</div>
            {activePhase.detail ? (
              <div className="mt-1 max-w-[20rem] text-xs text-[#8b949e]">{activePhase.detail}</div>
            ) : null}
          </div>
        ) : null}
      </div>

      {actions ? <div className="mt-4">{actions}</div> : null}

      <div className="mt-6 grid gap-3 md:grid-cols-4">
        {managedRun.phases.map((phase, index) => (
          <div key={phase.name} className={`rounded-xl border p-4 ${phaseTone(phase.status)}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.2em]">{phase.name}</span>
              <span className="text-[11px] uppercase">{phase.status.replace(/_/g, " ")}</span>
            </div>
            <div className="mt-3 text-2xl font-semibold text-[#e6edf3]">{index + 1}</div>
            {phase.detail ? (
              <p className="mt-2 text-xs leading-relaxed text-[#8b949e]">{phase.detail}</p>
            ) : null}
          </div>
        ))}
      </div>

      {managedRun.latestEvents.length > 0 ? (
        <div className="mt-6 rounded-xl border border-[#30363d] bg-[#0d1117] p-4">
          <h3 className="text-sm font-medium text-[#e6edf3]">Recent Review Events</h3>
          <div className="mt-3 space-y-2">
            {managedRun.latestEvents.slice().reverse().map((event, index) => (
              <div key={`${event.timestamp}-${index}`} className="flex items-start gap-3 text-sm">
                <span className="mt-0.5 rounded-full bg-[#21262d] px-2 py-0.5 text-[11px] uppercase text-[#8b949e]">
                  {event.type}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[#c9d1d9]">{event.message || "No message"}</div>
                  <div className="mt-0.5 text-xs text-[#6e7681]">{new Date(event.timestamp).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function ReviewSummaryStats({ audit }: { audit: ParsedAuditReport }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
      <ReviewStatCard label="Total Issues" value={audit.totalFindings} color="text-[#e6edf3]" />
      <ReviewStatCard label="Critical" value={audit.criticalCount} color="text-[#ff7b72]" />
      <ReviewStatCard label="High" value={audit.highCount} color="text-[#d29922]" />
      <ReviewStatCard label="Medium" value={audit.mediumCount} color="text-[#58a6ff]" />
      <ReviewStatCard label="Low" value={audit.lowCount} color="text-[#8b949e]" />
    </div>
  );
}

export function ReviewTabNav({
  activeTab,
  hasAuditReport,
  hasExecutionPlan,
  hasProgress,
  onSelectTab,
}: {
  activeTab: ReviewContentTab;
  hasAuditReport?: boolean;
  hasExecutionPlan?: boolean;
  hasProgress?: boolean;
  onSelectTab: (tab: ReviewContentTab) => void;
}) {
  const tabs = [
    { key: "findings" as const, label: "Issues Found", show: hasAuditReport },
    { key: "plan" as const, label: "Fix Plan", show: hasExecutionPlan },
    { key: "progress" as const, label: "What Was Fixed", show: hasProgress },
    { key: "sessions" as const, label: "Past Reviews", show: true },
  ];

  return (
    <div className="flex gap-1 border-b border-[#30363d]">
      {tabs.filter((tab) => tab.show).map((tab) => (
        <button
          key={tab.key}
          type="button"
          className={`px-5 py-3 text-sm font-medium transition-colors ${
            activeTab === tab.key
              ? "border-b-2 border-[#58a6ff] text-[#e6edf3]"
              : "text-[#8b949e] hover:text-[#e6edf3]"
          }`}
          onClick={() => onSelectTab(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function ReviewFindingsPanel({
  audit,
  severityFilter,
  onSeverityFilterChange,
}: {
  audit: ParsedAuditReport;
  severityFilter: "all" | ReviewSeverity;
  onSeverityFilterChange: (severity: "all" | ReviewSeverity) => void;
}) {
  const filteredSections =
    severityFilter === "all"
      ? audit.sections
      : audit.sections
          .map((section) => ({
            ...section,
            findings: section.findings.filter((finding) => finding.severity === severityFilter),
          }))
          .filter((section) => section.findings.length > 0);

  const filters = [
    { key: "all" as const, label: "All", count: audit.totalFindings },
    { key: "critical" as const, label: "Critical", count: audit.criticalCount },
    { key: "high" as const, label: "High", count: audit.highCount },
    { key: "medium" as const, label: "Medium", count: audit.mediumCount },
    { key: "low" as const, label: "Low", count: audit.lowCount },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {filters
          .filter((filter) => filter.count > 0 || filter.key === "all")
          .map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => onSeverityFilterChange(filter.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                severityFilter === filter.key
                  ? "bg-[#58a6ff] text-white"
                  : "bg-[#21262d] text-[#8b949e] hover:text-[#e6edf3]"
              }`}
            >
              {filter.label} ({filter.count})
            </button>
          ))}
      </div>

      {filteredSections.map((section) => (
        <div key={section.name}>
          <h2 className="mb-3 text-lg font-semibold capitalize text-[#e6edf3]">{section.name}</h2>
          <div className="space-y-2">
            {section.findings.map((finding, index) => (
              <ReviewFindingCard
                key={`${section.name}-${finding.file}-${index}`}
                finding={finding}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ReviewPlanPanel({ plan }: { plan: ExecutionPlanPhase[] }) {
  return (
    <div className="space-y-4">
      <p className="text-[#8b949e]">
        The AI created this step-by-step plan to fix the issues it found. Work through each phase in order.
      </p>
      {plan.map((phase, index) => (
        <ReviewPhaseCard key={phase.phase} phase={phase.phase} steps={phase.steps} index={index} />
      ))}
    </div>
  );
}

export function ReviewProgressPanel({ progress }: { progress: ParsedProgress }) {
  return (
    <div className="space-y-8">
      {progress.phases.length > 0 ? (
        <section>
          <h2 className="mb-4 text-lg font-semibold text-[#e6edf3]">What was done</h2>
          <div className="relative">
            <div className="absolute bottom-6 left-[18px] top-6 w-0.5 bg-[#30363d]" />
            <div className="space-y-6">
              {progress.phases.map((phase, index) => (
                <div key={phase.title} className="relative flex gap-4">
                  <div className="relative z-10 mt-1.5 shrink-0">
                    <div className="flex h-[38px] w-[38px] items-center justify-center rounded-full border-2 border-[#3fb950] bg-[#3fb95020]">
                      <span className="text-sm font-bold text-[#3fb950]">{index + 1}</span>
                    </div>
                  </div>
                  <div className="flex-1 pb-2">
                    <div className="mb-2 flex items-center gap-3">
                      <h3 className="text-base font-semibold text-[#e6edf3]">{phase.title}</h3>
                      <div className="flex gap-1.5">
                        {phase.verified ? (
                          <span className="rounded-full bg-[#3fb95020] px-2 py-0.5 text-xs text-[#3fb950]">
                            Verified
                          </span>
                        ) : null}
                        {phase.deployed ? (
                          <span className="rounded-full bg-[#1f6feb20] px-2 py-0.5 text-xs text-[#58a6ff]">
                            Deployed
                          </span>
                        ) : null}
                        {phase.commit ? (
                          <span className="rounded-full bg-[#21262d] px-2 py-0.5 font-mono text-xs text-[#8b949e]">
                            {phase.commit.slice(0, 7)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {phase.changes.length > 0 ? (
                      <ul className="ml-1 space-y-1.5">
                        {phase.changes.map((change) => (
                          <li key={change} className="flex gap-2 text-sm text-[#c9d1d9]">
                            <span className="mt-0.5 shrink-0 text-[#3fb950]">✓</span>
                            <span>{change}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {progress.nextSteps.length > 0 ? (
        <ProgressListSection
          title="Still to do"
          count={progress.nextSteps.length}
          badgeClassName="bg-[#d2992220] text-[#d29922]"
          itemClassName="border border-[#d2992220] bg-[#d2992208]"
          icon={<span className="mt-0.5 shrink-0 text-lg text-[#d29922]">→</span>}
          textClassName="text-[#c9d1d9]"
          items={progress.nextSteps}
        />
      ) : null}

      {progress.deferred.length > 0 ? (
        <ProgressListSection
          title="Skipped for now"
          count={progress.deferred.length}
          badgeClassName="bg-[#8b949e20] text-[#8b949e]"
          itemClassName="border border-[#8b949e20] bg-[#8b949e08]"
          icon={<span className="mt-0.5 shrink-0 text-[#484f58]">○</span>}
          textClassName="text-[#8b949e]"
          items={progress.deferred}
        />
      ) : null}
    </div>
  );
}

export function ReviewSessionsPanel({
  isLoading,
  reviews,
}: {
  isLoading: boolean;
  reviews: DeepReviewSession[];
}) {
  if (isLoading) {
    return <div className="h-48 animate-pulse rounded-xl border border-[#30363d] bg-[#161b22]" />;
  }

  if (reviews.length === 0) {
    return (
      <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-8 text-center">
        <p className="text-[#8b949e]">No past review sessions</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {reviews.map((review, index) => (
        <div
          key={`${review.startedAt}-${index}`}
          className="flex items-center gap-4 rounded-xl border border-[#30363d] bg-[#161b22] p-5"
        >
          <div
            className={`h-3 w-3 shrink-0 rounded-full ${
              review.exitCode === 0
                ? "bg-[#3fb950]"
                : review.endedAt
                  ? "bg-[#f85149]"
                  : "animate-pulse bg-[#d29922]"
            }`}
          />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-[#e6edf3]">{formatProviderName(review.provider)} Review</div>
            <div className="mt-0.5 text-xs text-[#8b949e]">
              {review.startedAt
                ? new Date(review.startedAt).toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })
                : null}
            </div>
            {review.runId ? (
              <div className="mt-1 text-xs text-[#6e7681]">
                <span className="mono">{review.runId.slice(0, 24)}</span>
                {review.runStatus ? ` · ${review.runStatus.replace(/_/g, " ")}` : ""}
              </div>
            ) : null}
          </div>
          <div className="flex gap-2">
            {review.hasAuditReport ? (
              <span className="rounded-full bg-[#1f6feb20] px-2.5 py-1 text-xs text-[#58a6ff]">Report</span>
            ) : null}
            {review.hasExecutionPlan ? (
              <span className="rounded-full bg-[#3fb95020] px-2.5 py-1 text-xs text-[#3fb950]">Plan</span>
            ) : null}
            {review.hasProgress ? (
              <span className="rounded-full bg-[#d2992220] px-2.5 py-1 text-xs text-[#d29922]">Progress</span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function ReviewStatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-5 text-center">
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
      <div className="mt-1 text-sm text-[#8b949e]">{label}</div>
    </div>
  );
}

function ReviewSeverityBadge({ severity }: { severity: ReviewSeverity }) {
  const config = severityConfig[severity];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
}

function ReviewFindingCard({ finding }: { finding: ReviewFinding }) {
  const [expanded, setExpanded] = useState(false);
  const config = severityConfig[finding.severity];

  return (
    <button
      type="button"
      onClick={() => setExpanded((current) => !current)}
      className={`w-full rounded-lg border p-4 text-left transition-all hover:brightness-110 ${config.border} ${config.bg}`}
    >
      <div className="flex items-start gap-3">
        <ReviewSeverityBadge severity={finding.severity} />
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-relaxed text-[#e6edf3]">{finding.description}</p>
          {finding.file ? <p className="mt-1.5 font-mono text-xs text-[#6e7681]">{finding.file}</p> : null}
          {expanded && finding.fix ? (
            <div className="mt-3 border-t border-[#30363d] pt-3">
              <p className="mb-1 text-xs uppercase tracking-wider text-[#8b949e]">Recommended fix</p>
              <p className="text-sm text-[#3fb950]">{finding.fix}</p>
            </div>
          ) : null}
        </div>
        <span className="shrink-0 text-xs text-[#484f58]">{expanded ? "Less" : "More"}</span>
      </div>
    </button>
  );
}

function ReviewPhaseCard({
  phase,
  steps,
  index,
}: {
  phase: string;
  steps: string[];
  index: number;
}) {
  const colors = [
    "border-[#f8514960] bg-[#f8514910]",
    "border-[#d2992260] bg-[#d2992210]",
    "border-[#1f6feb40] bg-[#1f6feb10]",
    "border-[#3fb95040] bg-[#3fb95010]",
  ];

  return (
    <div className={`rounded-xl border p-5 ${colors[index % colors.length]}`}>
      <h3 className="mb-3 text-base font-semibold text-[#e6edf3]">{phase}</h3>
      <ol className="space-y-2">
        {steps.map((step, stepIndex) => (
          <li key={`${phase}-${stepIndex}`} className="flex gap-3 text-sm">
            <span className="w-5 shrink-0 text-right font-mono text-[#484f58]">{stepIndex + 1}.</span>
            <span className="text-[#c9d1d9]">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ProgressListSection({
  title,
  count,
  badgeClassName,
  itemClassName,
  icon,
  textClassName,
  items,
}: {
  title: string;
  count: number;
  badgeClassName: string;
  itemClassName: string;
  icon: ReactNode;
  textClassName: string;
  items: string[];
}) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-[#e6edf3]">
        <span>{title}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs ${badgeClassName}`}>{count}</span>
      </h2>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item} className={`flex gap-3 rounded-lg p-3.5 ${itemClassName}`}>
            {icon}
            <span className={`text-sm leading-relaxed ${textClassName}`}>{item}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatProviderName(provider: string) {
  if (provider === "claude") return "Claude Opus";
  if (provider === "codex") return "GPT-5.4";
  if (provider === "codex-fast") return "GPT-5.4 Fast";
  return provider;
}
