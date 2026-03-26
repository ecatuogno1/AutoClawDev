import { Outlet, createFileRoute } from "@tanstack/react-router";
import { WorkspaceLayout } from "@/components/workspace/WorkspaceLayout";

export const Route = createFileRoute("/workspace")({
  component: WorkspaceRouteLayout,
});

function WorkspaceRouteLayout() {
  return (
    <div className="h-full overflow-hidden">
      <WorkspaceLayout>
        <Outlet />
      </WorkspaceLayout>
    </div>
  );
}
