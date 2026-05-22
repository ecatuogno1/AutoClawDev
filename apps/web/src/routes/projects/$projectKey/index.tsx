import { createFileRoute } from "@tanstack/react-router";
import { useCurrentProject } from "@/components/ProjectRouteLayout";
import {
  PassRateTrendCard,
  ProjectExecutionPanel,
  ProjectHeroCard,
  ProjectSidebar,
  ProjectStatsGrid,
  RunHistoryPanel,
} from "@/components/project-overview/OverviewPanels";
import { ProjectLiveRunPanel } from "@/components/project-overview/ProjectLiveRunPanel";
import {
  buildProjectOverviewSummary,
} from "@/components/project-overview/overviewModel";
import { RecoveryQueue } from "@/components/RecoveryQueue";
import {
  useApproveRunGate,
  useGithub,
  useHealthMatrix,
  useProjectExecutions,
  useProjectHistory,
  useProjectMemory,
  useResumeRun,
  useReviews,
  useStartRun,
  useStopRun,
} from "@/lib/api";

export const Route = createFileRoute("/projects/$projectKey/")({
  component: ProjectDetailRoute,
});

function ProjectDetailRoute() {
  const { projectKey } = Route.useParams();
  return <ProjectHomePane projectKey={projectKey} />;
}

export function ProjectHomePane({ projectKey }: { projectKey: string }) {
  const { project } = useCurrentProject();
  const { data: historyData } = useProjectHistory(projectKey);
  const { data: executionSummary } = useProjectExecutions(projectKey);
  const { data: github } = useGithub(projectKey, Boolean(project.gh_repo));
  const { data: healthData } = useHealthMatrix();
  const { data: reviewsData } = useReviews(projectKey);
  const { data: memory } = useProjectMemory(projectKey);
  const startRun = useStartRun();
  const resumeRun = useResumeRun();
  const approveRunGate = useApproveRunGate();
  const stopRun = useStopRun();

  const summary = buildProjectOverviewSummary({
    healthProjects: healthData?.projects,
    historyRuns: historyData?.runs,
    projectKey,
    reviewCount: reviewsData?.reviews?.length ?? 0,
    openFindings: memory?.openFindings?.length ?? 0,
    project,
  });
  const reviewStatus = executionSummary?.latestByMode.review.status;
  const auditStatus = executionSummary?.latestByMode.audit.status;
  const executionEntries = executionSummary
    ? [
        {
          ...executionSummary.latestByMode.run,
          label: "Run",
        },
        {
          ...executionSummary.latestByMode.review,
          label: "Review",
        },
        {
          ...executionSummary.latestByMode.build,
          label: "Build",
        },
        {
          ...executionSummary.latestByMode.audit,
          label: "Audit",
        },
      ]
    : [];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <ProjectHeroCard
        auditStatus={auditStatus}
        health={summary.health}
        isRunning={Boolean(executionSummary?.activeRun)}
        openFindings={summary.openFindings}
        project={project}
        recoveryCount={summary.recoveryRuns.length}
        reviewCount={summary.reviewCount}
        reviewStatus={reviewStatus}
        trend={summary.trend}
      />

      <ProjectExecutionPanel
        activeRun={executionSummary?.activeRun}
        entries={executionEntries}
        onApproveGate={(runId, gate) => {
          approveRunGate.mutate({ runId, gate, approver: "dashboard" });
        }}
        onResume={(runId) => {
          resumeRun.mutate({ runId });
        }}
        onStart={(mode) => {
          if (mode === "audit") {
            startRun.mutate({
              project: projectKey,
              mode: "audit",
              cycles: 1,
              target: project.audit_url ?? project.dev_url,
              auditMode: "triage",
              ownedTarget: true,
              authorizationNote: "Dashboard-managed owned target command",
            });
            return;
          }

          startRun.mutate({ project: projectKey, mode, cycles: 1 });
        }}
        onStop={() => {
          stopRun.mutate({ project: projectKey });
        }}
        approvePending={approveRunGate.isPending}
        resumePending={resumeRun.isPending}
        startPending={startRun.isPending}
        stopPending={stopRun.isPending}
      />

      <ProjectStatsGrid
        lastRunCreatedAt={summary.lastRunCreatedAt}
        project={project}
      />

      <PassRateTrendCard points={summary.passRateOverTime} />

      <ProjectLiveRunPanel
        projectKey={projectKey}
        activeRecord={executionSummary?.activeRecord ?? undefined}
        latestRecord={executionSummary?.latestOverall ?? undefined}
      />

      <RecoveryQueue
        runs={summary.recoveryRuns}
        title="Recovery Queue"
        emptyLabel="No recovery-required runs for this project"
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <RunHistoryPanel
          projectKey={projectKey}
          runs={historyData?.runs}
        />
        <ProjectSidebar
          github={github}
          project={project}
        />
      </div>
    </div>
  );
}
