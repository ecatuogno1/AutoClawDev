import { createFileRoute } from "@tanstack/react-router";
import { useCurrentProject } from "@/components/ProjectRouteLayout";
import { WorkspaceView } from "@/components/workspace/WorkspaceView";

export const Route = createFileRoute("/projects/$projectKey/workspace")({
  component: ProjectWorkspacePage,
});

function ProjectWorkspacePage() {
  const { projectKey } = Route.useParams();
  const { project } = useCurrentProject();

  return (
    <div className="flex h-full min-h-full flex-col px-6 pb-6">
      <WorkspaceView
        projectKey={projectKey}
        projectPath={project.path}
      />
    </div>
  );
}
