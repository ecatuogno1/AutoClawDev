import { ChevronDown, ChevronsLeftRightEllipsis, FolderGit2, FolderTree, Search } from "lucide-react";
import type { ProjectWithStats } from "@/types";

interface WorkspaceSidebarProps {
  projects: ProjectWithStats[];
  selectedProjectKey: string;
  onProjectChange: (projectKey: string) => void;
  onCollapse: () => void;
  isLoading: boolean;
}

export function WorkspaceSidebar({
  projects,
  selectedProjectKey,
  onProjectChange,
  onCollapse,
  isLoading,
}: WorkspaceSidebarProps) {
  const selectedProject =
    projects.find((project) => project.key === selectedProjectKey) ?? projects[0] ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-[#263247] px-4 py-3">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#64748b]">
              Workspace
            </p>
            <h2 className="mt-1 text-sm font-semibold text-[#f8fafc]">Project Explorer</h2>
          </div>
          <button
            type="button"
            onClick={onCollapse}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#243041] bg-[#0f172a] text-[#94a3b8] transition hover:border-[#3b82f6] hover:text-white"
            aria-label="Collapse workspace sidebar"
          >
            <ChevronsLeftRightEllipsis className="h-4 w-4" />
          </button>
        </div>

        <label className="block">
          <span className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-[#64748b]">
            <FolderGit2 className="h-3.5 w-3.5" />
            Project
          </span>
          <div className="relative">
            <select
              value={selectedProject?.key ?? ""}
              onChange={(event) => onProjectChange(event.target.value)}
              className="h-11 w-full appearance-none rounded-xl border border-[#243041] bg-[#111827] px-3 pr-10 text-sm text-[#e2e8f0] outline-none transition focus:border-[#3b82f6]"
              disabled={isLoading || projects.length === 0}
            >
              {projects.length === 0 ? (
                <option value="">No projects registered</option>
              ) : (
                projects.map((project) => (
                  <option key={project.key} value={project.key}>
                    {project.name}
                  </option>
                ))
              )}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748b]" />
          </div>
        </label>

        {selectedProject && (
          <div className="mt-3 rounded-xl border border-[#243041] bg-[#0f172a] px-3 py-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[#f8fafc]">{selectedProject.name}</p>
                <p className="mt-1 truncate text-xs text-[#64748b]">{selectedProject.path}</p>
              </div>
              <span className="rounded-full border border-[#334155] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">
                {selectedProject.package_manager}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="border-b border-[#263247] px-4 py-3">
        <div className="flex items-center gap-2 rounded-xl border border-[#243041] bg-[#0f172a] px-3 py-2 text-sm text-[#64748b]">
          <Search className="h-4 w-4" />
          <span>Search files and commands</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-[#64748b]">
          <FolderTree className="h-3.5 w-3.5" />
          Files
        </div>

        <div className="space-y-3 rounded-2xl border border-dashed border-[#334155] bg-[#0b1324] p-4">
          <div className="rounded-xl border border-[#1f2a3d] bg-[#0f172a] px-3 py-2.5">
            <p className="text-sm font-medium text-[#e2e8f0]">Phase 2 lands here</p>
            <p className="mt-1 text-xs leading-5 text-[#64748b]">
              Directory listing, lazy expansion, and file tabs will plug into this area next.
            </p>
          </div>

          <div className="space-y-2">
            {[
              "src/",
              "src/components/",
              "apps/server/",
              "README.md",
            ].map((item) => (
              <div
                key={item}
                className="flex items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-sm text-[#94a3b8] transition hover:border-[#243041] hover:bg-[#0f172a] hover:text-[#f8fafc]"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[#3b82f6]" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
