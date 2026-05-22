import { createContext, useContext } from "react";
import type { ProjectDetail } from "@autoclawdev/types";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { ProjectTabs, type ProjectTabId } from "@/components/ProjectTabs";
import { useProject } from "@/lib/api";

interface CurrentProjectContextValue {
  project: ProjectDetail;
  projectKey: string;
}

const CurrentProjectContext = createContext<CurrentProjectContextValue | null>(null);

export function ProjectRouteLayout({ projectKey }: { projectKey: string }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { data: project, isLoading } = useProject(projectKey);

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="mx-auto h-10 max-w-6xl animate-pulse rounded-xl border border-[#30363d] bg-[#161b22]" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6">
        <div className="mx-auto max-w-6xl rounded-xl border border-[#30363d] bg-[#161b22] p-12 text-center">
          <p className="text-lg text-[#f85149]">Project not found</p>
          <Link
            to="/projects"
            className="mt-2 inline-block text-sm text-[#58a6ff]"
          >
            Back to projects
          </Link>
        </div>
      </div>
    );
  }

  return (
    <CurrentProjectContext.Provider value={{ project, projectKey }}>
      <div className="flex h-full min-h-0 flex-col">
        <div className="px-6 pt-4">
          <div className="mx-auto max-w-6xl">
            <ProjectTabs
              projectKey={projectKey}
              activeTab={deriveActiveTab(pathname)}
            />
          </div>
        </div>
        <div className="min-h-0 flex-1">
          <Outlet />
        </div>
      </div>
    </CurrentProjectContext.Provider>
  );
}

export function useCurrentProject() {
  const value = useContext(CurrentProjectContext);

  if (!value) {
    throw new Error("useCurrentProject must be used within ProjectRouteLayout");
  }

  return value;
}

function deriveActiveTab(pathname: string): ProjectTabId {
  if (pathname.includes("/reviews")) {
    return "reviews";
  }
  if (pathname.includes("/web-audits")) {
    return "web-audits";
  }
  if (pathname.includes("/memory")) {
    return "memory";
  }
  if (pathname.includes("/workspace")) {
    return "workspace";
  }
  return "runs";
}
