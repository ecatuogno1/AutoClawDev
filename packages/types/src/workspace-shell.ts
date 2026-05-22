export type ComposerPaneKind =
  | "home"
  | "reviews"
  | "memory"
  | "composer"
  | "task"
  | "file"
  | "git"
  | "terminal";

export type ComposerPaneTier = "workspace" | "ephemeral";

export type ComposerTaskStatus = "open" | "in_progress" | "done";

export interface ComposerPane {
  id: string;
  kind: ComposerPaneKind;
  title: string;
  projectKey: string;
  tier: ComposerPaneTier;
  taskId?: string | null;
  filePath?: string | null;
  line?: number | null;
  sessionId?: string | null;
}

export interface ComposerTaskRecord {
  id: string;
  projectKey: string;
  title: string;
  description: string;
  status: ComposerTaskStatus;
  sourceMessageId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ComposerWorkspaceState {
  projectKey: string;
  paneOrder: string[];
  activePaneId: string | null;
  lastFocusedPaneId: string | null;
  panes: ComposerPane[];
}

export const composerPaneIds = {
  home(projectKey: string) {
    return `home:${projectKey}`;
  },
  reviews(projectKey: string) {
    return `reviews:${projectKey}`;
  },
  memory(projectKey: string) {
    return `memory:${projectKey}`;
  },
  composer(projectKey: string) {
    return `composer:${projectKey}`;
  },
  task(projectKey: string, taskId: string) {
    return `task:${projectKey}||${taskId}`;
  },
  file(projectKey: string, relativePath: string) {
    return `file:${projectKey}||${relativePath}`;
  },
  git(projectKey: string) {
    return `git:${projectKey}`;
  },
  terminal(sessionId: string) {
    return `terminal:${sessionId}`;
  },
};
