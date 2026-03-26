import { createFileRoute } from "@tanstack/react-router";
import { useProjects } from "@/lib/api";
import { ProjectCard } from "@/components/ProjectCard";

export const Route = createFileRoute("/projects/")({
  component: ProjectsList,
});

function ProjectsList() {
  const { data: projects, isLoading } = useProjects();

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#e6edf3]">Projects</h1>
        <p className="text-sm text-[#8b949e] mt-1">
          All registered codebases in the AutoClawDev pipeline
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-[#161b22] border border-[#30363d] rounded-lg p-5 h-48 animate-pulse"
            />
          ))}
        </div>
      ) : projects && projects.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map((p) => (
            <ProjectCard key={p.key} project={p} />
          ))}
        </div>
      ) : (
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-12 text-center">
          <p className="text-[#8b949e] text-lg mb-2">No projects configured</p>
          <p className="text-[#6e7681] text-sm">
            Add project JSON files to{" "}
            <code className="mono text-[#d29922]">
              ~/.local/lib/autoclawdev/projects/
            </code>
          </p>
        </div>
      )}
    </div>
  );
}
