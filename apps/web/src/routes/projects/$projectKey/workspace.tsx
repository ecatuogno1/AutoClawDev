import { createFileRoute, Link } from "@tanstack/react-router";
import { useProject } from "@/lib/api";
import { ProjectTabs } from "@/components/ProjectTabs";
import { WorkspaceView } from "@/components/workspace/WorkspaceView";

export const Route = createFileRoute("/projects/$projectKey/workspace")({
  component: ProjectWorkspacePage,
});

function ProjectWorkspacePage() {
  const { projectKey } = Route.useParams();
  const { data: project, isLoading } = useProject(projectKey);

  return (
    <div className="flex h-full min-h-full flex-col gap-6 p-6">
      <div className="flex items-center gap-2 text-sm text-[#8b949e]">
        <Link to="/" className="hover:text-[#58a6ff]">
          Home
        </Link>
        <span>/</span>
        <Link to="/projects" className="hover:text-[#58a6ff]">
          Projects
        </Link>
        <span>/</span>
        <Link
          to="/projects/$projectKey"
          params={{ projectKey }}
          className="hover:text-[#58a6ff]"
        >
          {project?.name ?? projectKey}
        </Link>
        <span>/</span>
        <span className="text-[#e6edf3]">Workspace</span>
      </div>

      <div>
        <h1 className="text-3xl font-bold text-[#e6edf3]">Workspace</h1>
        <p className="mt-1 text-[#8b949e]">
          IDE-style layout shell for browsing project files and coding tools.
        </p>
      </div>

      <ProjectTabs projectKey={projectKey} activeTab="workspace" />

      {isLoading ? (
        <div className="flex-1 rounded-xl border border-[#30363d] bg-[#161b22] animate-pulse" />
      ) : project ? (
        <WorkspaceView
          projectKey={projectKey}
          projectName={project.name}
          projectPath={project.path}
        />
      ) : (
        <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-12 text-center">
          <p className="text-lg text-[#f85149]">Project not found</p>
          <Link
            to="/projects"
            className="mt-2 inline-block text-sm text-[#58a6ff]"
          >
            Back to projects
          </Link>
        </div>
      )}
    </div>
  );
}
