import { Bot, ChevronRight, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { ProjectWithStats } from "@/types";

type ProviderMode = "claude" | "codex";

interface WorkspaceTopBarProps {
  project: ProjectWithStats | null;
  provider: ProviderMode;
  onProviderChange: (provider: ProviderMode) => void;
  onToggleSidebar: () => void;
  isSidebarCollapsed: boolean;
  isNarrowViewport: boolean;
}

export function WorkspaceTopBar({
  project,
  provider,
  onProviderChange,
  onToggleSidebar,
  isSidebarCollapsed,
  isNarrowViewport,
}: WorkspaceTopBarProps) {
  return (
    <header className="border-b border-[#263247] bg-[linear-gradient(180deg,#0f172a_0%,#0b1220_100%)] px-4 py-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#243041] bg-[#111827] text-[#cbd5e1] transition hover:border-[#3b82f6] hover:text-white"
            aria-label={isSidebarCollapsed ? "Open workspace sidebar" : "Collapse workspace sidebar"}
          >
            {isSidebarCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-[0.22em] text-[#64748b]">
              <span>Workspace</span>
              <ChevronRight className="h-3.5 w-3.5" />
              <span>{project?.name ?? "No project selected"}</span>
              <ChevronRight className="h-3.5 w-3.5" />
              <span className="text-[#94a3b8]">{project ? "(no file open)" : "register a project"}</span>
            </div>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="truncate text-lg font-semibold text-[#f8fafc]">
                {project?.name ?? "Workspace Shell"}
              </h1>
              {project?.path && (
                <p className="truncate text-sm text-[#64748b]">
                  {project.path}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isNarrowViewport && (
            <span className="rounded-full border border-[#334155] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#94a3b8]">
              compact
            </span>
          )}

          <div className="inline-flex items-center gap-1 rounded-xl border border-[#243041] bg-[#111827] p-1">
            {([
              { id: "claude", label: "Claude" },
              { id: "codex", label: "Codex" },
            ] as const).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => onProviderChange(option.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  provider === option.id
                    ? option.id === "codex"
                      ? "bg-[#14532d] text-[#dcfce7]"
                      : "bg-[#312e81] text-[#e0e7ff]"
                    : "text-[#94a3b8] hover:text-white"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="inline-flex items-center gap-2 rounded-xl border border-[#243041] bg-[#111827] px-3 py-2 text-xs text-[#94a3b8]">
            <Bot className="h-3.5 w-3.5" />
            <span>{provider === "codex" ? "GPT-5.4 Codex" : "Claude Opus"}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
