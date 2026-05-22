import {
  BrainCircuit,
  FileCode2,
  GitBranch,
  Home,
  MessageSquareText,
  SearchCode,
  SquareCheckBig,
  TerminalSquare,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import type { ComposerPane } from "@autoclawdev/types";
import { cn } from "@/lib/cn";

interface PaneStripProps {
  activePaneId: string | null;
  panes: ComposerPane[];
  paneOrder: string[];
  startAccessory?: ReactNode;
  endAccessory?: ReactNode;
  onActivatePane: (paneId: string) => void;
  onClosePane: (paneId: string) => void;
}

export function PaneStrip({
  activePaneId,
  panes,
  paneOrder,
  startAccessory,
  endAccessory,
  onActivatePane,
  onClosePane,
}: PaneStripProps) {
  const panesById = new Map(panes.map((pane) => [pane.id, pane]));
  const orderedPanes = paneOrder
    .map((paneId) => panesById.get(paneId))
    .filter((pane): pane is ComposerPane => Boolean(pane));

  return (
    <div className="border-b border-[#30363d] bg-[#010409]/90">
      <div className="flex min-w-0 items-stretch">
        {startAccessory ? (
          <div className="flex shrink-0 items-center border-r border-[#30363d] px-3">
            {startAccessory}
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 items-center overflow-x-auto">
          {orderedPanes.map((pane) => {
            const active = pane.id === activePaneId;
            const Icon = iconForPane(pane.kind);
            const closable =
              pane.kind !== "home" &&
              pane.kind !== "reviews" &&
              pane.kind !== "memory" &&
              pane.kind !== "composer";

            return (
              <div
                key={pane.id}
                className={cn(
                  "group flex shrink-0 items-center border-r border-[#30363d] text-sm transition-colors",
                  active
                    ? "bg-[#161b22] text-[#e6edf3]"
                    : "bg-[#010409]/80 text-[#8b949e] hover:bg-[#161b22] hover:text-[#c9d1d9]",
                )}
              >
                <button
                  type="button"
                  onClick={() => onActivatePane(pane.id)}
                  className="flex min-w-0 items-center gap-2 px-3 py-2"
                  title={pane.title}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="max-w-48 truncate">{pane.title}</span>
                </button>
                {closable ? (
                  <button
                    type="button"
                    aria-label={`Close ${pane.title}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onClosePane(pane.id);
                    }}
                    className="mr-2 rounded p-0.5 text-[#6e7681] transition-colors group-hover:text-[#8b949e] hover:bg-[#30363d] hover:text-[#e6edf3]"
                  >
                    <X className="size-3.5" />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>

        {endAccessory ? (
          <div className="flex shrink-0 items-center border-l border-[#30363d] px-2">
            {endAccessory}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function iconForPane(kind: ComposerPane["kind"]) {
  switch (kind) {
    case "home":
      return Home;
    case "reviews":
      return SearchCode;
    case "memory":
      return BrainCircuit;
    case "task":
      return SquareCheckBig;
    case "file":
      return FileCode2;
    case "git":
      return GitBranch;
    case "terminal":
      return TerminalSquare;
    case "composer":
    default:
      return MessageSquareText;
  }
}
