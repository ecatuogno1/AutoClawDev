import { Link } from "@tanstack/react-router";
import { useProject, useProjectExperiments, useProjectMemory, useReviews } from "@/lib/api";

interface ProjectSearchPanelProps {
  projectKey: string | null;
}

export function ProjectSearchPanel({ projectKey }: ProjectSearchPanelProps) {
  const enabled = Boolean(projectKey);
  const { data: project } = useProject(projectKey ?? "", enabled);
  const { data: reviews } = useReviews(projectKey ?? "", enabled);
  const { data: memory } = useProjectMemory(projectKey ?? "", enabled);
  const { data: experiments } = useProjectExperiments(projectKey ?? "", enabled);

  if (!projectKey) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-[#8b949e]">
        Select a project tab to search within that workspace.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col p-4">
      <div className="rounded-xl border border-[#30363d] bg-[#0d1117] p-3">
        <div className="text-xs font-medium uppercase tracking-[0.18em] text-[#6e7681]">
          Active Scope
        </div>
        <div className="mt-2 text-sm font-medium text-[#e6edf3]">
          {project?.name ?? projectKey}
        </div>
        <p className="mt-1 text-sm text-[#8b949e]">
          Jump into the current project's review output, knowledge base, and recent runs.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-center text-xs">
        <div className="rounded-lg border border-[#30363d] bg-[#0d1117] px-2 py-3 text-[#8b949e]">
          <div className="text-sm font-semibold text-[#e6edf3]">{reviews?.reviews.length ?? 0}</div>
          <div>Reviews</div>
        </div>
        <div className="rounded-lg border border-[#30363d] bg-[#0d1117] px-2 py-3 text-[#8b949e]">
          <div className="text-sm font-semibold text-[#e6edf3]">{memory?.totalFindings ?? 0}</div>
          <div>Findings</div>
        </div>
        <div className="rounded-lg border border-[#30363d] bg-[#0d1117] px-2 py-3 text-[#8b949e]">
          <div className="text-sm font-semibold text-[#e6edf3]">{memory?.hotspots.length ?? 0}</div>
          <div>Hotspots</div>
        </div>
        <div className="rounded-lg border border-[#30363d] bg-[#0d1117] px-2 py-3 text-[#8b949e]">
          <div className="text-sm font-semibold text-[#e6edf3]">{experiments?.length ?? 0}</div>
          <div>Runs</div>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <Link
          to="/projects/$projectKey/reviews"
          params={{ projectKey }}
          className="block rounded-xl border border-[#30363d] bg-[#0d1117] p-3 text-sm text-[#e6edf3] transition-colors hover:border-[#484f58] hover:bg-[#131a22]"
        >
          Search review findings
        </Link>
        <Link
          to="/projects/$projectKey/memory"
          params={{ projectKey }}
          className="block rounded-xl border border-[#30363d] bg-[#0d1117] p-3 text-sm text-[#e6edf3] transition-colors hover:border-[#484f58] hover:bg-[#131a22]"
        >
          Search the knowledge base
        </Link>
        <Link
          to="/projects/$projectKey"
          params={{ projectKey }}
          className="block rounded-xl border border-[#30363d] bg-[#0d1117] p-3 text-sm text-[#e6edf3] transition-colors hover:border-[#484f58] hover:bg-[#131a22]"
        >
          Open project overview and runs
        </Link>
      </div>
    </div>
  );
}
