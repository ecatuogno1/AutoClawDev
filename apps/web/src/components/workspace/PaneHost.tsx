import { useState } from "react";
import type { ComposerPane, ComposerTaskRecord, ComposerTaskStatus } from "@autoclawdev/types";
import { ComposerPane as ComposerPaneView } from "./ComposerPane";
import { CodeViewer, type WorkspaceFileTarget } from "./CodeViewer";
import { GitPanel } from "./GitPanel";
import { TaskPane } from "./TaskPane";
import { WorkspaceTerminal, type WorkspaceTerminalConnectionState } from "./Terminal";
import { ProjectHomePane } from "@/routes/projects/$projectKey/index";
import { ProjectReviewsPane } from "@/routes/projects/$projectKey/reviews";
import { ProjectMemoryPane } from "@/routes/projects/$projectKey/memory";

interface PaneHostProps {
  activePane: ComposerPane | null;
  currentFilePath: string | null;
  projectKey: string;
  projectPath: string;
  tasks: ComposerTaskRecord[];
  onCreateTask: (draft: {
    title: string;
    description?: string;
    sourceMessageId?: string | null;
  }) => void;
  onDeleteTask: (taskId: string) => void;
  onOpenFile: (path: string, line?: number | null) => void;
  onOpenTask: (taskId: string) => void;
  onUpdateTask: (
    taskId: string,
    patch: { title?: string; description?: string; status?: ComposerTaskStatus },
  ) => void;
}

export function PaneHost({
  activePane,
  currentFilePath,
  projectKey,
  projectPath,
  tasks,
  onCreateTask,
  onDeleteTask,
  onOpenFile,
  onOpenTask,
  onUpdateTask,
}: PaneHostProps) {
  const [terminalState, setTerminalState] = useState<WorkspaceTerminalConnectionState>("connecting");

  if (!activePane || activePane.kind === "composer") {
    return (
      <ComposerPaneView
        currentFilePath={currentFilePath}
        projectKey={projectKey}
        tasks={tasks}
        onCreateTask={onCreateTask}
        onOpenFile={(path) => onOpenFile(path, null)}
        onOpenTask={onOpenTask}
      />
    );
  }

  if (activePane.kind === "home") {
    return (
      <div className="h-full overflow-auto">
        <ProjectHomePane projectKey={projectKey} />
      </div>
    );
  }

  if (activePane.kind === "reviews") {
    return (
      <div className="h-full overflow-auto">
        <ProjectReviewsPane projectKey={projectKey} />
      </div>
    );
  }

  if (activePane.kind === "memory") {
    return (
      <div className="h-full overflow-auto">
        <ProjectMemoryPane projectKey={projectKey} />
      </div>
    );
  }

  if (activePane.kind === "task") {
    const task = tasks.find((entry) => entry.id === activePane.taskId);
    if (!task) {
      return <EmptyPaneState label="Task not found." />;
    }

    return <TaskPane task={task} onDeleteTask={onDeleteTask} onUpdateTask={onUpdateTask} />;
  }

  if (activePane.kind === "file") {
    const fileTarget: WorkspaceFileTarget | null = activePane.filePath
      ? {
          path: activePane.filePath,
          line: activePane.line ?? null,
        }
      : null;

    return <CodeViewer activeFile={fileTarget} projectKey={projectKey} />;
  }

  if (activePane.kind === "git") {
    return <GitPanel projectKey={projectKey} />;
  }

  if (activePane.kind === "terminal" && activePane.sessionId) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-[#010409]">
        <div className="border-b border-[#30363d] px-4 py-3 text-xs text-[#8b949e]">
          <span className="font-medium text-[#e6edf3]">{activePane.title}</span>
          <span className="mx-2 text-[#30363d]">|</span>
          <span>{terminalState}</span>
          <span className="mx-2 text-[#30363d]">|</span>
          <span className="truncate">cwd: {projectPath}</span>
        </div>
        <div className="min-h-0 flex-1">
          <WorkspaceTerminal
            active
            cwd={projectPath}
            projectKey={projectKey}
            sessionId={activePane.sessionId}
            onStateChange={(state) => setTerminalState(state)}
          />
        </div>
      </div>
    );
  }

  return <EmptyPaneState label="Pane unavailable." />;
}

function EmptyPaneState({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center px-6 text-sm text-[#8b949e]">
      {label}
    </div>
  );
}
