import { useState } from "react";
import type { ComposerTaskRecord } from "@autoclawdev/types";
import { Chat } from "@/components/Chat";
import { TaskShelf } from "./TaskShelf";

interface ComposerPaneProps {
  currentFilePath: string | null;
  projectKey: string;
  tasks: ComposerTaskRecord[];
  onCreateTask: (draft: {
    title: string;
    description?: string;
    sourceMessageId?: string | null;
  }) => void;
  onOpenFile: (path: string) => void;
  onOpenTask: (taskId: string) => void;
}

export function ComposerPane({
  currentFilePath,
  projectKey,
  tasks,
  onCreateTask,
  onOpenFile,
  onOpenTask,
}: ComposerPaneProps) {
  const [draft, setDraft] = useState<{
    title: string;
    description?: string;
    sourceMessageId?: string | null;
  } | null>(null);

  return (
    <Chat
      currentFilePath={currentFilePath}
      initialProjectKey={projectKey}
      onCreateTaskFromAssistant={(nextDraft) => setDraft(nextDraft)}
      onOpenFile={onOpenFile}
      projectKeyLocked
      sessionScopeKey={projectKey}
      afterTimeline={
        <TaskShelf
          draft={draft}
          tasks={tasks}
          onCreateTask={onCreateTask}
          onClearDraft={() => setDraft(null)}
          onOpenTask={onOpenTask}
        />
      }
    />
  );
}
