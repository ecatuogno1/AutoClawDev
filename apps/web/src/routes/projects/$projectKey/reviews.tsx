import { createFileRoute, Link } from "@tanstack/react-router";
import { useReviews, useLatestReview } from "@/lib/api";
import { useState, useMemo } from "react";

export const Route = createFileRoute("/projects/$projectKey/reviews")({
  component: ReviewsPage,
});

// ── Markdown parser for audit reports ────────────────────────────────

interface Finding {
  severity: "critical" | "high" | "medium" | "low";
  file: string;
  description: string;
  fix: string;
  section: string;
}

function parseSeverity(text: string): Finding["severity"] {
  const lower = text.toLowerCase().trim();
  if (lower.startsWith("critical")) return "critical";
  if (lower.startsWith("high")) return "high";
  if (lower.startsWith("medium")) return "medium";
  return "low";
}

function parseAuditReport(markdown: string): {
  title: string;
  subtitle: string;
  sections: Array<{
    name: string;
    findings: Finding[];
  }>;
  totalFindings: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
} {
  const lines = markdown.split("\n");
  let title = "";
  let subtitle = "";
  const sections: Array<{ name: string; findings: Finding[] }> = [];
  let currentSection = "";
  let currentFindings: Finding[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("# ") && !title) {
      title = trimmed.slice(2);
      continue;
    }

    if (trimmed.startsWith("## ")) {
      if (currentSection && currentFindings.length > 0) {
        sections.push({ name: currentSection, findings: [...currentFindings] });
      }
      currentSection = trimmed.slice(3);
      currentFindings = [];
      continue;
    }

    if (!trimmed.startsWith("# ") && !title) {
      subtitle = trimmed;
      continue;
    }

    if (trimmed.startsWith("- ") && currentSection) {
      const content = trimmed.slice(2);
      // Parse "severity | `file` | description | fix" format
      const parts = content.split("|").map((p) => p.trim());
      if (parts.length >= 3) {
        currentFindings.push({
          severity: parseSeverity(parts[0]),
          file: parts[1]?.replace(/`/g, "") || "",
          description: parts[2] || "",
          fix: parts[3] || "",
          section: currentSection,
        });
      } else {
        // Freeform finding
        currentFindings.push({
          severity: currentSection.toLowerCase().includes("critical")
            ? "critical"
            : currentSection.toLowerCase().includes("bug")
              ? "high"
              : "medium",
          file: "",
          description: content,
          fix: "",
          section: currentSection,
        });
      }
    }
  }

  if (currentSection && currentFindings.length > 0) {
    sections.push({ name: currentSection, findings: [...currentFindings] });
  }

  const allFindings = sections.flatMap((s) => s.findings);
  return {
    title: title || "Audit Report",
    subtitle,
    sections,
    totalFindings: allFindings.length,
    criticalCount: allFindings.filter((f) => f.severity === "critical").length,
    highCount: allFindings.filter((f) => f.severity === "high").length,
    mediumCount: allFindings.filter((f) => f.severity === "medium").length,
    lowCount: allFindings.filter((f) => f.severity === "low").length,
  };
}

function parseExecutionPlan(
  markdown: string,
): Array<{ phase: string; steps: string[] }> {
  const lines = markdown.split("\n");
  const phases: Array<{ phase: string; steps: string[] }> = [];
  let currentPhase = "";
  let currentSteps: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("## ")) {
      if (currentPhase && currentSteps.length > 0) {
        phases.push({ phase: currentPhase, steps: [...currentSteps] });
      }
      currentPhase = trimmed.slice(3);
      currentSteps = [];
    } else if (/^\d+\./.test(trimmed) && currentPhase) {
      currentSteps.push(trimmed.replace(/^\d+\.\s*/, ""));
    }
  }
  if (currentPhase && currentSteps.length > 0) {
    phases.push({ phase: currentPhase, steps: [...currentSteps] });
  }
  return phases;
}

function parseProgress(
  markdown: string,
): { done: string[]; nextSteps: string[]; deferred: string[] } {
  const lines = markdown.split("\n");
  const done: string[] = [];
  const nextSteps: string[] = [];
  const deferred: string[] = [];
  let section = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("## Done")) {
      section = "done";
    } else if (
      trimmed.startsWith("## Highest-value") ||
      trimmed.startsWith("## Next")
    ) {
      section = "next";
    } else if (trimmed.startsWith("## Deferred")) {
      section = "deferred";
    } else if (trimmed.startsWith("- ") && section) {
      const text = trimmed.slice(2);
      if (section === "done") done.push(text);
      else if (section === "next") nextSteps.push(text);
      else if (section === "deferred") deferred.push(text);
    }
  }
  return { done, nextSteps, deferred };
}

// ── Severity styling ─────────────────────────────────────────────────

const severityConfig = {
  critical: {
    bg: "bg-[#f8514920]",
    border: "border-[#f8514940]",
    text: "text-[#ff7b72]",
    label: "Critical",
    icon: "!!",
  },
  high: {
    bg: "bg-[#d2992220]",
    border: "border-[#d2992240]",
    text: "text-[#d29922]",
    label: "High",
    icon: "!",
  },
  medium: {
    bg: "bg-[#1f6feb15]",
    border: "border-[#1f6feb30]",
    text: "text-[#58a6ff]",
    label: "Medium",
    icon: "-",
  },
  low: {
    bg: "bg-[#8b949e15]",
    border: "border-[#8b949e30]",
    text: "text-[#8b949e]",
    label: "Low",
    icon: ".",
  },
};

// ── Components ───────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: Finding["severity"] }) {
  const c = severityConfig[severity];
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}
    >
      {c.label}
    </span>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5 text-center">
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
      <div className="text-sm text-[#8b949e] mt-1">{label}</div>
    </div>
  );
}

function FindingCard({ finding }: { finding: Finding }) {
  const [expanded, setExpanded] = useState(false);
  const c = severityConfig[finding.severity];

  return (
    <button
      onClick={() => setExpanded(!expanded)}
      className={`w-full text-left p-4 rounded-lg border ${c.border} ${c.bg} transition-all hover:brightness-110`}
    >
      <div className="flex items-start gap-3">
        <SeverityBadge severity={finding.severity} />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-[#e6edf3] leading-relaxed">
            {finding.description}
          </p>
          {finding.file && (
            <p className="text-xs text-[#6e7681] mt-1.5 font-mono">
              {finding.file}
            </p>
          )}
          {expanded && finding.fix && (
            <div className="mt-3 pt-3 border-t border-[#30363d]">
              <p className="text-xs text-[#8b949e] uppercase tracking-wider mb-1">
                Recommended fix
              </p>
              <p className="text-sm text-[#3fb950]">{finding.fix}</p>
            </div>
          )}
        </div>
        <span className="text-[#484f58] text-xs shrink-0">
          {expanded ? "Less" : "More"}
        </span>
      </div>
    </button>
  );
}

function PhaseCard({
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
  const color = colors[index % colors.length];

  return (
    <div className={`rounded-xl border p-5 ${color}`}>
      <h3 className="text-base font-semibold text-[#e6edf3] mb-3">{phase}</h3>
      <ol className="space-y-2">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-3 text-sm">
            <span className="text-[#484f58] font-mono shrink-0 w-5 text-right">
              {i + 1}.
            </span>
            <span className="text-[#c9d1d9]">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────

function ReviewsPage() {
  const { projectKey } = Route.useParams();
  const { data: reviewsData, isLoading } = useReviews(projectKey);
  const { data: latest } = useLatestReview(projectKey);
  const [activeTab, setActiveTab] = useState<"findings" | "plan" | "progress" | "sessions">("findings");
  const [severityFilter, setSeverityFilter] = useState<"all" | Finding["severity"]>("all");

  const reviews = reviewsData?.reviews ?? [];

  const audit = useMemo(
    () => (latest?.auditReport ? parseAuditReport(latest.auditReport) : null),
    [latest?.auditReport],
  );

  const plan = useMemo(
    () =>
      latest?.executionPlan ? parseExecutionPlan(latest.executionPlan) : [],
    [latest?.executionPlan],
  );

  const progress = useMemo(
    () => (latest?.progress ? parseProgress(latest.progress) : null),
    [latest?.progress],
  );

  const filteredSections = useMemo(() => {
    if (!audit) return [];
    if (severityFilter === "all") return audit.sections;
    return audit.sections
      .map((s) => ({
        ...s,
        findings: s.findings.filter((f) => f.severity === severityFilter),
      }))
      .filter((s) => s.findings.length > 0);
  }, [audit, severityFilter]);

  const hasContent =
    latest &&
    (latest.hasAuditReport || latest.hasExecutionPlan || latest.hasProgress);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-[#8b949e]">
        <Link to="/" className="hover:text-[#58a6ff]">
          Home
        </Link>
        <span>/</span>
        <Link
          to="/projects/$projectKey"
          params={{ projectKey }}
          className="hover:text-[#58a6ff]"
        >
          {projectKey}
        </Link>
        <span>/</span>
        <span className="text-[#e6edf3]">Code Review</span>
      </div>

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-[#e6edf3]">Code Review</h1>
        <p className="text-[#8b949e] mt-1">
          {audit
            ? `${audit.totalFindings} issues found across ${audit.sections.length} categories`
            : "AI-powered deep analysis of your codebase"}
        </p>
      </div>

      {!hasContent && !isLoading && (
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-12 text-center space-y-4">
          <div className="text-5xl">🔍</div>
          <h2 className="text-xl font-semibold text-[#e6edf3]">
            No reviews yet
          </h2>
          <p className="text-[#8b949e] max-w-md mx-auto">
            Run a deep review to have AI agents analyze your entire codebase for
            bugs, security issues, performance problems, and more.
          </p>
          <div className="bg-[#0d1117] rounded-lg p-3 inline-block">
            <code className="text-sm text-[#d29922]">
              autoclaw review {projectKey}
            </code>
          </div>
        </div>
      )}

      {hasContent && (
        <>
          {/* Summary stats */}
          {audit && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <StatCard
                label="Total Issues"
                value={audit.totalFindings}
                color="text-[#e6edf3]"
              />
              <StatCard
                label="Critical"
                value={audit.criticalCount}
                color="text-[#ff7b72]"
              />
              <StatCard
                label="High"
                value={audit.highCount}
                color="text-[#d29922]"
              />
              <StatCard
                label="Medium"
                value={audit.mediumCount}
                color="text-[#58a6ff]"
              />
              <StatCard
                label="Low"
                value={audit.lowCount}
                color="text-[#8b949e]"
              />
            </div>
          )}

          {/* Tab navigation */}
          <div className="flex gap-1 border-b border-[#30363d]">
            {[
              {
                key: "findings" as const,
                label: "Issues Found",
                show: latest?.hasAuditReport,
              },
              {
                key: "plan" as const,
                label: "Fix Plan",
                show: latest?.hasExecutionPlan,
              },
              {
                key: "progress" as const,
                label: "What Was Fixed",
                show: latest?.hasProgress,
              },
              { key: "sessions" as const, label: "Past Reviews", show: true },
            ]
              .filter((t) => t.show)
              .map((tab) => (
                <button
                  key={tab.key}
                  className={`px-5 py-3 text-sm font-medium transition-colors ${
                    activeTab === tab.key
                      ? "text-[#e6edf3] border-b-2 border-[#58a6ff]"
                      : "text-[#8b949e] hover:text-[#e6edf3]"
                  }`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
          </div>

          {/* Tab content */}
          {activeTab === "findings" && audit && (
            <div className="space-y-6">
              {/* Severity filter */}
              <div className="flex gap-2 flex-wrap">
                {(
                  [
                    { key: "all" as const, label: "All", count: audit.totalFindings },
                    { key: "critical" as const, label: "Critical", count: audit.criticalCount },
                    { key: "high" as const, label: "High", count: audit.highCount },
                    { key: "medium" as const, label: "Medium", count: audit.mediumCount },
                    { key: "low" as const, label: "Low", count: audit.lowCount },
                  ] as const
                )
                  .filter((f) => f.count > 0 || f.key === "all")
                  .map((filter) => (
                    <button
                      key={filter.key}
                      onClick={() => setSeverityFilter(filter.key)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                        severityFilter === filter.key
                          ? "bg-[#58a6ff] text-white"
                          : "bg-[#21262d] text-[#8b949e] hover:text-[#e6edf3]"
                      }`}
                    >
                      {filter.label} ({filter.count})
                    </button>
                  ))}
              </div>

              {/* Findings by section */}
              {filteredSections.map((section, si) => (
                <div key={si}>
                  <h2 className="text-lg font-semibold text-[#e6edf3] mb-3 capitalize">
                    {section.name}
                  </h2>
                  <div className="space-y-2">
                    {section.findings.map((f, fi) => (
                      <FindingCard key={fi} finding={f} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === "plan" && plan.length > 0 && (
            <div className="space-y-4">
              <p className="text-[#8b949e]">
                The AI created this step-by-step plan to fix the issues it
                found. Work through each phase in order.
              </p>
              {plan.map((p, i) => (
                <PhaseCard key={i} phase={p.phase} steps={p.steps} index={i} />
              ))}
            </div>
          )}

          {activeTab === "progress" && progress && (
            <div className="space-y-6">
              {/* Done */}
              {progress.done.length > 0 && (
                <div>
                  <h2 className="text-lg font-semibold text-[#3fb950] mb-3 flex items-center gap-2">
                    <span>Completed</span>
                    <span className="text-xs bg-[#3fb95020] text-[#3fb950] px-2 py-0.5 rounded-full">
                      {progress.done.length}
                    </span>
                  </h2>
                  <div className="space-y-2">
                    {progress.done.map((item, i) => (
                      <div
                        key={i}
                        className="flex gap-3 p-3 rounded-lg bg-[#3fb95008] border border-[#3fb95020]"
                      >
                        <span className="text-[#3fb950] mt-0.5 shrink-0">
                          ✓
                        </span>
                        <span className="text-sm text-[#c9d1d9]">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Next steps */}
              {progress.nextSteps.length > 0 && (
                <div>
                  <h2 className="text-lg font-semibold text-[#d29922] mb-3 flex items-center gap-2">
                    <span>Up Next</span>
                    <span className="text-xs bg-[#d2992220] text-[#d29922] px-2 py-0.5 rounded-full">
                      {progress.nextSteps.length}
                    </span>
                  </h2>
                  <div className="space-y-2">
                    {progress.nextSteps.map((item, i) => (
                      <div
                        key={i}
                        className="flex gap-3 p-3 rounded-lg bg-[#d2992208] border border-[#d2992220]"
                      >
                        <span className="text-[#d29922] mt-0.5 shrink-0">
                          →
                        </span>
                        <span className="text-sm text-[#c9d1d9]">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Deferred */}
              {progress.deferred.length > 0 && (
                <div>
                  <h2 className="text-lg font-semibold text-[#8b949e] mb-3 flex items-center gap-2">
                    <span>Deferred</span>
                    <span className="text-xs bg-[#8b949e20] text-[#8b949e] px-2 py-0.5 rounded-full">
                      {progress.deferred.length}
                    </span>
                  </h2>
                  <div className="space-y-2">
                    {progress.deferred.map((item, i) => (
                      <div
                        key={i}
                        className="flex gap-3 p-3 rounded-lg bg-[#8b949e08] border border-[#8b949e20]"
                      >
                        <span className="text-[#484f58] mt-0.5 shrink-0">
                          ○
                        </span>
                        <span className="text-sm text-[#8b949e]">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "sessions" && (
            <div>
              {isLoading ? (
                <div className="bg-[#161b22] border border-[#30363d] rounded-xl animate-pulse h-48" />
              ) : reviews.length > 0 ? (
                <div className="space-y-3">
                  {reviews.map((r, i) => (
                    <div
                      key={i}
                      className="bg-[#161b22] border border-[#30363d] rounded-xl p-5 flex items-center gap-4"
                    >
                      <div
                        className={`w-3 h-3 rounded-full shrink-0 ${r.exitCode === 0 ? "bg-[#3fb950]" : r.endedAt ? "bg-[#f85149]" : "bg-[#d29922] animate-pulse"}`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-[#e6edf3] font-medium">
                          {r.provider === "claude"
                            ? "Claude Opus"
                            : r.provider === "codex"
                              ? "GPT-5.4"
                              : r.provider === "codex-fast"
                                ? "GPT-5.4 Fast"
                                : r.provider}{" "}
                          Review
                        </div>
                        <div className="text-xs text-[#8b949e] mt-0.5">
                          {r.startedAt &&
                            new Date(r.startedAt).toLocaleDateString("en-US", {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {r.hasAuditReport && (
                          <span className="text-xs bg-[#1f6feb20] text-[#58a6ff] px-2.5 py-1 rounded-full">
                            Report
                          </span>
                        )}
                        {r.hasExecutionPlan && (
                          <span className="text-xs bg-[#3fb95020] text-[#3fb950] px-2.5 py-1 rounded-full">
                            Plan
                          </span>
                        )}
                        {r.hasProgress && (
                          <span className="text-xs bg-[#d2992220] text-[#d29922] px-2.5 py-1 rounded-full">
                            Progress
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-8 text-center">
                  <p className="text-[#8b949e]">No past review sessions</p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
