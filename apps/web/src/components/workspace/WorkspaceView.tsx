import { useEffect, useState } from "react";
import { CodeViewer, type WorkspaceFileTarget } from "./CodeViewer";
import { FileTree } from "./FileTree";
import { TerminalPanel } from "./TerminalPanel";
import { useWorkspaceGitStatus } from "@/lib/api";
import {
  basenameOf,
  getLanguageLabel,
} from "@/components/workspace/filePresentation";

const SIDEBAR_WIDTH_KEY = "autoclaw.workspace.sidebarWidth";
const DEFAULT_SIDEBAR_WIDTH = 250;
const MIN_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 480;

interface WorkspaceViewProps {
  projectKey: string;
  projectName: string;
  projectPath: string;
}

export function WorkspaceView({
  projectKey,
  projectName,
  projectPath,
}: WorkspaceViewProps) {
  const [openFiles, setOpenFiles] = useState<string[]>([]);
  const [activeFile, setActiveFile] = useState<WorkspaceFileTarget | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => new Set());
  const [sidebarWidth, setSidebarWidth] = useState(() => readSidebarWidth());
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const { data: gitStatus } = useWorkspaceGitStatus(projectKey);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  const handleToggleDir = (path: string) => {
    setExpandedDirs((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleSelectFile = (target: string | WorkspaceFileTarget) => {
    const nextTarget =
      typeof target === "string"
        ? parseWorkspaceFileTarget(target)
        : {
            path: target.path,
            line: target.line ?? null,
          };

    setOpenFiles((current) =>
      current.includes(nextTarget.path) ? current : [...current, nextTarget.path],
    );
    setActiveFile(nextTarget);
    expandAncestorDirectories(nextTarget.path, setExpandedDirs);
  };

  const handleCloseFile = (path: string) => {
    setOpenFiles((current) => {
      const index = current.indexOf(path);
      if (index === -1) {
        return current;
      }

      const next = current.filter((entry) => entry !== path);
      setActiveFile((currentActive) => {
        if (currentActive?.path !== path) {
          return currentActive;
        }

        const fallbackPath = next[index] ?? next[index - 1] ?? null;
        return fallbackPath ? { path: fallbackPath, line: null } : null;
      });
      return next;
    });
  };

  const branchLabel = gitStatus?.branch || "unknown";
  const activeFilePath = activeFile?.path ?? null;

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-[#30363d] bg-[#0d1117]">
      <div
        className="flex min-h-0 shrink-0 flex-col border-r border-[#30363d] bg-[#010409]"
        style={{ width: `${sidebarWidth}px` }}
      >
        <div className="border-b border-[#30363d] px-4 py-3">
          <div className="text-sm font-semibold text-[#e6edf3]">Workspace</div>
          <div className="mt-1 text-xs text-[#8b949e]">{projectName}</div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <FileTree
            projectKey={projectKey}
            activeFile={activeFilePath}
            expandedDirs={expandedDirs}
            onSelectFile={handleSelectFile}
            onToggleDir={handleToggleDir}
          />
        </div>
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize workspace sidebar"
        className="group relative w-1 shrink-0 cursor-col-resize bg-[#0d1117]"
        onMouseDown={handleResizeStart(sidebarWidth, setSidebarWidth)}
      >
        <div className="absolute inset-y-0 left-[-3px] right-[-3px] group-hover:bg-[#58a6ff20]" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-[#30363d] px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-[#e6edf3]">
              {activeFilePath ?? "No file selected"}
            </div>
            <div className="mt-1 text-xs text-[#8b949e]">
              {activeFilePath
                ? `Viewing ${basenameOf(activeFilePath)} in the workspace editor.`
                : "Select a file to open it in the workspace editor."}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsTerminalOpen((current) => !current)}
            className="rounded-md border border-[#30363d] px-3 py-1.5 text-xs font-medium text-[#8b949e] transition-colors hover:border-[#58a6ff] hover:text-[#e6edf3]"
          >
            {isTerminalOpen ? "Hide Terminal" : "Show Terminal"}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          <CodeViewer
            projectKey={projectKey}
            openFiles={openFiles}
            activeFile={activeFile}
            onSelectFile={handleSelectFile}
            onCloseFile={handleCloseFile}
          />
        </div>

        <TerminalPanel
          open={isTerminalOpen}
          onOpenChange={setIsTerminalOpen}
          projectKey={projectKey}
          projectPath={projectPath}
        />

        <div className="flex items-center gap-3 border-t border-[#30363d] bg-[#010409] px-4 py-2 text-xs text-[#8b949e]">
          <span>Branch: {branchLabel}</span>
          <span className="text-[#30363d]">|</span>
          <span className="truncate">File: {activeFilePath ?? "None"}</span>
          <span className="text-[#30363d]">|</span>
          <span>
            Language: {activeFilePath ? getLanguageLabel(inferLanguageFromPath(activeFilePath)) : "N/A"}
          </span>
          <span className="text-[#30363d]">|</span>
          <span className="truncate">Project: {projectName}</span>
        </div>
      </div>
    </div>
  );
}

function handleResizeStart(
  sidebarWidth: number,
  setSidebarWidth: React.Dispatch<React.SetStateAction<number>>,
) {
  return (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const nextWidth = clampSidebarWidth(startWidth + moveEvent.clientX - startX);
      setSidebarWidth(nextWidth);
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    };

    document.body.style.setProperty("cursor", "col-resize");
    document.body.style.setProperty("user-select", "none");
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };
}

function parseWorkspaceFileTarget(input: string): WorkspaceFileTarget {
  const match = input.match(/^(.*?):(\d+)(?::(\d+))?$/);
  if (!match?.[1]) {
    return { path: input, line: null };
  }

  return {
    path: match[1],
    line: Number.parseInt(match[2] ?? "", 10) || null,
  };
}

function expandAncestorDirectories(
  path: string,
  setExpandedDirs: React.Dispatch<React.SetStateAction<Set<string>>>,
) {
  const segments = path.split("/");
  if (segments.length <= 1) {
    return;
  }

  setExpandedDirs((current) => {
    const next = new Set(current);
    for (let index = 1; index < segments.length; index += 1) {
      next.add(segments.slice(0, index).join("/"));
    }
    return next;
  });
}

function inferLanguageFromPath(path: string) {
  const extension = path.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "ts":
    case "tsx":
      return "typescript";
    case "js":
    case "jsx":
      return "javascript";
    case "json":
      return "json";
    case "md":
      return "markdown";
    case "css":
      return "css";
    case "html":
      return "html";
    case "yml":
    case "yaml":
      return "yaml";
    case "py":
      return "python";
    case "sh":
    case "zsh":
      return "bash";
    default:
      return "plaintext";
  }
}

function clampSidebarWidth(width: number) {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));
}

function readSidebarWidth() {
  if (typeof window === "undefined") {
    return DEFAULT_SIDEBAR_WIDTH;
  }

  const raw = window.localStorage.getItem(SIDEBAR_WIDTH_KEY);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SIDEBAR_WIDTH;
  }

  return clampSidebarWidth(parsed);
}
