import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useProjects } from "@/lib/api";
import type { ProjectWithStats } from "@/types";
import { WorkspacePanel } from "@/components/workspace/WorkspacePanel";
import { WorkspaceSidebar } from "@/components/workspace/WorkspaceSidebar";
import { WorkspaceTopBar } from "@/components/workspace/WorkspaceTopBar";

const SIDEBAR_DEFAULT_WIDTH = 280;
const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 420;
const BOTTOM_PANEL_DEFAULT_HEIGHT = 220;
const BOTTOM_PANEL_MIN_HEIGHT = 160;
const BOTTOM_PANEL_MAX_RATIO = 0.45;
const NARROW_VIEWPORT_QUERY = "(max-width: 1023px)";
const STORAGE_KEYS = {
  provider: "autoclaw.workspace.provider",
  project: "autoclaw.workspace.project",
  sidebarWidth: "autoclaw.workspace.sidebarWidth",
  sidebarCollapsed: "autoclaw.workspace.sidebarCollapsed",
  bottomHeight: "autoclaw.workspace.bottomHeight",
  bottomCollapsed: "autoclaw.workspace.bottomCollapsed",
} as const;

type ProviderMode = "claude" | "codex";

interface WorkspaceLayoutContextValue {
  provider: ProviderMode;
  selectedProject: ProjectWithStats | null;
}

const WorkspaceLayoutContext = createContext<WorkspaceLayoutContextValue | null>(null);

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function readNumberPreference(key: string, fallback: number) {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  const parsed = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBooleanPreference(key: string, fallback: boolean) {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === "true";
}

function readStringPreference(key: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  return window.localStorage.getItem(key) ?? fallback;
}

function getBottomPanelMaxHeight(containerHeight: number) {
  return Math.max(BOTTOM_PANEL_MIN_HEIGHT, Math.floor(containerHeight * BOTTOM_PANEL_MAX_RATIO));
}

export function useWorkspaceLayoutContext() {
  const context = useContext(WorkspaceLayoutContext);
  if (!context) {
    throw new Error("useWorkspaceLayoutContext must be used within WorkspaceLayout");
  }
  return context;
}

export function WorkspaceLayout({ children }: { children: ReactNode }) {
  const { data: projects, isLoading } = useProjects();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [provider, setProvider] = useState<ProviderMode>(() => {
    const saved = readStringPreference(STORAGE_KEYS.provider, "codex");
    return saved === "claude" ? "claude" : "codex";
  });
  const [selectedProjectKey, setSelectedProjectKey] = useState(() =>
    readStringPreference(STORAGE_KEYS.project, ""),
  );
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    clamp(
      readNumberPreference(STORAGE_KEYS.sidebarWidth, SIDEBAR_DEFAULT_WIDTH),
      SIDEBAR_MIN_WIDTH,
      SIDEBAR_MAX_WIDTH,
    ),
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    readBooleanPreference(STORAGE_KEYS.sidebarCollapsed, false),
  );
  const [bottomPanelHeight, setBottomPanelHeight] = useState(() =>
    Math.max(
      BOTTOM_PANEL_MIN_HEIGHT,
      readNumberPreference(STORAGE_KEYS.bottomHeight, BOTTOM_PANEL_DEFAULT_HEIGHT),
    ),
  );
  const [bottomPanelCollapsed, setBottomPanelCollapsed] = useState(() =>
    readBooleanPreference(STORAGE_KEYS.bottomCollapsed, false),
  );
  const [isNarrowViewport, setIsNarrowViewport] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(NARROW_VIEWPORT_QUERY).matches : false,
  );
  const [sidebarOpenOnNarrow, setSidebarOpenOnNarrow] = useState(false);

  const selectedProject = useMemo(
    () => projects?.find((project) => project.key === selectedProjectKey) ?? projects?.[0] ?? null,
    [projects, selectedProjectKey],
  );
  const effectiveSidebarCollapsed = isNarrowViewport ? !sidebarOpenOnNarrow : sidebarCollapsed;
  const layoutContextValue = useMemo(
    () => ({ provider, selectedProject }),
    [provider, selectedProject],
  );

  useEffect(() => {
    if (!projects?.length) return;
    if (selectedProjectKey && projects.some((project) => project.key === selectedProjectKey)) {
      return;
    }
    setSelectedProjectKey(projects[0].key);
  }, [projects, selectedProjectKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEYS.provider, provider);
  }, [provider]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (selectedProjectKey) {
      window.localStorage.setItem(STORAGE_KEYS.project, selectedProjectKey);
    }
  }, [selectedProjectKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEYS.sidebarWidth, String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEYS.sidebarCollapsed, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEYS.bottomHeight, String(bottomPanelHeight));
  }, [bottomPanelHeight]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEYS.bottomCollapsed, String(bottomPanelCollapsed));
  }, [bottomPanelCollapsed]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia(NARROW_VIEWPORT_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      setIsNarrowViewport(event.matches);
    };
    setIsNarrowViewport(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!isNarrowViewport) {
      setSidebarOpenOnNarrow(false);
    }
  }, [isNarrowViewport]);

  useEffect(() => {
    if (!contentRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      const nextHeight = entries[0]?.contentRect.height ?? 0;
      const maxHeight = getBottomPanelMaxHeight(nextHeight);
      setBottomPanelHeight((currentHeight) => clamp(currentHeight, BOTTOM_PANEL_MIN_HEIGHT, maxHeight));
    });
    resizeObserver.observe(contentRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  const handleProjectChange = useCallback((projectKey: string) => {
    setSelectedProjectKey(projectKey);
  }, []);

  const toggleSidebar = useCallback(() => {
    if (isNarrowViewport) {
      setSidebarOpenOnNarrow((current) => !current);
      return;
    }
    setSidebarCollapsed((current) => !current);
  }, [isNarrowViewport]);

  const resetSidebarWidth = useCallback(() => {
    setSidebarWidth(SIDEBAR_DEFAULT_WIDTH);
  }, []);

  const resetBottomPanelHeight = useCallback(() => {
    const containerHeight = contentRef.current?.getBoundingClientRect().height ?? BOTTOM_PANEL_DEFAULT_HEIGHT * 2;
    setBottomPanelHeight(
      clamp(
        BOTTOM_PANEL_DEFAULT_HEIGHT,
        BOTTOM_PANEL_MIN_HEIGHT,
        getBottomPanelMaxHeight(containerHeight),
      ),
    );
  }, []);

  const startSidebarResize = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (isNarrowViewport || effectiveSidebarCollapsed) return;

    const startX = event.clientX;
    const startWidth = sidebarWidth;
    const pointerId = event.pointerId;
    event.currentTarget.setPointerCapture(pointerId);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    const onPointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = clamp(
        startWidth + (moveEvent.clientX - startX),
        SIDEBAR_MIN_WIDTH,
        SIDEBAR_MAX_WIDTH,
      );
      setSidebarWidth(nextWidth);
    };

    const stopResize = () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopResize);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopResize, { once: true });
  }, [effectiveSidebarCollapsed, isNarrowViewport, sidebarWidth]);

  const startBottomPanelResize = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (bottomPanelCollapsed || !contentRef.current) return;

    const containerRect = contentRef.current.getBoundingClientRect();
    const maxHeight = getBottomPanelMaxHeight(containerRect.height);
    const pointerId = event.pointerId;
    event.currentTarget.setPointerCapture(pointerId);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "row-resize";

    const onPointerMove = (moveEvent: PointerEvent) => {
      const nextHeight = clamp(
        containerRect.bottom - moveEvent.clientY,
        BOTTOM_PANEL_MIN_HEIGHT,
        maxHeight,
      );
      setBottomPanelHeight(nextHeight);
    };

    const stopResize = () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopResize);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopResize, { once: true });
  }, [bottomPanelCollapsed]);

  return (
    <WorkspaceLayoutContext.Provider value={layoutContextValue}>
      <div className="relative flex h-full min-h-0 overflow-hidden bg-[#0b1220] text-[#e6edf3]">
        {isNarrowViewport && !effectiveSidebarCollapsed && (
          <button
            type="button"
            aria-label="Close workspace sidebar overlay"
            className="absolute inset-0 z-20 bg-[#020617]/55 backdrop-blur-[1px]"
            onClick={() => setSidebarOpenOnNarrow(false)}
          />
        )}

        <aside
          className={`z-30 flex h-full min-h-0 shrink-0 flex-col border-r border-[#263247] bg-[#0a101d] ${
            isNarrowViewport
              ? "absolute left-0 top-0 shadow-[0_18px_80px_rgba(2,6,23,0.55)]"
              : "relative"
          } ${effectiveSidebarCollapsed ? "pointer-events-none opacity-0" : "opacity-100"}`}
          style={{
            width: effectiveSidebarCollapsed ? 0 : sidebarWidth,
            transform:
              isNarrowViewport && effectiveSidebarCollapsed ? "translateX(-100%)" : "translateX(0)",
            transition: "width 180ms ease, transform 180ms ease, opacity 180ms ease",
          }}
        >
          <WorkspaceSidebar
            projects={projects ?? []}
            selectedProjectKey={selectedProject?.key ?? ""}
            onProjectChange={handleProjectChange}
            onCollapse={toggleSidebar}
            isLoading={isLoading}
          />
        </aside>

        {!effectiveSidebarCollapsed && !isNarrowViewport && (
          <button
            type="button"
            aria-label="Resize workspace sidebar"
            className="relative z-10 w-1.5 shrink-0 cursor-col-resize bg-[#101827] transition-colors hover:bg-[#1d4ed8]"
            onDoubleClick={resetSidebarWidth}
            onPointerDown={startSidebarResize}
          >
            <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[#334155]" />
          </button>
        )}

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <WorkspaceTopBar
            project={selectedProject}
            provider={provider}
            onProviderChange={setProvider}
            onToggleSidebar={toggleSidebar}
            isSidebarCollapsed={effectiveSidebarCollapsed}
            isNarrowViewport={isNarrowViewport}
          />

          <div ref={contentRef} className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#0b1220]">
            <section className="min-h-0 flex-1 overflow-hidden">{children}</section>

            {!bottomPanelCollapsed && (
              <button
                type="button"
                aria-label="Resize workspace panel"
                className="relative h-1.5 shrink-0 cursor-row-resize bg-[#101827] transition-colors hover:bg-[#1d4ed8]"
                onDoubleClick={resetBottomPanelHeight}
                onPointerDown={startBottomPanelResize}
              >
                <span className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-[#334155]" />
              </button>
            )}

            <div
              className="shrink-0 overflow-hidden border-t border-[#263247] bg-[#08101d]"
              style={{ height: bottomPanelCollapsed ? 44 : bottomPanelHeight }}
            >
              <WorkspacePanel
                collapsed={bottomPanelCollapsed}
                onToggleCollapsed={() => setBottomPanelCollapsed((current) => !current)}
              />
            </div>
          </div>
        </div>

        {!bottomPanelCollapsed && (
          <div className="pointer-events-none absolute bottom-4 right-4 hidden rounded-full border border-[#1e293b] bg-[#020617]/72 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-[#64748b] xl:block">
            Drag splitters. Double-click to reset.
          </div>
        )}
      </div>
    </WorkspaceLayoutContext.Provider>
  );
}
