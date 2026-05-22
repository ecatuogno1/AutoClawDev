import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ReviewFindingsPanel,
  ReviewPlanPanel,
  ReviewProgressPanel,
  ReviewRunStatusPanel,
  ReviewSessionsPanel,
  ReviewSummaryStats,
  ReviewTabNav,
  type ReviewContentTab,
} from "@/components/project-reviews/ReviewPanels";
import {
  parseAuditReport,
  parseExecutionPlan,
  parseProgress,
  type ReviewSeverity,
} from "@/components/project-reviews/reviewModel";
import { useLatestReview, useResumeRun, useReviews, useStartRun } from "@/lib/api";

export const Route = createFileRoute("/projects/$projectKey/reviews")({
  component: ReviewsPageRoute,
});

function ReviewsPageRoute() {
  const { projectKey } = Route.useParams();
  return <ProjectReviewsPane projectKey={projectKey} />;
}

export function ProjectReviewsPane({ projectKey }: { projectKey: string }) {
  const { data: reviewsData, isLoading } = useReviews(projectKey);
  const { data: latest } = useLatestReview(projectKey);
  const startRun = useStartRun();
  const resumeRun = useResumeRun();
  const [activeTab, setActiveTab] = useState<ReviewContentTab>("findings");
  const [severityFilter, setSeverityFilter] = useState<"all" | ReviewSeverity>("all");

  const reviews = reviewsData?.reviews ?? [];
  const audit = useMemo(
    () => (latest?.auditReport ? parseAuditReport(latest.auditReport) : null),
    [latest?.auditReport],
  );
  const plan = useMemo(
    () => (latest?.executionPlan ? parseExecutionPlan(latest.executionPlan) : []),
    [latest?.executionPlan],
  );
  const progress = useMemo(
    () => (latest?.progress ? parseProgress(latest.progress) : null),
    [latest?.progress],
  );

  const hasContent = Boolean(
    latest && (latest.hasAuditReport || latest.hasExecutionPlan || latest.hasProgress || latest.managedRun),
  );
  const managedRun = latest?.managedRun;
  const canResumeReview = Boolean(
    managedRun &&
      managedRun.runId &&
      managedRun.status !== "running" &&
      managedRun.status !== "queued" &&
      managedRun.status !== "completed",
  );
  const isReviewRunning = managedRun?.status === "running" || managedRun?.status === "queued";
  const reviewActions = (
    <div className="flex flex-wrap gap-3">
      <button
        type="button"
        onClick={() => startRun.mutate({ project: projectKey, mode: "review", cycles: 1 })}
        disabled={startRun.isPending || isReviewRunning}
        className="rounded-lg bg-[#238636] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2ea043] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {startRun.isPending ? "Starting…" : managedRun ? "Start New Review" : "Start Review"}
      </button>
      {canResumeReview ? (
        <button
          type="button"
          onClick={() => managedRun?.runId && resumeRun.mutate({ runId: managedRun.runId })}
          disabled={resumeRun.isPending}
          className="rounded-lg border border-[#58a6ff40] bg-[#58a6ff15] px-4 py-2 text-sm font-medium text-[#58a6ff] transition-colors hover:bg-[#58a6ff20] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {resumeRun.isPending ? "Resuming…" : "Resume Review"}
        </button>
      ) : null}
      <div className="rounded-lg bg-[#0d1117] px-3 py-2">
        <code className="text-xs text-[#d29922]">autoclaw review {projectKey}</code>
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6">
      <div>
        <h1 className="text-3xl font-bold text-[#e6edf3]">Code Review</h1>
        <p className="mt-1 text-[#8b949e]">
          {audit
            ? `${audit.totalFindings} issues found across ${audit.sections.length} categories`
            : "AI-powered deep analysis of your codebase"}
        </p>
      </div>

      {!hasContent && !isLoading ? (
        <div className="space-y-4 rounded-xl border border-[#30363d] bg-[#161b22] p-12 text-center">
          <div className="text-5xl">🔍</div>
          <h2 className="text-xl font-semibold text-[#e6edf3]">No reviews yet</h2>
          <p className="mx-auto max-w-md text-[#8b949e]">
            Run a deep review to have AI agents analyze your entire codebase for bugs, security issues, performance
            problems, and more.
          </p>
          <div className="flex justify-center">{reviewActions}</div>
        </div>
      ) : null}

      {hasContent ? (
        <>
          {latest?.managedRun ? (
            <ReviewRunStatusPanel
              managedRun={latest.managedRun}
              actions={reviewActions}
            />
          ) : (
            <div className="rounded-2xl border border-[#30363d] bg-[#161b22] p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-[#e6edf3]">Review Controls</h2>
                  <p className="mt-1 text-sm text-[#8b949e]">
                    Start a fresh managed review from the dashboard. Legacy review artifacts remain visible below.
                  </p>
                </div>
                {reviewActions}
              </div>
            </div>
          )}
          {audit ? <ReviewSummaryStats audit={audit} /> : null}

          <ReviewTabNav
            activeTab={activeTab}
            hasAuditReport={latest?.hasAuditReport}
            hasExecutionPlan={latest?.hasExecutionPlan}
            hasProgress={latest?.hasProgress}
            onSelectTab={setActiveTab}
          />

          {activeTab === "findings" && audit ? (
            <ReviewFindingsPanel
              audit={audit}
              severityFilter={severityFilter}
              onSeverityFilterChange={setSeverityFilter}
            />
          ) : null}

          {activeTab === "plan" && plan.length > 0 ? <ReviewPlanPanel plan={plan} /> : null}
          {activeTab === "progress" && progress ? <ReviewProgressPanel progress={progress} /> : null}
          {activeTab === "sessions" ? <ReviewSessionsPanel isLoading={isLoading} reviews={reviews} /> : null}
        </>
      ) : null}
    </div>
  );
}
