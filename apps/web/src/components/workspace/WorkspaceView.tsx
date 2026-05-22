import { useEffect, useRef, useState } from "react";
import {
  GitBranch,
  MessageSquareText,
  Plus,
  SquareCheckBig,
  TerminalSquare,
} from "lucide-react";
import { composerPaneIds } from "@autoclawdev/types";
import {
  activatePane,
  closePane,
  createTask,
  deleteTask,
  ensureComposerPane,
  getComposerReferenceFile,
  getPaneById,
  openFilePane,
  openGitPane,
  openTaskPane,
  openTerminalPane,
  updateTask,
  useComposerWorkspace,
} from "@/lib/workspaceShell";
import { useWorkspaceGitStatus } from "@/lib/api";
import { PaneHost } from "./PaneHost";
import { PaneStrip } from "./PaneStrip";

interface WorkspaceViewProps {
  projectKey: string;
  projectPath: string;
}

export function WorkspaceView({
  projectKey,
  projectPath,
}: WorkspaceViewProps) {
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const { data: gitStatus } = useWorkspaceGitStatus(projectKey);
  const shell = useComposerWorkspace(projectKey);
  const activePane = getPaneById(shell.state, shell.state.activePaneId);
  const currentFilePath = getComposerReferenceFile(shell.state);
  const changedFilesCount = gitStatus?.counts.total ?? gitStatus?.files.length ?? 0;
  const branchLabel = gitStatus?.branch || "unknown";

  useEffect(() => {
    ensureComposerPane(projectKey);
  }, [projectKey]);

  useEffect(() => {
    if (!addMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (
        addMenuRef.current &&
        event.target instanceof Node &&
        !addMenuRef.current.contains(event.target)
      ) {
        setAddMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [addMenuOpen]);

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-[#30363d] bg-[radial-gradient(circle_at_top,rgba(31,111,235,0.08),transparent_28%),#0d1117] shadow-[0_18px_60px_rgba(0,0,0,0.28)]">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <PaneStrip
          activePaneId={shell.state.activePaneId}
          panes={shell.state.panes}
          paneOrder={shell.state.paneOrder}
          startAccessory={
            <div className="inline-flex items-center gap-2 rounded-full border border-[#30363d] bg-[#010409] px-2.5 py-1 text-xs text-[#8b949e]">
              <GitBranch className="size-3.5 text-[#58a6ff]" />
              <span className="font-medium text-[#e6edf3]">{branchLabel}</span>
              {changedFilesCount > 0 ? (
                <span className="rounded-full bg-[#1f6feb] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {changedFilesCount}
                </span>
              ) : null}
            </div>
          }
          endAccessory={
            <div className="relative" ref={addMenuRef}>
              <button
                type="button"
                aria-expanded={addMenuOpen}
                aria-haspopup="menu"
                onClick={() => setAddMenuOpen((current) => !current)}
                className="inline-flex size-8 items-center justify-center rounded-md text-[#8b949e] transition-colors hover:bg-[#161b22] hover:text-[#e6edf3]"
                title="Add pane"
              >
                <Plus className="size-4" />
              </button>

              {addMenuOpen ? (
                <div className="absolute right-0 top-[calc(100%+0.5rem)] z-20 min-w-56 overflow-hidden rounded-xl border border-[#30363d] bg-[#11161d] shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
                  {[
                    {
                      key: "composer",
                      label: "Composer",
                      description: "Focus the persistent workspace chat pane.",
                      icon: MessageSquareText,
                      onSelect: () => {
                        ensureComposerPane(projectKey);
                        activatePane(projectKey, composerPaneIds.composer(projectKey));
                      },
                    },
                    {
                      key: "git",
                      label: "Source Control",
                      description: "Open the source control pane in the workspace.",
                      icon: GitBranch,
                      onSelect: () => {
                        openGitPane(projectKey);
                      },
                    },
                    {
                      key: "terminal",
                      label: "Terminal",
                      description: "Open a terminal pane in this workspace.",
                      icon: TerminalSquare,
                      onSelect: () => {
                        openTerminalPane(projectKey);
                      },
                    },
                    {
                      key: "task",
                      label: "Task",
                      description: "Create a new work item pane in this workspace.",
                      icon: SquareCheckBig,
                      onSelect: () => {
                        createTask(projectKey, {
                          title: "New task",
                          description: "",
                          sourceMessageId: null,
                        });
                      },
                    },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          item.onSelect();
                          setAddMenuOpen(false);
                        }}
                        className="flex w-full items-start gap-3 border-b border-[#222a32] px-4 py-3 text-left text-sm transition-colors last:border-b-0 hover:bg-[#161b22]"
                      >
                        <Icon className="mt-0.5 size-4 shrink-0 text-[#58a6ff]" />
                        <span className="min-w-0">
                          <span className="block text-[#e6edf3]">{item.label}</span>
                          <span className="mt-1 block text-xs text-[#8b949e]">
                            {item.description}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          }
          onActivatePane={(paneId) => activatePane(projectKey, paneId)}
          onClosePane={(paneId) => closePane(projectKey, paneId)}
        />

        <div className="min-h-0 flex-1 overflow-hidden">
          <PaneHost
            activePane={activePane}
            currentFilePath={currentFilePath}
            projectKey={projectKey}
            projectPath={projectPath}
            tasks={shell.tasks}
            onCreateTask={(draft) => createTask(projectKey, draft)}
            onDeleteTask={(taskId) => deleteTask(projectKey, taskId)}
            onOpenFile={(path, line) => openFilePane(projectKey, path, line)}
            onOpenTask={(taskId) => openTaskPane(projectKey, taskId)}
            onUpdateTask={(taskId, patch) => updateTask(projectKey, taskId, patch)}
          />
        </div>

      </div>
    </div>
  );
}
