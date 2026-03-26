import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type SetStateAction,
} from "react";
import { Plus, TerminalSquare, X } from "lucide-react";
import {
  WorkspaceTerminal,
  type WorkspaceTerminalConnectionState,
} from "./Terminal";
import { cn } from "@/lib/cn";

const TERMINAL_HEIGHT_KEY = "autoclaw.workspace.terminalHeight";
const DEFAULT_TERMINAL_HEIGHT = 240;
const MIN_TERMINAL_HEIGHT = 180;
const MAX_TERMINAL_HEIGHT_RATIO = 0.65;

interface TerminalPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectKey: string;
  projectPath: string;
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

export function TerminalPanel(props: TerminalPanelProps) {
  const initialStateRef = useRef<{
    tabs: TerminalTab[];
    activeTabId: string;
  } | null>(null);
  const nextTerminalNumberRef = useRef(2);
  if (!initialStateRef.current) {
    const initialTab = createTerminalTab(1);
    initialStateRef.current = {
      tabs: [initialTab],
      activeTabId: initialTab.id,
    };
  }

  const [height, setHeight] = useState(() => readTerminalHeight());
  const [tabs, setTabs] = useState<TerminalTab[]>(() => initialStateRef.current?.tabs ?? []);
  const [activeTabId, setActiveTabId] = useState<string>(
    () => initialStateRef.current?.activeTabId ?? "",
  );
  const [runtimeStates, setRuntimeStates] = useState<
    Record<string, TerminalRuntimeState | undefined>
  >({});

  useEffect(() => {
    window.localStorage.setItem(TERMINAL_HEIGHT_KEY, String(height));
  }, [height]);

  useEffect(() => {
    if (!props.open || tabs.length > 0) {
      return;
    }
    const nextTab = createTerminalTab(nextTerminalNumberRef.current++);
    setTabs([nextTab]);
    setActiveTabId(nextTab.id);
  }, [props.open, tabs.length]);

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0] ?? null;

  if (!props.open) {
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
        aria-label="Resize terminal panel"
        className="group relative h-1 shrink-0 cursor-row-resize bg-[#0d1117]"
        onMouseDown={startTerminalResize(height, setHeight)}
      >
        <div className="absolute inset-x-0 top-[-3px] bottom-[-3px] group-hover:bg-[#58a6ff20]" />
      </div>

      <div className="flex items-center justify-between border-b border-[#30363d] bg-[#010409]/95 pl-2">
        <div className="flex min-w-0 items-center overflow-x-auto">
          {tabs.map((tab) => {
            const runtimeState = runtimeStates[tab.id];
            const active = tab.id === activeTab?.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTabId(tab.id)}
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
                    requestCloseTab(tab.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      requestCloseTab(tab.id);
                    }
                  }}
                  className="rounded p-0.5 text-[#6e7681] transition-colors hover:bg-[#30363d] hover:text-[#e6edf3]"
                >
                  <X className="size-3.5" />
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1 px-2 py-1">
          <button
            type="button"
            onClick={() => {
              const nextTab = createTerminalTab(nextTerminalNumberRef.current++);
              setTabs((current) => [...current, nextTab]);
              setActiveTabId(nextTab.id);
            }}
            className="rounded-md border border-[#30363d] p-1.5 text-[#8b949e] transition-colors hover:border-[#58a6ff] hover:text-[#e6edf3]"
            aria-label="New terminal"
            title="New terminal"
          >
            <Plus className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => props.onOpenChange(false)}
            className="rounded-md border border-[#30363d] p-1.5 text-[#8b949e] transition-colors hover:border-[#58a6ff] hover:text-[#e6edf3]"
            aria-label="Hide terminal panel"
            title="Hide terminal panel"
          >
            <TerminalSquare className="size-4" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {tabs.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-sm text-[#8b949e]">
            Create a terminal to run commands in {props.projectPath}.
          </div>
        ) : (
          tabs.map((tab) => (
            <WorkspaceTerminal
              key={tab.id}
              sessionId={tab.id}
              projectKey={props.projectKey}
              cwd={props.projectPath}
              active={tab.id === activeTab?.id}
              closing={tab.closing}
              onClosed={() => {
                let nextActiveId: string | null = null;
                setTabs((current) => {
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
                setActiveTabId((current) =>
                  current === tab.id ? nextActiveId ?? "" : current,
                );
                if (!nextActiveId) {
                  props.onOpenChange(false);
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
  );

  function requestCloseTab(id: string) {
    setTabs((current) =>
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

function readTerminalHeight() {
  if (typeof window === "undefined") {
    return DEFAULT_TERMINAL_HEIGHT;
  }

  const stored = Number(window.localStorage.getItem(TERMINAL_HEIGHT_KEY));
  if (!Number.isFinite(stored)) {
    return DEFAULT_TERMINAL_HEIGHT;
  }
  return clampTerminalHeight(stored);
}

function clampTerminalHeight(height: number) {
  if (typeof window === "undefined") {
    return Math.max(MIN_TERMINAL_HEIGHT, Math.round(height));
  }
  const maxHeight = Math.max(
    MIN_TERMINAL_HEIGHT,
    Math.floor(window.innerHeight * MAX_TERMINAL_HEIGHT_RATIO),
  );
  return Math.min(Math.max(Math.round(height), MIN_TERMINAL_HEIGHT), maxHeight);
}

function startTerminalResize(
  height: number,
  setHeight: Dispatch<SetStateAction<number>>,
) {
  return (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = height;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const nextHeight = clampTerminalHeight(startHeight + startY - moveEvent.clientY);
      setHeight(nextHeight);
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

function runtimeDotClass(state: WorkspaceTerminalConnectionState) {
  switch (state) {
    case "connected":
      return "bg-[#3fb950]";
    case "reconnecting":
      return "bg-[#d29922]";
    case "exited":
      return "bg-[#f85149]";
    case "disconnected":
      return "bg-[#6e7681]";
    case "connecting":
    default:
      return "bg-[#58a6ff]";
  }
}

function runtimeStateLabel(runtimeState?: TerminalRuntimeState) {
  if (!runtimeState) {
    return "Starting";
  }

  if (runtimeState.state === "exited") {
    if (runtimeState.signal) {
      return runtimeState.signal;
    }
    if (runtimeState.exitCode !== null) {
      return `exit ${runtimeState.exitCode}`;
    }
  }

  switch (runtimeState.state) {
    case "connected":
      return "Live";
    case "reconnecting":
      return "Reconnecting";
    case "disconnected":
      return "Offline";
    case "exited":
      return "Exited";
    case "connecting":
    default:
      return "Starting";
  }
}
