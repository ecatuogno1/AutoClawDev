import { useCallback, useEffect, useRef } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useProjects } from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  deriveLayoutNavState,
  readStoredProjectSection,
  type ProjectSectionId,
} from "@/components/layoutNavigation";

const tabClassName =
  "inline-flex h-8 shrink-0 items-center rounded-lg border px-3 text-sm transition-[border-color,background-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#58a6ff]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#010409]";

export function ProjectTabBar() {
  const navigate = useNavigate();
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;
  const navState = deriveLayoutNavState(pathname);
  const { data: projects, isLoading } = useProjects();
  const projectList = projects ?? [];
  const projectCount = projectList.length;
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const goToProject = useCallback((projectKey: string, section: ProjectSectionId) => {
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
  }, [navigate]);

  useEffect(() => {
    const activeTab = scrollContainerRef.current?.querySelector<HTMLElement>(
      '[data-project-active="true"]',
    );
    activeTab?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [navState.activeProjectKey, projectCount]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) {
        return;
      }

      if (
        event.target instanceof HTMLElement &&
        (event.target.isContentEditable ||
          event.target.tagName === "INPUT" ||
          event.target.tagName === "TEXTAREA" ||
          event.target.tagName === "SELECT")
      ) {
        return;
      }

      const shortcutIndex = Number.parseInt(event.key, 10) - 1;
      if (
        Number.isNaN(shortcutIndex) ||
        shortcutIndex < 0 ||
        shortcutIndex >= Math.min(projectList.length, 5)
      ) {
        return;
      }

      const project = projectList[shortcutIndex];
      if (!project) {
        return;
      }

      event.preventDefault();
      const targetSection =
        project.key === navState.activeProjectKey && navState.activeProjectSection
          ? navState.activeProjectSection
          : readStoredProjectSection(project.key);
      void goToProject(project.key, targetSection);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    goToProject,
    navState.activeProjectKey,
    navState.activeProjectSection,
    projectList,
  ]);

  return (
    <div className="flex min-h-10 items-center border-b border-[#30363d]/80 bg-[linear-gradient(180deg,rgba(1,4,9,0.98)_0%,rgba(13,17,23,0.96)_100%)] px-3 shadow-[inset_0_-1px_0_rgba(48,54,61,0.35)]">
      <div
        ref={scrollContainerRef}
        className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {isLoading && projectCount === 0 ? (
          Array.from({ length: 4 }).map((_, index) => (
            <span
              key={index}
              className="h-8 w-28 shrink-0 animate-pulse rounded-lg border border-[#30363d] bg-[#161b22]"
            />
          ))
        ) : projectCount > 0 ? (
          projectList.map((project, index) => {
            const isActive = navState.activeProjectKey === project.key;
            const targetSection =
              isActive && navState.activeProjectSection
                ? navState.activeProjectSection
                : readStoredProjectSection(project.key);
            const shortcutLabel = index < 5 ? `Ctrl+${index + 1}` : undefined;

            return (
              <button
                key={project.key}
                type="button"
                aria-current={isActive ? "page" : undefined}
                aria-keyshortcuts={shortcutLabel}
                data-project-active={isActive ? "true" : "false"}
                title={project.name}
                className={cn(
                  tabClassName,
                  isActive
                    ? "border-[#30363d] bg-[#161b22] font-semibold text-[#f0f6fc] shadow-[inset_0_1px_0_rgba(240,246,252,0.08),0_0_0_1px_rgba(48,54,61,0.3)]"
                    : "border-transparent text-[#8b949e] hover:border-[#30363d]/80 hover:bg-[#11161d] hover:text-[#e6edf3]",
                )}
                onClick={() => {
                  void goToProject(project.key, targetSection);
                }}
              >
                <span className="max-w-[min(15rem,30vw)] truncate">{project.name}</span>
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
