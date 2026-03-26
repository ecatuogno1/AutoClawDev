import { useEffect, useState } from "react";
import { FileTree } from "./FileTree";
import { useWorkspaceGitStatus } from "@/lib/api";

const SIDEBAR_WIDTH_KEY = "autoclaw.workspace.sidebarWidth";
const DEFAULT_SIDEBAR_WIDTH = 250;
const MIN_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 480;

interface WorkspaceViewProps {
  projectKey: string;
  projectName: string;
}

export function WorkspaceView({
  projectKey,
  projectName,
}: WorkspaceViewProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
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

  const handleSelectFile = (path: string) => {
    setSelectedFile(path);
    console.info("[workspace] selected file", path);
  };

  const handleResizeStart = (event: React.MouseEvent<HTMLDivElement>) => {
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

  const branchLabel = gitStatus?.branch || "unknown";

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
            selectedFile={selectedFile}
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
        onMouseDown={handleResizeStart}
      >
        <div className="absolute inset-y-0 left-[-3px] right-[-3px] group-hover:bg-[#58a6ff20]" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-[#30363d] px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-[#e6edf3]">
              {selectedFile ?? "No file selected"}
            </div>
            <div className="mt-1 text-xs text-[#8b949e]">
              {selectedFile
                ? "File viewer arrives in Phase 2."
                : "Select a file to view its contents here."}
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

        <div className="min-h-0 flex-1 overflow-auto">
          {selectedFile ? (
            <div className="flex h-full min-h-[380px] items-center justify-center px-8 py-12">
              <div className="max-w-xl rounded-2xl border border-[#30363d] bg-[#161b22] px-8 py-10 text-center">
                <div className="text-4xl">📄</div>
                <div className="mt-4 break-all text-base font-semibold text-[#e6edf3]">
                  {selectedFile}
                </div>
                <p className="mt-2 text-sm text-[#8b949e]">
                  Phase 1 wires file selection and layout shell. Phase 2 adds the
                  code viewer.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex h-full min-h-[380px] items-center justify-center px-8 py-12">
              <div className="max-w-md rounded-2xl border border-dashed border-[#30363d] bg-[#161b22]/60 px-8 py-10 text-center">
                <div className="text-4xl">🛠️</div>
                <div className="mt-4 text-xl font-semibold text-[#e6edf3]">
                  Select a file to view
                </div>
                <p className="mt-2 text-sm text-[#8b949e]">
                  Browse the project tree on the left to start working in this
                  project workspace.
                </p>
              </div>
            </div>
          )}
        </div>

        {isTerminalOpen && (
          <div className="h-40 border-t border-[#30363d] bg-[#010409] px-4 py-3">
            <div className="text-xs uppercase tracking-[0.18em] text-[#6e7681]">
              Terminal
            </div>
            <div className="mt-3 rounded-lg border border-dashed border-[#30363d] bg-[#0d1117] px-4 py-6 text-sm text-[#8b949e]">
              Integrated terminal lands in Phase 3.
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 border-t border-[#30363d] bg-[#010409] px-4 py-2 text-xs text-[#8b949e]">
          <span>Branch: {branchLabel}</span>
          <span className="text-[#30363d]">|</span>
          <span className="truncate">File: {selectedFile ?? "None"}</span>
          <span className="text-[#30363d]">|</span>
          <span className="truncate">Project: {projectName}</span>
        </div>
      </div>
    </div>
  );
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
