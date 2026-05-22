import type { RunRecord } from "@autoclawdev/types";

interface HistoryRowProps {
  run: RunRecord;
  showProject?: boolean;
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

function outcomeMeta(run: RunRecord) {
  switch (run.outcome) {
    case "clean_pass":
      return { label: "Clean Pass", tone: "text-[#3fb950]", dot: "bg-[#3fb950]" };
    case "degraded_pass":
      return { label: "Degraded Pass", tone: "text-[#d29922]", dot: "bg-[#d29922]" };
    case "recovery_required":
      return { label: "Recovery Required", tone: "text-[#f85149]", dot: "bg-[#f85149]" };
    default:
      return { label: "Failed", tone: "text-[#f85149]", dot: "bg-[#f85149]" };
  }
}

export function HistoryRow({ run, showProject = false }: HistoryRowProps) {
  const meta = outcomeMeta(run);

  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b border-[#30363d] hover:bg-[#161b22] transition-colors">
      <div className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${meta.dot}`} />
      <span className="mono text-xs text-[#6e7681] w-28 shrink-0">{run.id.slice(0, 24)}</span>
      {showProject && (
        <span className="mono text-xs text-[#d29922] w-20 shrink-0">{run.projectKey}</span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-medium ${meta.tone}`}>{meta.label}</span>
          <span className="text-xs text-[#8b949e] uppercase">{run.mode}</span>
          <span className="text-xs text-[#8b949e]">{run.source === "legacy_import" ? "Imported" : "Native"}</span>
          {run.historyCompleteness === "partial" && (
            <span className="text-xs text-[#d29922]">Partial history</span>
          )}
          {run.overrideReason && (
            <span className="text-xs text-[#d29922]">override: {run.overrideReason}</span>
          )}
        </div>
        <div className="text-sm text-[#e6edf3] truncate">{run.summary || `${run.mode} run`}</div>
        {run.recovery?.required && (
          <div className="text-xs text-[#f85149] truncate">
            recovery: {run.recovery.branch || run.recovery.worktree || "manual intervention required"}
          </div>
        )}
        {!run.recovery?.required && run.recovery?.status === "resolved" && (
          <div className="text-xs text-[#3fb950] truncate">
            recovery resolved {run.recovery.resolvedAt ? `· ${formatTime(run.recovery.resolvedAt)}` : ""}
          </div>
        )}
        {!run.recovery?.required && run.recovery?.status === "abandoned" && (
          <div className="text-xs text-[#d29922] truncate">
            recovery abandoned {run.recovery.resolvedAt ? `· ${formatTime(run.recovery.resolvedAt)}` : ""}
          </div>
        )}
      </div>
      <span className="text-xs text-[#6e7681] w-32 text-right shrink-0 hidden sm:block">
        {formatTime(run.createdAt)}
      </span>
    </div>
  );
}
