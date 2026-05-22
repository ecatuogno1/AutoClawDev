import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { FileTree } from "@/components/workspace/FileTree";
import { useProject } from "@/lib/api";
import {
  getComposerReferenceFile,
  openFilePane,
  useComposerWorkspace,
} from "@/lib/workspaceShell";

interface ProjectFilesPanelProps {
  projectKey: string | null;
}

export function ProjectFilesPanel({ projectKey }: ProjectFilesPanelProps) {
  const navigate = useNavigate();
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => new Set());
  const shell = useComposerWorkspace(projectKey ?? "__no-project__");
  const activeFile = projectKey ? getComposerReferenceFile(shell.state) : null;
  const { data: project } = useProject(projectKey ?? "", Boolean(projectKey));

  useEffect(() => {
    if (!activeFile) {
      return;
    }

    setExpandedDirs((current) => {
      const next = new Set(current);
      for (const segment of expandSegments(activeFile)) {
        next.add(segment);
      }
      return next;
    });
  }, [activeFile]);

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
          showHeader={false}
          onSelectFile={(path) => {
            openFilePane(projectKey, path);
            setExpandedDirs((current) => {
              const next = new Set(current);
              for (const segment of expandSegments(path)) {
                next.add(segment);
              }
              return next;
            });
            navigate({
              to: "/projects/$projectKey/workspace",
              params: { projectKey },
            });
          }}
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

function expandSegments(path: string) {
  const segments = path.split("/");
  const expanded: string[] = [];

  for (let index = 1; index < segments.length; index += 1) {
    expanded.push(segments.slice(0, index).join("/"));
  }

  return expanded;
}
