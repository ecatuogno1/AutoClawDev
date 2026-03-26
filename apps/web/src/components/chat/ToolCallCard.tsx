import { ChevronDown, ChevronRight, Eye, FileCode2, FolderSearch2, Play, TerminalSquare } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { InlineDiff } from "@/components/chat/InlineDiff";
import type { ChatToolCall } from "@/components/chat/types";
import { cn } from "@/lib/cn";

interface ToolCallCardProps {
  tool: ChatToolCall;
  onOpenFile?: (path: string) => void;
  onResolveApproval?: (requestId: string, action: "approve" | "reject") => void;
  pendingApprovalId?: string | null;
}

export function ToolCallCard({
  onOpenFile,
  onResolveApproval,
  pendingApprovalId,
  tool,
}: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(() => tool.kind !== "bash-command");
  const Icon = useMemo(() => {
    if (tool.kind === "file-read") return Eye;
    if (tool.kind === "file-edit" || tool.kind === "file-write") return FileCode2;
    if (tool.kind === "search") return FolderSearch2;
    return TerminalSquare;
  }, [tool.kind]);
  const statusLabel = formatStatus(tool.status);
  const canOpenFile = Boolean(tool.path && onOpenFile);
  const isApprovalPending = tool.status === "pending-approval" && tool.requestId;
  const approvalBusy = Boolean(pendingApprovalId && pendingApprovalId === tool.requestId);
  const hasDiff = tool.kind === "file-edit" || tool.kind === "file-write";

  return (
    <div className="overflow-hidden rounded-[22px] border border-[#30363d] bg-[#0f141b] shadow-[0_24px_80px_rgba(0,0,0,0.2)]">
      <div className="flex items-start gap-3 border-b border-[#21262d] px-4 py-3">
        <div className="mt-0.5 rounded-xl border border-[#30363d] bg-[#111827] p-2 text-[#8b949e]">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-[#f0f6fc]">{tool.title}</p>
            <StatusBadge status={tool.status}>{statusLabel}</StatusBadge>
            {tool.provider ? (
              <span className="rounded-full border border-[#30363d] bg-[#11161d] px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-[#8b949e]">
                {tool.provider}
              </span>
            ) : null}
          </div>
          {tool.path ? (
            <button
              type="button"
              disabled={!canOpenFile}
              onClick={() => tool.path && onOpenFile?.(tool.path)}
              className={cn(
                "mt-1 text-left text-xs text-[#8b949e]",
                canOpenFile && "hover:text-[#58a6ff]",
              )}
            >
              {tool.path}
            </button>
          ) : tool.command ? (
            <p className="mt-1 break-all font-mono text-xs text-[#8b949e]">{tool.command}</p>
          ) : tool.query ? (
            <p className="mt-1 break-all font-mono text-xs text-[#8b949e]">{tool.query}</p>
          ) : tool.detail ? (
            <p className="mt-1 text-xs text-[#8b949e]">{tool.detail}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="rounded-lg border border-[#30363d] bg-[#11161d] p-1 text-[#8b949e] transition-colors hover:border-[#58a6ff] hover:text-[#e6edf3]"
          aria-label={expanded ? "Collapse tool details" : "Expand tool details"}
        >
          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
      </div>

      {expanded ? (
        <div className="space-y-3 px-4 py-4">
          {tool.kind === "file-read" && tool.content ? (
            <pre className="max-h-72 overflow-auto rounded-2xl border border-[#30363d] bg-[#0b0f14] p-4 text-[12px] leading-6 whitespace-pre-wrap text-[#c9d1d9]">
              {tool.content}
            </pre>
          ) : null}

          {tool.kind === "bash-command" ? (
            <div className="overflow-hidden rounded-2xl border border-[#30363d] bg-[#0b0f14]">
              <div className="flex items-center gap-2 border-b border-[#21262d] bg-[#11161d] px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-[#8b949e]">
                <Play className="size-3" />
                Command output
              </div>
              <pre className="max-h-72 overflow-auto p-4 text-[12px] leading-6 whitespace-pre-wrap text-[#c9d1d9]">
                {tool.output || tool.error || (tool.status === "running" ? "Running..." : "No output")}
              </pre>
            </div>
          ) : null}

          {tool.kind === "search" ? (
            <div className="rounded-2xl border border-[#30363d] bg-[#0b0f14] px-4 py-3 text-sm text-[#c9d1d9]">
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap">{tool.content || tool.error || "Waiting for results..."}</pre>
            </div>
          ) : null}

          {hasDiff ? (
            <InlineDiff oldContent={tool.oldContent ?? ""} newContent={tool.newContent ?? ""} />
          ) : null}

          {tool.error && tool.status !== "pending-approval" ? (
            <div className="rounded-2xl border border-[#5a2328] bg-[#221116] px-4 py-3 text-sm text-[#ffd8d6]">
              {tool.error}
            </div>
          ) : null}

          {isApprovalPending ? (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#2b4a63] bg-[#101c29] px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[#d7ebff]">Approval required</p>
                <p className="mt-1 text-xs text-[#8fbde6]">
                  Review the proposed change and choose whether to apply it.
                </p>
              </div>
              <button
                type="button"
                disabled={approvalBusy}
                onClick={() => tool.requestId && onResolveApproval?.(tool.requestId, "approve")}
                className="rounded-lg border border-[#2f6f4f] bg-[#10261c] px-3 py-2 text-xs font-medium text-[#3fb950] transition-colors hover:border-[#3fb950] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Approve
              </button>
              <button
                type="button"
                disabled={approvalBusy}
                onClick={() => tool.requestId && onResolveApproval?.(tool.requestId, "reject")}
                className="rounded-lg border border-[#6f2f35] bg-[#221116] px-3 py-2 text-xs font-medium text-[#f85149] transition-colors hover:border-[#f85149] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Reject
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function StatusBadge({
  children,
  status,
}: {
  children: ReactNode;
  status: ChatToolCall["status"];
}) {
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]",
        status === "completed" && "border-[#2f6f4f] bg-[#10261c] text-[#3fb950]",
        status === "approved" && "border-[#2f6f4f] bg-[#10261c] text-[#3fb950]",
        status === "rejected" && "border-[#6f2f35] bg-[#221116] text-[#f85149]",
        status === "failed" && "border-[#6f2f35] bg-[#221116] text-[#f85149]",
        status === "pending-approval" && "border-[#2b4a63] bg-[#101c29] text-[#8fbde6]",
        status === "running" && "border-[#2b3a4b] bg-[#121b24] text-[#7cc2ff]",
      )}
    >
      {children}
    </span>
  );
}

function formatStatus(status: ChatToolCall["status"]) {
  switch (status) {
    case "pending-approval":
      return "awaiting approval";
    default:
      return status;
  }
}
