import { createFileRoute } from "@tanstack/react-router";
import { ProjectRouteLayout } from "@/components/ProjectRouteLayout";

export const Route = createFileRoute("/projects/$projectKey")({
  component: ProjectLayout,
});

function ProjectLayout() {
  const { projectKey } = Route.useParams();
  return <ProjectRouteLayout projectKey={projectKey} />;
}
