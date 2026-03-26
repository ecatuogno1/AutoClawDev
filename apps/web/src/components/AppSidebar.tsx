import type { ComponentType } from "react";
import { Link } from "@tanstack/react-router";
import { Sidebar } from "@/components/ui/sidebar";
import {
  ACTIVITY_PANEL_ITEMS,
  type ActivityPanelId,
} from "@/components/activityPanels";
import { LivePanel } from "@/components/sidebar/LivePanel";
import { ProjectsPanel } from "@/components/sidebar/ProjectsPanel";

interface SidebarPanelProps {
  activeProjectKey: string | null;
}

const PANEL_COMPONENTS: Record<ActivityPanelId, ComponentType<SidebarPanelProps>> = {
  files: FilesPanel,
  search: SearchPanel,
  git: SourceControlPanel,
  terminal: TerminalPanel,
};

export function AppSidebar({
  panelId,
  activeProjectKey,
}: {
  panelId: ActivityPanelId | null;
  activeProjectKey: string | null;
}) {
  const activePanel = panelId ?? "files";
  const metadata =
    ACTIVITY_PANEL_ITEMS.find((item) => item.id === activePanel) ?? ACTIVITY_PANEL_ITEMS[0];
  const PanelComponent = PANEL_COMPONENTS[activePanel];

  return (
    <Sidebar
      side="left"
      collapsible="offcanvas"
      className="border-r border-[#30363d]/65 bg-[#161b22]/92 text-[#e6edf3] backdrop-blur-sm"
    >
      <div className="flex h-full flex-col">
        <div className="border-b border-[#30363d]/70 px-4 py-4">
          <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#6e7681]">
            Workspace
          </div>
          <h2 className="mt-2 text-sm font-semibold text-[#e6edf3]">{metadata.label}</h2>
          <p className="mt-1 text-xs text-[#8b949e]">{metadata.description}</p>
        </div>
        <div className="min-h-0 flex-1">
          <PanelComponent activeProjectKey={activeProjectKey} />
        </div>
      </div>
    </Sidebar>
  );
}

function FilesPanel() {
  return <ProjectsPanel />;
}

function SearchPanel({ activeProjectKey }: SidebarPanelProps) {
  return (
    <div className="flex h-full flex-col p-4">
      <div className="rounded-xl border border-[#30363d] bg-[#0d1117] p-3">
        <div className="text-xs font-medium uppercase tracking-[0.18em] text-[#6e7681]">
          Query Surfaces
        </div>
        <p className="mt-2 text-sm text-[#8b949e]">
          Phase 1 keeps search lightweight. Use the shortcuts below to jump into the
          highest-signal views.
        </p>
      </div>

      <div className="mt-4 space-y-2">
        {activeProjectKey ? (
          <>
            <Link
              to="/projects/$projectKey/reviews"
              params={{ projectKey: activeProjectKey }}
              className="block rounded-xl border border-[#30363d] bg-[#0d1117] p-3 text-sm text-[#e6edf3] transition-colors hover:border-[#484f58] hover:bg-[#131a22]"
            >
              Review findings for the active project
            </Link>
            <Link
              to="/projects/$projectKey/memory"
              params={{ projectKey: activeProjectKey }}
              className="block rounded-xl border border-[#30363d] bg-[#0d1117] p-3 text-sm text-[#e6edf3] transition-colors hover:border-[#484f58] hover:bg-[#131a22]"
            >
              Open the active project knowledge base
            </Link>
          </>
        ) : null}

        <Link
          to="/experiments"
          className="block rounded-xl border border-[#30363d] bg-[#0d1117] p-3 text-sm text-[#e6edf3] transition-colors hover:border-[#484f58] hover:bg-[#131a22]"
        >
          Browse experiments across every project
        </Link>
      </div>
    </div>
  );
}

function SourceControlPanel({ activeProjectKey }: SidebarPanelProps) {
  return (
    <div className="flex h-full flex-col p-4">
      <div className="rounded-xl border border-[#30363d] bg-[#0d1117] p-3">
        <div className="text-xs font-medium uppercase tracking-[0.18em] text-[#6e7681]">
          Source Control
        </div>
        <p className="mt-2 text-sm text-[#8b949e]">
          Source control tools stay inside each project workspace. Use the shortcuts to
          jump directly into the current project context.
        </p>
      </div>

      <div className="mt-4 space-y-2">
        {activeProjectKey ? (
          <>
            <Link
              to="/projects/$projectKey/workspace"
              params={{ projectKey: activeProjectKey }}
              className="block rounded-xl border border-[#30363d] bg-[#0d1117] p-3 text-sm text-[#e6edf3] transition-colors hover:border-[#484f58] hover:bg-[#131a22]"
            >
              Open workspace tools for the active project
            </Link>
            <Link
              to="/projects/$projectKey/reviews"
              params={{ projectKey: activeProjectKey }}
              className="block rounded-xl border border-[#30363d] bg-[#0d1117] p-3 text-sm text-[#e6edf3] transition-colors hover:border-[#484f58] hover:bg-[#131a22]"
            >
              Check the latest review output before staging changes
            </Link>
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-[#30363d] bg-[#0d1117] p-4 text-sm text-[#8b949e]">
            Pick a project tab to open workspace-specific git tools.
          </div>
        )}
      </div>
    </div>
  );
}

function TerminalPanel() {
  return <LivePanel />;
}
