import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/projects/$projectKey")({
  component: ProjectLayout,
});

function ProjectLayout() {
  return <Outlet />;
}
