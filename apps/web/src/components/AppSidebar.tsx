import type { ComponentType } from "react";
import { Sidebar } from "@/components/ui/sidebar";
import {
  ACTIVITY_PANEL_ITEMS,
  type ActivityPanelId,
} from "@/components/activityPanels";
import { ChatPanel } from "@/components/sidebar/ChatPanel";
import { CommandCenterPanel } from "@/components/sidebar/CommandCenterPanel";
import { ExperimentsPanel } from "@/components/sidebar/ExperimentsPanel";
import { LivePanel } from "@/components/sidebar/LivePanel";
import { ProjectsPanel } from "@/components/sidebar/ProjectsPanel";

const PANEL_COMPONENTS: Record<ActivityPanelId, ComponentType> = {
  "command-center": CommandCenterPanel,
  chat: ChatPanel,
  projects: ProjectsPanel,
  experiments: ExperimentsPanel,
  live: LivePanel,
};

export function AppSidebar({ panelId }: { panelId: ActivityPanelId | null }) {
  const activePanel = panelId ?? "command-center";
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
          <PanelComponent />
        </div>
      </div>
    </Sidebar>
  );
}
