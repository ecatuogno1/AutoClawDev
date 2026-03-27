import { useRef } from "react";
import { LoaderCircle } from "lucide-react";
import { WorkspaceTerminal } from "@/components/workspace/Terminal";
import { useProject } from "@/lib/api";

interface ProjectTerminalPanelProps {
  projectKey: string | null;
}

export function ProjectTerminalPanel({ projectKey }: ProjectTerminalPanelProps) {
  const { data: project, isLoading } = useProject(projectKey ?? "", Boolean(projectKey));
  const sessionIdRef = useRef(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `sidebar-terminal-${Date.now().toString(36)}`,
  );

  if (!projectKey) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-[#8b949e]">
        Select a project tab to open a workspace terminal.
      </div>
    );
  }

  if (isLoading || !project) {
    return (
      <div className="flex h-full items-center justify-center gap-2 p-4 text-sm text-[#8b949e]">
        <LoaderCircle className="size-4 animate-spin" />
        <span>Loading terminal...</span>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-[#30363d]/70 px-4 py-3">
        <div className="text-sm font-medium text-[#e6edf3]">{project.name}</div>
        <p className="mt-1 truncate text-xs text-[#8b949e]" title={project.path}>
          {project.path}
        </p>
      </div>

      <div className="min-h-0 flex-1 bg-[#010409]">
        <WorkspaceTerminal
          sessionId={sessionIdRef.current}
          projectKey={projectKey}
          cwd={project.path}
          active
        />
      </div>
    </div>
  );
}
