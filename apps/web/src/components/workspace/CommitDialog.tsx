import { LoaderCircle, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { WorkspaceGitFileStatus } from "@/types";
import { cn } from "@/lib/cn";

interface CommitDialogProps {
  open: boolean;
  stagedFiles: WorkspaceGitFileStatus[];
  allFiles: WorkspaceGitFileStatus[];
  changedFilesCount: number;
  initialCommitAll: boolean;
  pending: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (input: { message: string; all: boolean }) => Promise<void> | void;
}

export function CommitDialog({
  open,
  stagedFiles,
  allFiles,
  changedFilesCount,
  initialCommitAll,
  pending,
  error = null,
  onClose,
  onSubmit,
}: CommitDialogProps) {
  const [message, setMessage] = useState("");
  const [commitAll, setCommitAll] = useState(initialCommitAll);

  useEffect(() => {
    if (!open) {
      return;
    }
    setCommitAll(initialCommitAll);
    setMessage("");
  }, [initialCommitAll, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open, pending]);

  if (!open) {
    return null;
  }

  const commitTargetCount = commitAll ? changedFilesCount : stagedFiles.length;
  const visibleFiles = commitAll ? allFiles : stagedFiles;
  const submitDisabled = pending || message.trim().length === 0 || commitTargetCount === 0;

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-6 backdrop-blur-[2px]">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-[#30363d] bg-[#0d1117] shadow-2xl">
        <div className="flex items-start justify-between border-b border-[#30363d] px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-[#e6edf3]">Create commit</h2>
            <p className="mt-1 text-sm text-[#8b949e]">
              Review the files included in this commit and provide a message.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-md border border-[#30363d] p-2 text-[#8b949e] transition-colors hover:border-[#58a6ff] hover:text-[#e6edf3] disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Close commit dialog"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <label className="block">
            <span className="mb-2 block text-xs font-medium uppercase tracking-[0.16em] text-[#8b949e]">
              Commit message
            </span>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Describe what changed"
              rows={4}
              className="w-full resize-none rounded-xl border border-[#30363d] bg-[#010409] px-3 py-2 text-sm text-[#e6edf3] outline-none transition-colors placeholder:text-[#6e7681] focus:border-[#58a6ff]"
            />
          </label>

          <label className="flex items-start gap-3 rounded-xl border border-[#30363d] bg-[#010409] px-4 py-3">
            <input
              type="checkbox"
              checked={commitAll}
              onChange={(event) => setCommitAll(event.target.checked)}
              className="mt-1 size-4 rounded border-[#30363d] bg-[#0d1117] text-[#58a6ff]"
            />
            <span>
              <span className="block text-sm font-medium text-[#e6edf3]">Commit all changes</span>
              <span className="mt-1 block text-xs text-[#8b949e]">
                {commitAll
                  ? `The commit will include all ${changedFilesCount} changed file${changedFilesCount === 1 ? "" : "s"}.`
                  : `The commit will include ${stagedFiles.length} staged file${stagedFiles.length === 1 ? "" : "s"}.`}
              </span>
            </span>
          </label>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-[0.16em] text-[#8b949e]">
                {commitAll ? "All changed files" : "Staged files"}
              </span>
              <span className="text-xs text-[#6e7681]">{commitTargetCount} selected</span>
            </div>
            <div className="max-h-56 overflow-auto rounded-xl border border-[#30363d] bg-[#010409]">
              {visibleFiles.length === 0 ? (
                <div className="px-4 py-6 text-sm text-[#8b949e]">
                  Stage at least one file or enable “Commit all changes”.
                </div>
              ) : (
                <div className="divide-y divide-[#161b22]">
                  {visibleFiles.map((file) => (
                    <div
                      key={file.path}
                      className="flex items-center justify-between gap-3 px-4 py-2 text-sm"
                    >
                      <span className="truncate text-[#c9d1d9]">{file.path}</span>
                      <span
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-[11px]",
                          file.staged
                            ? "border-[#1f6feb55] bg-[#0f2418] text-[#7ee787]"
                            : "border-[#d2992255] bg-[#1b1408] text-[#f2cc60]",
                        )}
                      >
                        {file.label}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {error ? <div className="text-sm text-[#f85149]">{error}</div> : null}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-[#30363d] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-md border border-[#30363d] px-4 py-2 text-sm text-[#8b949e] transition-colors hover:border-[#58a6ff] hover:text-[#e6edf3] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSubmit({ message, all: commitAll })}
            disabled={submitDisabled}
            className="inline-flex items-center gap-2 rounded-md bg-[#238636] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2ea043] disabled:cursor-not-allowed disabled:bg-[#23863680]"
          >
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
            <span>{pending ? "Committing…" : "Commit changes"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
