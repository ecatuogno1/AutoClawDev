import { Link } from "@tanstack/react-router";
import { useProjectMemory, useReviews } from "@/lib/api";

type ProjectTabId = "runs" | "reviews" | "memory" | "workspace";

interface ProjectTabsProps {
  projectKey: string;
  activeTab: ProjectTabId;
}

const baseTabClass =
  "px-5 py-3 text-sm font-medium transition-colors";

export function ProjectTabs({ projectKey, activeTab }: ProjectTabsProps) {
  const { data: reviewsData } = useReviews(projectKey);
  const { data: memory } = useProjectMemory(projectKey);

  const reviewCount = reviewsData?.reviews?.length ?? 0;
  const openFindings = memory?.openFindings?.length ?? 0;

  return (
    <div className="flex gap-1 border-b border-[#30363d]">
      <ProjectTabLink
        active={activeTab === "runs"}
        to="/projects/$projectKey"
        params={{ projectKey }}
      >
        Runs
      </ProjectTabLink>
      <ProjectTabLink
        active={activeTab === "reviews"}
        to="/projects/$projectKey/reviews"
        params={{ projectKey }}
      >
        Code Review
        {reviewCount > 0 && (
          <span className="ml-1.5 rounded-full bg-[#21262d] px-1.5 py-0.5 text-xs">
            {reviewCount}
          </span>
        )}
      </ProjectTabLink>
      <ProjectTabLink
        active={activeTab === "memory"}
        to="/projects/$projectKey/memory"
        params={{ projectKey }}
      >
        Knowledge Base
        {openFindings > 0 && (
          <span className="ml-1.5 rounded-full bg-[#d2992220] px-1.5 py-0.5 text-xs text-[#d29922]">
            {openFindings}
          </span>
        )}
      </ProjectTabLink>
      <ProjectTabLink
        active={activeTab === "workspace"}
        to="/projects/$projectKey/workspace"
        params={{ projectKey }}
      >
        Workspace
      </ProjectTabLink>
    </div>
  );
}

function ProjectTabLink({
  active,
  children,
  params,
  to,
}: {
  active: boolean;
  children: React.ReactNode;
  params: { projectKey: string };
  to:
    | "/projects/$projectKey"
    | "/projects/$projectKey/reviews"
    | "/projects/$projectKey/memory"
    | "/projects/$projectKey/workspace";
}) {
  if (active) {
    return (
      <span className={`${baseTabClass} border-b-2 border-[#58a6ff] text-[#e6edf3]`}>
        {children}
      </span>
    );
  }

  return (
    <Link
      to={to}
      params={params}
      className={`${baseTabClass} text-[#8b949e] hover:text-[#e6edf3]`}
    >
      {children}
    </Link>
  );
}
