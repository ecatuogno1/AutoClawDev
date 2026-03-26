import { GitBranch, GitCommitHorizontal, LoaderCircle, Plus, RefreshCcw, Undo2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  useWorkspaceGitCommit,
  useWorkspaceGitDiff,
  useWorkspaceGitStage,
  useWorkspaceGitStatus,
} from "@/lib/api";
import { cn } from "@/lib/cn";
import type { WorkspaceGitFileStatus } from "@/types";
import { CommitDialog } from "./CommitDialog";
import { DiffViewer } from "./DiffViewer";

interface GitPanelProps {
  projectKey: string;
}

type GitSectionId = "staged" | "changes" | "untracked";

export function GitPanel({ projectKey }: GitPanelProps) {
  const {
    data: gitStatus,
    isLoading: statusLoading,
    isError: statusError,
    error,
  } = useWorkspaceGitStatus(projectKey);
  const stageMutation = useWorkspaceGitStage(projectKey);
  const commitMutation = useWorkspaceGitCommit(projectKey);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [isCommitDialogOpen, setIsCommitDialogOpen] = useState(false);
  const [commitDialogError, setCommitDialogError] = useState<string | null>(null);

  const changedFiles = gitStatus?.files ?? [];
  const stagedFiles = useMemo(
    () => dedupeFiles(gitStatus?.staged ?? []),
    [gitStatus?.staged],
  );
  const unstagedFiles = useMemo(
    () => dedupeFiles(gitStatus?.unstaged ?? []),
    [gitStatus?.unstaged],
  );
  const untrackedFiles = useMemo(
    () => dedupeFiles(gitStatus?.untracked ?? []),
    [gitStatus?.untracked],
  );

  useEffect(() => {
    if (!changedFiles.length) {
      setSelectedPath(null);
      return;
    }

    const hasSelectedFile = selectedPath
      ? changedFiles.some((file) => file.path === selectedPath)
      : false;

    if (!hasSelectedFile) {
      setSelectedPath(changedFiles[0]?.path ?? null);
    }
  }, [changedFiles, selectedPath]);

  const {
    data: diffResponse,
    isLoading: diffLoading,
    error: diffError,
  } = useWorkspaceGitDiff(projectKey, selectedPath, Boolean(selectedPath));

  async function handleStageFile(file: WorkspaceGitFileStatus, mode: "stage" | "unstage") {
    await stageMutation.mutateAsync({ paths: [file.path], mode });
  }

  async function handleCommit(input: { message: string; all: boolean }) {
    setCommitDialogError(null);
    try {
      await commitMutation.mutateAsync(input);
      setIsCommitDialogOpen(false);
    } catch (mutationError) {
      setCommitDialogError(
        mutationError instanceof Error ? mutationError.message : "Unable to create commit.",
      );
    }
  }

  if (statusLoading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-[#8b949e]">
        <LoaderCircle className="size-4 animate-spin" />
        <span>Loading git status…</span>
      </div>
    );
  }

  if (statusError || !gitStatus) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <div>
          <p className="text-sm font-semibold text-[#f85149]">Unable to load git status</p>
          <p className="mt-2 text-sm text-[#8b949e]">
            {error instanceof Error ? error.message : "The workspace git status request failed."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 bg-[#0d1117]">
      <aside className="flex w-[320px] shrink-0 flex-col border-r border-[#30363d] bg-[#010409]">
        <div className="border-b border-[#30363d] px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#e6edf3]">
            <GitBranch className="size-4 text-[#58a6ff]" />
            <span className="truncate">{gitStatus.branch}</span>
          </div>
          <p className="mt-1 text-xs text-[#8b949e]">
            {gitStatus.clean
              ? "Working tree clean."
              : `${gitStatus.counts.total} file${gitStatus.counts.total === 1 ? "" : "s"} changed.`}
          </p>
          {gitStatus.lastCommit ? (
            <p className="mt-2 truncate text-xs text-[#6e7681]">{gitStatus.lastCommit}</p>
          ) : null}
        </div>

        <div className="flex items-center gap-2 border-b border-[#30363d] px-4 py-3">
          <button
            type="button"
            onClick={() => stageMutation.mutate({ all: true, mode: "stage" })}
            disabled={stageMutation.isPending || gitStatus.clean}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#30363d] px-3 py-1.5 text-xs font-medium text-[#8b949e] transition-colors hover:border-[#58a6ff] hover:text-[#e6edf3] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="size-3.5" />
            Stage all
          </button>
          <button
            type="button"
            onClick={() => stageMutation.mutate({ all: true, mode: "unstage" })}
            disabled={stageMutation.isPending || gitStatus.counts.staged === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#30363d] px-3 py-1.5 text-xs font-medium text-[#8b949e] transition-colors hover:border-[#58a6ff] hover:text-[#e6edf3] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Undo2 className="size-3.5" />
            Unstage all
          </button>
          <button
            type="button"
            onClick={() => {
              setCommitDialogError(null);
              setIsCommitDialogOpen(true);
            }}
            disabled={commitMutation.isPending || gitStatus.clean}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#238636] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#2ea043] disabled:cursor-not-allowed disabled:bg-[#23863680]"
          >
            <GitCommitHorizontal className="size-3.5" />
            Commit
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-2">
          <GitFileSection
            id="staged"
            title="Staged"
            count={stagedFiles.length}
            files={stagedFiles}
            selectedPath={selectedPath}
            actionLabel="Unstage"
            onAction={(file) => handleStageFile(file, "unstage")}
            onSelect={setSelectedPath}
            pendingPath={stageMutation.variables?.paths?.[0]}
            busy={stageMutation.isPending}
          />
          <GitFileSection
            id="changes"
            title="Changes"
            count={unstagedFiles.length}
            files={unstagedFiles}
            selectedPath={selectedPath}
            actionLabel="Stage"
            onAction={(file) => handleStageFile(file, "stage")}
            onSelect={setSelectedPath}
            pendingPath={stageMutation.variables?.paths?.[0]}
            busy={stageMutation.isPending}
          />
          <GitFileSection
            id="untracked"
            title="Untracked"
            count={untrackedFiles.length}
            files={untrackedFiles}
            selectedPath={selectedPath}
            actionLabel="Stage"
            onAction={(file) => handleStageFile(file, "stage")}
            onSelect={setSelectedPath}
            pendingPath={stageMutation.variables?.paths?.[0]}
            busy={stageMutation.isPending}
          />
        </div>

        {stageMutation.error ? (
          <div className="border-t border-[#30363d] px-4 py-3 text-xs text-[#f85149]">
            {stageMutation.error instanceof Error
              ? stageMutation.error.message
              : "Unable to update staged files."}
          </div>
        ) : null}
      </aside>

      <div className="min-w-0 flex-1 p-4">
        <DiffViewer
          path={selectedPath}
          diff={diffResponse?.diff ?? ""}
          file={diffResponse?.file ?? null}
          isLoading={diffLoading}
          error={diffError instanceof Error ? diffError.message : null}
        />
      </div>

      <CommitDialog
        open={isCommitDialogOpen}
        stagedFiles={stagedFiles}
        allFiles={changedFiles}
        changedFilesCount={gitStatus.counts.total}
        initialCommitAll={gitStatus.counts.staged === 0}
        pending={commitMutation.isPending}
        error={commitDialogError}
        onClose={() => setIsCommitDialogOpen(false)}
        onSubmit={handleCommit}
      />
    </div>
  );
}

function GitFileSection({
  title,
  count,
  files,
  selectedPath,
  actionLabel,
  onAction,
  onSelect,
  pendingPath,
  busy,
}: {
  id: GitSectionId;
  title: string;
  count: number;
  files: WorkspaceGitFileStatus[];
  selectedPath: string | null;
  actionLabel: string;
  onAction: (file: WorkspaceGitFileStatus) => void;
  onSelect: (path: string) => void;
  pendingPath?: string;
  busy: boolean;
}) {
  return (
    <section className="mb-4">
      <div className="mb-2 flex items-center justify-between px-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#6e7681]">
          {title}
        </span>
        <span className="rounded-full border border-[#30363d] px-2 py-0.5 text-[11px] text-[#8b949e]">
          {count}
        </span>
      </div>

      {files.length === 0 ? (
        <div className="px-2 py-2 text-sm text-[#6e7681]">No files.</div>
      ) : (
        <div className="space-y-1">
          {files.map((file) => {
            const isPending = busy && pendingPath === file.path;
            return (
              <button
                key={`${title}:${file.path}`}
                type="button"
                onClick={() => onSelect(file.path)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg border px-2 py-2 text-left transition-colors",
                  selectedPath === file.path
                    ? "border-[#1f6feb66] bg-[#1f6feb20]"
                    : "border-transparent hover:border-[#30363d] hover:bg-[#161b22]",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-[#c9d1d9]">{file.path}</span>
                  <span className="mt-0.5 block text-xs text-[#6e7681]">
                    {file.originalPath ? `${file.label} from ${file.originalPath}` : file.label}
                  </span>
                </span>
                <span className="rounded-md border border-[#30363d] px-2 py-0.5 text-[11px] font-medium text-[#8b949e]">
                  {file.status.trim() || "??"}
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation();
                    onAction(file);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onAction(file);
                    }
                  }}
                  className="rounded-md border border-[#30363d] px-2 py-1 text-[11px] font-medium text-[#8b949e] transition-colors hover:border-[#58a6ff] hover:text-[#e6edf3]"
                >
                  {isPending ? (
                    <span className="inline-flex items-center gap-1">
                      <RefreshCcw className="size-3 animate-spin" />
                      Working
                    </span>
                  ) : (
                    actionLabel
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function dedupeFiles(files: WorkspaceGitFileStatus[]) {
  const seen = new Set<string>();
  return files.filter((file) => {
    if (seen.has(file.path)) {
      return false;
    }
    seen.add(file.path);
    return true;
  });
}
