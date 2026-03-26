export interface WorkspaceFileEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  language?: string;
}

export interface WorkspaceDirectoryListing {
  path: string;
  entries: WorkspaceFileEntry[];
}

export interface WorkspaceFileContent {
  path: string;
  name: string;
  content: string;
  language: string;
  size: number;
}

export interface WorkspaceGitFileStatus {
  status: string;
  path: string;
  originalPath: string | null;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  indexStatus: string;
  workingTreeStatus: string;
  label: string;
}

export interface WorkspaceGitCounts {
  total: number;
  staged: number;
  unstaged: number;
  untracked: number;
}

export interface WorkspaceGitStatus {
  branch: string;
  lastCommit: string;
  files: WorkspaceGitFileStatus[];
  staged: WorkspaceGitFileStatus[];
  unstaged: WorkspaceGitFileStatus[];
  untracked: WorkspaceGitFileStatus[];
  counts: WorkspaceGitCounts;
  clean: boolean;
  error?: string;
}

export interface WorkspaceGitDiffResponse {
  diff: string;
  file: WorkspaceGitFileStatus | null;
}

export interface WorkspaceGitCommitResponse {
  ok: boolean;
  branch: string;
  commit: string;
  lastCommit: string;
  status: WorkspaceGitStatus;
}

export interface WorkspaceGitStageResponse {
  ok: boolean;
  mode: "stage" | "unstage";
  status: WorkspaceGitStatus;
}
