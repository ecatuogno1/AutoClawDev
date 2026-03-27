import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { FileTree } from "@/components/workspace/FileTree";
import { useProject } from "@/lib/api";

interface ProjectFilesPanelProps {
  projectKey: string | null;
}

export function ProjectFilesPanel({ projectKey }: ProjectFilesPanelProps) {
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => new Set());
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const { data: project } = useProject(projectKey ?? "", Boolean(projectKey));

  if (!projectKey) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-[#8b949e]">
        Select a project tab to browse its workspace files.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-[#30363d]/70 px-4 py-3">
        <div className="truncate text-sm font-medium text-[#e6edf3]">
          {project?.name ?? projectKey}
        </div>
        <p className="mt-1 text-xs text-[#8b949e]">
          File tree for the active workspace.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <FileTree
          projectKey={projectKey}
          activeFile={activeFile}
          expandedDirs={expandedDirs}
          onSelectFile={setActiveFile}
          onToggleDir={(path) => {
            setExpandedDirs((current) => {
              const next = new Set(current);
              if (next.has(path)) {
                next.delete(path);
              } else {
                next.add(path);
              }
              return next;
            });
          }}
        />
      </div>

      <div className="border-t border-[#30363d]/70 px-4 py-3">
        <Link
          to="/projects/$projectKey/workspace"
          params={{ projectKey }}
          className="block rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-2 text-center text-sm text-[#8b949e] transition-colors hover:border-[#484f58] hover:text-[#e6edf3]"
        >
          Open full workspace
        </Link>
      </div>
    </div>
  );
}
