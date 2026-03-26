import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useProjects } from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  deriveLayoutNavState,
  readStoredProjectSection,
  type ProjectSectionId,
} from "@/components/layoutNavigation";

const tabClassName =
  "inline-flex h-8 shrink-0 items-center rounded-lg border px-3 text-sm transition-[border-color,background-color,color] duration-150";

export function ProjectTabBar() {
  const navigate = useNavigate();
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;
  const navState = deriveLayoutNavState(pathname);
  const { data: projects, isLoading } = useProjects();
  const projectList = projects ?? [];
  const projectCount = projectList.length;

  const goToProject = (projectKey: string, section: ProjectSectionId) => {
    switch (section) {
      case "reviews":
        return navigate({ to: "/projects/$projectKey/reviews", params: { projectKey } });
      case "memory":
        return navigate({ to: "/projects/$projectKey/memory", params: { projectKey } });
      case "workspace":
        return navigate({ to: "/projects/$projectKey/workspace", params: { projectKey } });
      case "home":
      default:
        return navigate({ to: "/projects/$projectKey", params: { projectKey } });
    }
  };

  return (
    <div className="flex min-h-9 items-center border-b border-[#30363d]/80 bg-[#010409]/95 px-3">
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {isLoading && projectCount === 0 ? (
          Array.from({ length: 4 }).map((_, index) => (
            <span
              key={index}
              className="h-8 w-28 shrink-0 animate-pulse rounded-lg border border-[#30363d] bg-[#161b22]"
            />
          ))
        ) : projectCount > 0 ? (
          projectList.map((project) => {
            const isActive = navState.activeProjectKey === project.key;
            const targetSection =
              navState.isProjectRoute && navState.activeProjectSection
                ? navState.activeProjectSection
                : readStoredProjectSection(project.key);

            return (
              <button
                key={project.key}
                type="button"
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  tabClassName,
                  isActive
                    ? "border-[#30363d] bg-[#161b22] font-semibold text-[#e6edf3] shadow-[inset_0_1px_0_rgba(240,246,252,0.06)]"
                    : "border-transparent text-[#8b949e] hover:border-[#30363d]/70 hover:bg-[#161b22] hover:text-[#e6edf3]",
                )}
                onClick={() => {
                  void goToProject(project.key, targetSection);
                }}
              >
                <span className="max-w-[14rem] truncate">{project.name}</span>
              </button>
            );
          })
        ) : (
          <div className="px-2 text-sm text-[#8b949e]">
            No projects - run <code className="text-[#d29922]">autoclaw add</code>
          </div>
        )}
      </div>
    </div>
  );
}
