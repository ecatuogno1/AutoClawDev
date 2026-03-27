import { Link } from "@tanstack/react-router";
import { GitBranchIcon, LoaderCircle } from "lucide-react";
import { useWorkspaceGitStatus } from "@/lib/api";

interface ProjectGitPanelProps {
  projectKey: string | null;
}

export function ProjectGitPanel({ projectKey }: ProjectGitPanelProps) {
  const {
    data: gitStatus,
    isLoading,
    error,
  } = useWorkspaceGitStatus(projectKey ?? "", Boolean(projectKey));

  if (!projectKey) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-[#8b949e]">
        Git tools are available when a project workspace is active.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 p-4 text-sm text-[#8b949e]">
        <LoaderCircle className="size-4 animate-spin" />
        <span>Loading git status...</span>
      </div>
    );
  }

  if (!gitStatus) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-[#f85149]">
        {error instanceof Error ? error.message : "Unable to load git status."}
      </div>
    );
  }

  const changedFiles = gitStatus.files.slice(0, 12);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-[#30363d]/70 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium text-[#e6edf3]">
          <GitBranchIcon className="size-4 text-[#58a6ff]" />
          <span className="truncate">{gitStatus.branch}</span>
        </div>
        <p className="mt-1 text-xs text-[#8b949e]">
          {gitStatus.clean
            ? "Working tree clean."
            : `${gitStatus.counts.total} changed file${gitStatus.counts.total === 1 ? "" : "s"}, ${gitStatus.counts.staged} staged.`}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 border-b border-[#30363d]/70 px-4 py-3 text-center text-xs">
        <div className="rounded-lg border border-[#30363d] bg-[#0d1117] px-2 py-2 text-[#8b949e]">
          <div className="text-sm font-semibold text-[#e6edf3]">{gitStatus.counts.staged}</div>
          <div>Staged</div>
        </div>
        <div className="rounded-lg border border-[#30363d] bg-[#0d1117] px-2 py-2 text-[#8b949e]">
          <div className="text-sm font-semibold text-[#e6edf3]">{gitStatus.counts.unstaged}</div>
          <div>Changed</div>
        </div>
        <div className="rounded-lg border border-[#30363d] bg-[#0d1117] px-2 py-2 text-[#8b949e]">
          <div className="text-sm font-semibold text-[#e6edf3]">{gitStatus.counts.untracked}</div>
          <div>Untracked</div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-[#6e7681]">
          Changed Files
        </div>
        {changedFiles.length > 0 ? (
          <div className="space-y-2">
            {changedFiles.map((file) => (
              <div
                key={file.path}
                className="rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-2"
              >
                <div className="truncate text-sm text-[#e6edf3]">{file.path}</div>
                <div className="mt-1 text-xs text-[#8b949e]">{file.label}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-[#30363d] bg-[#0d1117] px-3 py-4 text-sm text-[#8b949e]">
            No local changes.
          </div>
        )}
      </div>

      <div className="border-t border-[#30363d]/70 px-4 py-3">
        <Link
          to="/projects/$projectKey/workspace"
          params={{ projectKey }}
          className="block rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-2 text-center text-sm text-[#8b949e] transition-colors hover:border-[#484f58] hover:text-[#e6edf3]"
        >
          Open workspace git tools
        </Link>
      </div>
    </div>
  );
}
