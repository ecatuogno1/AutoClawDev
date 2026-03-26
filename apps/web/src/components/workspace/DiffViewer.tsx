import { ChevronDown, ChevronRight, FileDiff, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { WorkspaceGitFileStatus } from "@/types";
import { cn } from "@/lib/cn";

interface DiffViewerProps {
  path: string | null;
  diff: string;
  file?: WorkspaceGitFileStatus | null;
  isLoading?: boolean;
  error?: string | null;
}

interface ParsedDiff {
  headerLines: string[];
  hunks: Array<{
    id: string;
    header: string;
    lines: string[];
  }>;
}

export function DiffViewer({
  path,
  diff,
  file = null,
  isLoading = false,
  error = null,
}: DiffViewerProps) {
  const parsed = useMemo(() => parseUnifiedDiff(diff), [diff]);
  const [collapsedHunks, setCollapsedHunks] = useState<Set<string>>(new Set());

  useEffect(() => {
    setCollapsedHunks(new Set());
  }, [diff, path]);

  if (!path) {
    return (
      <EmptyDiffState
        title="Select a changed file"
        description="Choose a file from the source control list to inspect its patch."
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-[#8b949e]">
        <LoaderCircle className="size-4 animate-spin" />
        <span>Loading diff…</span>
      </div>
    );
  }

  if (error) {
    return <EmptyDiffState title="Unable to load diff" description={error} tone="error" />;
  }

  if (!diff.trim()) {
    return (
      <EmptyDiffState
        title="No diff available"
        description="This file has no textual diff to render yet."
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-[#30363d] bg-[#0b0f14]">
      <div className="border-b border-[#30363d] bg-[#11161d] px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#e6edf3]">
          <FileDiff className="size-4 text-[#58a6ff]" />
          <span className="truncate">{path}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#8b949e]">
          <DiffBadge>{file?.label ?? "Changed"}</DiffBadge>
          {file?.staged ? <DiffBadge tone="success">Staged</DiffBadge> : null}
          {file?.unstaged && !file?.untracked ? <DiffBadge tone="warning">Unstaged</DiffBadge> : null}
          {file?.untracked ? <DiffBadge tone="warning">Untracked</DiffBadge> : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {parsed.headerLines.length > 0 ? (
          <div className="border-b border-[#21262d] px-0 py-0">
            {parsed.headerLines.map((line, index) => (
              <DiffLine key={`header:${index}`} line={line} />
            ))}
          </div>
        ) : null}

        <div className="divide-y divide-[#21262d]">
          {parsed.hunks.map((hunk) => {
            const collapsed = collapsedHunks.has(hunk.id);
            return (
              <section key={hunk.id}>
                <button
                  type="button"
                  onClick={() =>
                    setCollapsedHunks((current) => {
                      const next = new Set(current);
                      if (next.has(hunk.id)) {
                        next.delete(hunk.id);
                      } else {
                        next.add(hunk.id);
                      }
                      return next;
                    })
                  }
                  className="flex w-full items-center gap-2 border-b border-[#161b22] bg-[#11161d] px-3 py-2 text-left font-mono text-xs text-[#d29922] transition-colors hover:bg-[#151b23]"
                >
                  {collapsed ? (
                    <ChevronRight className="size-3.5 shrink-0 text-[#8b949e]" />
                  ) : (
                    <ChevronDown className="size-3.5 shrink-0 text-[#8b949e]" />
                  )}
                  <span className="truncate">{hunk.header}</span>
                  <span className="ml-auto text-[11px] text-[#6e7681]">
                    {collapsed ? "Collapsed" : `${hunk.lines.length} lines`}
                  </span>
                </button>
                {!collapsed ? (
                  <div>
                    {hunk.lines.map((line, index) => (
                      <DiffLine key={`${hunk.id}:${index}`} line={line} />
                    ))}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DiffBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        tone === "neutral" && "border-[#30363d] bg-[#161b22] text-[#c9d1d9]",
        tone === "success" && "border-[#1f6feb55] bg-[#0f2418] text-[#7ee787]",
        tone === "warning" && "border-[#d2992255] bg-[#1b1408] text-[#f2cc60]",
      )}
    >
      {children}
    </span>
  );
}

function DiffLine({ line }: { line: string }) {
  const tone = classifyDiffLine(line);
  const prefix = tone === "context" && line.startsWith(" ") ? " " : line[0] ?? " ";
  const content = line.length > 0 ? line.slice(1) : "";

  return (
    <div
      className={cn(
        "grid grid-cols-[1.75rem_minmax(0,1fr)] border-b border-[#161b22] font-mono text-[12px]",
        tone === "meta" && "bg-[#101720] text-[#79c0ff]",
        tone === "hunk" && "bg-[#16141f] text-[#d2a8ff]",
        tone === "add" && "bg-[#0f2418] text-[#c8facc]",
        tone === "remove" && "bg-[#281419] text-[#ffd8d6]",
        tone === "context" && "bg-transparent text-[#c9d1d9]",
      )}
    >
      <div
        className={cn(
          "border-r border-[#161b22] px-2 py-1 text-center",
          tone === "add" && "text-[#7ee787]",
          tone === "remove" && "text-[#ff7b72]",
          tone === "meta" && "text-[#79c0ff]",
          tone === "hunk" && "text-[#d2a8ff]",
          tone === "context" && "text-[#6e7681]",
        )}
      >
        {prefix}
      </div>
      <pre className="overflow-x-auto px-3 py-1 whitespace-pre">{content}</pre>
    </div>
  );
}

function EmptyDiffState({
  title,
  description,
  tone = "muted",
}: {
  title: string;
  description: string;
  tone?: "muted" | "error";
}) {
  return (
    <div className="flex h-full min-h-[220px] items-center justify-center px-6">
      <div className="max-w-md text-center">
        <p
          className={cn(
            "text-sm font-semibold",
            tone === "error" ? "text-[#f85149]" : "text-[#e6edf3]",
          )}
        >
          {title}
        </p>
        <p className="mt-2 text-sm text-[#8b949e]">{description}</p>
      </div>
    </div>
  );
}

function classifyDiffLine(line: string) {
  if (
    line.startsWith("diff --git") ||
    line.startsWith("index ") ||
    line.startsWith("--- ") ||
    line.startsWith("+++ ")
  ) {
    return "meta" as const;
  }

  if (line.startsWith("@@")) {
    return "hunk" as const;
  }

  if (line.startsWith("+")) {
    return "add" as const;
  }

  if (line.startsWith("-")) {
    return "remove" as const;
  }

  return "context" as const;
}

function parseUnifiedDiff(diff: string): ParsedDiff {
  const lines = diff.split(/\r?\n/);
  const headerLines: string[] = [];
  const hunks: ParsedDiff["hunks"] = [];
  let currentHunk: ParsedDiff["hunks"][number] | null = null;

  for (const line of lines) {
    if (line.startsWith("@@")) {
      if (currentHunk) {
        hunks.push(currentHunk);
      }
      currentHunk = {
        id: `${hunks.length}:${line}`,
        header: line,
        lines: [],
      };
      continue;
    }

    if (currentHunk) {
      currentHunk.lines.push(line);
      continue;
    }

    if (line.length > 0) {
      headerLines.push(line);
    }
  }

  if (currentHunk) {
    hunks.push(currentHunk);
  }

  if (hunks.length === 0 && headerLines.length > 0) {
    hunks.push({
      id: "raw:0",
      header: "Patch",
      lines: headerLines.splice(0),
    });
  }

  return { headerLines, hunks };
}
