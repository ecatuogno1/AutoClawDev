import type { ComponentType } from "react";
import { Sidebar } from "@/components/ui/sidebar";
import {
  getActivityPanelItems,
  getDefaultActivityPanelId,
  type ActivityPanelId,
} from "@/components/activityPanels";
import { CommandCenterPanel } from "@/components/sidebar/CommandCenterPanel";
import { ExperimentsPanel } from "@/components/sidebar/ExperimentsPanel";
import { LivePanel } from "@/components/sidebar/LivePanel";
import { ProjectFilesPanel } from "@/components/sidebar/ProjectFilesPanel";
import { ProjectGitPanel } from "@/components/sidebar/ProjectGitPanel";
import { ProjectSearchPanel } from "@/components/sidebar/ProjectSearchPanel";
import { ProjectTerminalPanel } from "@/components/sidebar/ProjectTerminalPanel";
import { ProjectsPanel } from "@/components/sidebar/ProjectsPanel";

interface SidebarPanelProps {
  projectKey: string | null;
}

const PANEL_COMPONENTS: Record<ActivityPanelId, ComponentType<SidebarPanelProps>> = {
  "command-center": CommandCenterPanel,
  projects: ProjectsPanel,
  experiments: ExperimentsPanel,
  live: LivePanel,
  files: ProjectFilesPanel,
  search: ProjectSearchPanel,
  git: ProjectGitPanel,
  terminal: ProjectTerminalPanel,
};

export function AppSidebar({
  panelId,
  projectKey,
}: {
  panelId: ActivityPanelId | null;
  projectKey: string | null;
}) {
  const items = getActivityPanelItems(projectKey);
  const activePanel =
    panelId && items.some((item) => item.id === panelId)
      ? panelId
      : getDefaultActivityPanelId(projectKey);
  const metadata =
    items.find((item) => item.id === activePanel) ?? items[0];
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
          <PanelComponent projectKey={projectKey} />
        </div>
      </div>
    </Sidebar>
  );
}
