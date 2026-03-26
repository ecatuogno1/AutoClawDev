import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type SetStateAction,
} from "react";
import { GitBranch, Plus, TerminalSquare, X } from "lucide-react";
import { GitPanel } from "./GitPanel";
import {
  WorkspaceTerminal,
  type WorkspaceTerminalConnectionState,
} from "./Terminal";
import { cn } from "@/lib/cn";

const BOTTOM_PANEL_HEIGHT_KEY = "autoclaw.workspace.bottomPanelHeight";
const DEFAULT_PANEL_HEIGHT = 260;
const MIN_PANEL_HEIGHT = 220;
const MAX_PANEL_HEIGHT_RATIO = 0.7;

export type WorkspaceBottomTab = "terminal" | "git";

interface WorkspaceBottomPanelProps {
  activeTab: WorkspaceBottomTab | null;
  onActiveTabChange: (tab: WorkspaceBottomTab | null) => void;
  projectKey: string;
  projectPath: string;
  changedFilesCount: number;
}

interface TerminalTab {
  id: string;
  title: string;
  closing: boolean;
}

interface TerminalRuntimeState {
  state: WorkspaceTerminalConnectionState;
  exitCode: number | null;
  signal: string | null;
}

export function WorkspaceBottomPanel({
  activeTab,
  onActiveTabChange,
  projectKey,
  projectPath,
  changedFilesCount,
}: WorkspaceBottomPanelProps) {
  const initialStateRef = useRef<{
    tabs: TerminalTab[];
    activeTerminalId: string;
  } | null>(null);
  const nextTerminalNumberRef = useRef(2);
  if (!initialStateRef.current) {
    const initialTab = createTerminalTab(1);
    initialStateRef.current = {
      tabs: [initialTab],
      activeTerminalId: initialTab.id,
    };
  }

  const [height, setHeight] = useState(() => readBottomPanelHeight());
  const [terminalTabs, setTerminalTabs] = useState<TerminalTab[]>(
    () => initialStateRef.current?.tabs ?? [],
  );
  const [activeTerminalId, setActiveTerminalId] = useState<string>(
    () => initialStateRef.current?.activeTerminalId ?? "",
  );
  const [runtimeStates, setRuntimeStates] = useState<
    Record<string, TerminalRuntimeState | undefined>
  >({});

  useEffect(() => {
    window.localStorage.setItem(BOTTOM_PANEL_HEIGHT_KEY, String(height));
  }, [height]);

  useEffect(() => {
    if (activeTab !== "terminal" || terminalTabs.length > 0) {
      return;
    }
    const nextTab = createTerminalTab(nextTerminalNumberRef.current++);
    setTerminalTabs([nextTab]);
    setActiveTerminalId(nextTab.id);
  }, [activeTab, terminalTabs.length]);

  const activeTerminal =
    terminalTabs.find((tab) => tab.id === activeTerminalId) ?? terminalTabs[0] ?? null;

  if (!activeTab) {
    return null;
  }

  return (
    <div
      className="flex shrink-0 flex-col border-t border-[#30363d] bg-[#010409]"
      style={{ height: `${height}px` }}
    >
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize workspace bottom panel"
        className="group relative h-1 shrink-0 cursor-row-resize bg-[#0d1117]"
        onMouseDown={startBottomPanelResize(height, setHeight)}
      >
        <div className="absolute inset-x-0 top-[-3px] bottom-[-3px] group-hover:bg-[#58a6ff20]" />
      </div>

      <div className="flex items-center justify-between border-b border-[#30363d] bg-[#010409]/95 pl-2">
        <div className="flex min-w-0 items-center overflow-x-auto">
          <BottomTabButton
            active={activeTab === "git"}
            onClick={() => onActiveTabChange("git")}
            icon={<GitBranch className="size-4" />}
            label="Source Control"
            badge={changedFilesCount}
          />
          <BottomTabButton
            active={activeTab === "terminal"}
            onClick={() => onActiveTabChange("terminal")}
            icon={<TerminalSquare className="size-4" />}
            label="Terminal"
          />

          {activeTab === "terminal" ? (
            <>
              <div className="mx-1 h-5 w-px shrink-0 bg-[#30363d]" />
              {terminalTabs.map((tab) => {
                const runtimeState = runtimeStates[tab.id];
                const active = tab.id === activeTerminal?.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTerminalId(tab.id)}
                    className={cn(
                      "group flex shrink-0 items-center gap-2 border-r border-[#30363d] px-3 py-2 text-xs transition-colors",
                      active
                        ? "bg-[#161b22] text-[#e6edf3]"
                        : "text-[#8b949e] hover:bg-[#161b22]/75 hover:text-[#c9d1d9]",
                    )}
                  >
                    <span
                      className={cn(
                        "size-2 rounded-full",
                        runtimeDotClass(runtimeState?.state ?? "connecting"),
                      )}
                    />
                    <span>{tab.title}</span>
                    <span className="text-[#6e7681]">{runtimeStateLabel(runtimeState)}</span>
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`Close ${tab.title}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        requestCloseTerminalTab(tab.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          requestCloseTerminalTab(tab.id);
                        }
                      }}
                      className="rounded p-0.5 text-[#6e7681] transition-colors hover:bg-[#30363d] hover:text-[#e6edf3]"
                    >
                      <X className="size-3.5" />
                    </span>
                  </button>
                );
              })}
            </>
          ) : null}
        </div>

        <div className="flex items-center gap-1 px-2 py-1">
          {activeTab === "terminal" ? (
            <button
              type="button"
              onClick={() => {
                const nextTab = createTerminalTab(nextTerminalNumberRef.current++);
                setTerminalTabs((current) => [...current, nextTab]);
                setActiveTerminalId(nextTab.id);
              }}
              className="rounded-md border border-[#30363d] p-1.5 text-[#8b949e] transition-colors hover:border-[#58a6ff] hover:text-[#e6edf3]"
              aria-label="New terminal"
              title="New terminal"
            >
              <Plus className="size-4" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onActiveTabChange(null)}
            className="rounded-md border border-[#30363d] p-1.5 text-[#8b949e] transition-colors hover:border-[#58a6ff] hover:text-[#e6edf3]"
            aria-label="Hide bottom panel"
            title="Hide bottom panel"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div className={cn("h-full", activeTab === "git" ? "block" : "hidden")}>
          <GitPanel projectKey={projectKey} />
        </div>

        <div className={cn("h-full", activeTab === "terminal" ? "block" : "hidden")}>
          {terminalTabs.length === 0 ? (
            <div className="flex h-full items-center justify-center px-6 text-sm text-[#8b949e]">
              Create a terminal to run commands in {projectPath}.
            </div>
          ) : (
            terminalTabs.map((tab) => (
              <WorkspaceTerminal
                key={tab.id}
                sessionId={tab.id}
                projectKey={projectKey}
                cwd={projectPath}
                active={activeTab === "terminal" && tab.id === activeTerminal?.id}
                closing={tab.closing}
                onClosed={() => {
                  let nextActiveId: string | null = null;
                  setTerminalTabs((current) => {
                    const index = current.findIndex((entry) => entry.id === tab.id);
                    const remaining = current.filter((entry) => entry.id !== tab.id);
                    nextActiveId =
                      remaining[index]?.id ??
                      remaining[index - 1]?.id ??
                      remaining[0]?.id ??
                      null;
                    return remaining;
                  });
                  setRuntimeStates((current) => {
                    const next = { ...current };
                    delete next[tab.id];
                    return next;
                  });
                  setActiveTerminalId((current) =>
                    current === tab.id ? nextActiveId ?? "" : current,
                  );
                  if (!nextActiveId && activeTab === "terminal") {
                    onActiveTabChange(null);
                  }
                }}
                onStateChange={(state, meta) => {
                  setRuntimeStates((current) => ({
                    ...current,
                    [tab.id]: {
                      state,
                      exitCode: meta?.exitCode ?? null,
                      signal: meta?.signal ?? null,
                    },
                  }));
                }}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );

  function requestCloseTerminalTab(id: string) {
    setTerminalTabs((current) =>
      current.map((tab) =>
        tab.id === id
          ? {
              ...tab,
              closing: true,
            }
          : tab,
      ),
    );
  }
}

function BottomTabButton({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition-colors",
        active
          ? "bg-[#161b22] text-[#e6edf3]"
          : "text-[#8b949e] hover:bg-[#161b22]/75 hover:text-[#c9d1d9]",
      )}
    >
      {icon}
      <span>{label}</span>
      {typeof badge === "number" && badge > 0 ? (
        <span className="rounded-full bg-[#1f6feb] px-1.5 py-0.5 text-[10px] font-semibold text-white">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function createTerminalTab(number: number): TerminalTab {
  return {
    id: createSessionId(),
    title: `Terminal ${number}`,
    closing: false,
  };
}

function createSessionId() {
  if ("randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `terminal-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function readBottomPanelHeight() {
  if (typeof window === "undefined") {
    return DEFAULT_PANEL_HEIGHT;
  }

  const stored = Number(window.localStorage.getItem(BOTTOM_PANEL_HEIGHT_KEY));
  if (Number.isFinite(stored)) {
    return clampBottomPanelHeight(stored);
  }

  return DEFAULT_PANEL_HEIGHT;
}

function startBottomPanelResize(
  panelHeight: number,
  setPanelHeight: Dispatch<SetStateAction<number>>,
) {
  return (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = panelHeight;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const nextHeight = clampBottomPanelHeight(startHeight - (moveEvent.clientY - startY));
      setPanelHeight(nextHeight);
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    };

    document.body.style.setProperty("cursor", "row-resize");
    document.body.style.setProperty("user-select", "none");
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };
}

function clampBottomPanelHeight(height: number) {
  if (typeof window === "undefined") {
    return Math.max(height, MIN_PANEL_HEIGHT);
  }

  const maxHeight = Math.floor(window.innerHeight * MAX_PANEL_HEIGHT_RATIO);
  return Math.min(Math.max(height, MIN_PANEL_HEIGHT), maxHeight);
}

function runtimeDotClass(state: WorkspaceTerminalConnectionState) {
  switch (state) {
    case "connected":
      return "bg-[#3fb950]";
    case "reconnecting":
      return "bg-[#d29922]";
    case "disconnected":
      return "bg-[#6e7681]";
    case "exited":
      return "bg-[#f85149]";
    case "connecting":
    default:
      return "bg-[#58a6ff]";
  }
}

function runtimeStateLabel(runtimeState: TerminalRuntimeState | undefined) {
  if (!runtimeState) {
    return "Starting";
  }

  if (runtimeState.state === "connected") {
    return "Live";
  }

  if (runtimeState.state === "connecting") {
    return "Connecting";
  }

  if (runtimeState.state === "reconnecting") {
    return "Reconnecting";
  }

  if (runtimeState.state === "disconnected") {
    return "Offline";
  }

  if (runtimeState.exitCode !== null) {
    return `Exit ${runtimeState.exitCode}`;
  }

  if (runtimeState.signal) {
    return runtimeState.signal;
  }

  return "Closed";
}
