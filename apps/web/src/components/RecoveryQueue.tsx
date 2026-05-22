import { Link } from "@tanstack/react-router";
import { useState } from "react";
import type { RunRecord } from "@autoclawdev/types";
import { useRunRecoveryAction } from "@/lib/api";

interface RecoveryQueueProps {
  runs: RunRecord[];
  showProject?: boolean;
  title?: string;
  emptyLabel?: string;
}

function formatTime(ts: string) {
  const d = new Date(ts);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function recoveryLabel(run: RunRecord) {
  if (run.recovery?.branch && run.recovery?.worktree) {
    return `${run.recovery.branch} · ${run.recovery.worktree}`;
  }
  if (run.recovery?.branch) {
    return run.recovery.branch;
  }
  if (run.recovery?.worktree) {
    return run.recovery.worktree;
  }
  return "manual intervention required";
}

export function RecoveryQueue({
  runs,
  showProject = false,
  title = "Recovery Queue",
  emptyLabel = "No recovery-required runs",
}: RecoveryQueueProps) {
  const recoveryMutation = useRunRecoveryAction();
  const [copiedRunId, setCopiedRunId] = useState<string | null>(null);

  async function copyRecoveryCommands(run: RunRecord) {
    const commands = [
      run.recovery?.worktree ? `cd "${run.recovery.worktree}"` : undefined,
      "git status",
      run.recovery?.branch ? `git branch --show-current # expected ${run.recovery.branch}` : undefined,
      run.recovery?.summaryPath ? `cat "${run.recovery.summaryPath}"` : undefined,
    ]
      .filter(Boolean)
      .join("\n");

    await navigator.clipboard.writeText(commands);
    setCopiedRunId(run.id);
    window.setTimeout(() => {
      setCopiedRunId((current) => (current === run.id ? null : current));
    }, 1500);
  }

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#30363d]">
        <div>
          <h2 className="text-base font-semibold text-[#e6edf3]">{title}</h2>
          <p className="text-xs text-[#8b949e] mt-0.5">
            Preserved branches and worktrees that still need operator action
          </p>
        </div>
        <span className="text-xs bg-[#f8514915] text-[#f85149] px-2.5 py-1 rounded-full font-medium">
          {runs.length} queued
        </span>
      </div>

      {runs.length > 0 ? (
        <div>
          {runs.map((run) => (
            <div
              key={run.id}
              className="px-4 py-3 border-b border-[#30363d] last:border-0 hover:bg-[#0d111780] transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {showProject && (
                      <Link
                        to="/projects/$projectKey"
                        params={{ projectKey: run.projectKey }}
                        className="mono text-xs text-[#58a6ff] hover:underline"
                      >
                        {run.projectKey}
                      </Link>
                    )}
                    <span className="text-xs bg-[#f8514915] text-[#f85149] px-2 py-0.5 rounded-full">
                      Recovery Required
                    </span>
                    <span className="mono text-xs text-[#6e7681]">{run.id.slice(0, 24)}</span>
                  </div>
                  <div className="text-sm text-[#e6edf3] mt-1">
                    {run.summary || "Manual recovery required"}
                  </div>
                  <div className="text-xs text-[#f85149] mt-1 truncate">
                    {recoveryLabel(run)}
                  </div>
                  {run.recovery?.summaryPath && (
                    <div className="text-xs text-[#8b949e] mt-1 truncate">
                      summary: {run.recovery.summaryPath}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 mt-3">
                    {run.recovery?.summaryPath && (
                      <a
                        href={`/api/runs/${run.id}/recovery-summary`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs bg-[#21262d] text-[#e6edf3] px-2.5 py-1 rounded-md hover:bg-[#30363d]"
                      >
                        Open summary
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => copyRecoveryCommands(run)}
                      className="text-xs bg-[#21262d] text-[#e6edf3] px-2.5 py-1 rounded-md hover:bg-[#30363d]"
                    >
                      {copiedRunId === run.id ? "Copied" : "Copy commands"}
                    </button>
                    <button
                      type="button"
                      disabled={recoveryMutation.isPending}
                      onClick={() => recoveryMutation.mutate({ runId: run.id, action: "resolve" })}
                      className="text-xs bg-[#3fb95015] text-[#3fb950] px-2.5 py-1 rounded-md hover:bg-[#3fb95025] disabled:opacity-60"
                    >
                      Mark resolved
                    </button>
                    <button
                      type="button"
                      disabled={recoveryMutation.isPending}
                      onClick={() => recoveryMutation.mutate({ runId: run.id, action: "abandon" })}
                      className="text-xs bg-[#f8514915] text-[#f85149] px-2.5 py-1 rounded-md hover:bg-[#f8514925] disabled:opacity-60"
                    >
                      Abandon
                    </button>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs text-[#8b949e] uppercase">{run.mode}</div>
                  <div className="text-xs text-[#6e7681] mt-1">{formatTime(run.createdAt)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-4 py-8 text-center">
          <p className="text-sm text-[#8b949e]">{emptyLabel}</p>
        </div>
      )}
    </div>
  );
}
