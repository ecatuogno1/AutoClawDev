import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import ActivityBar from "@/components/ActivityBar";
import { AppSidebar } from "@/components/AppSidebar";
import { FloatingChat } from "@/components/FloatingChat";
import { type ActivityPanelId } from "@/components/activityPanels";
import {
  deriveLayoutNavState,
  storeProjectSection,
} from "@/components/layoutNavigation";
import { ProjectTabBar } from "@/components/ProjectTabBar";
import { SectionTabBar } from "@/components/SectionTabBar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useActiveRuns } from "@/lib/api";

export function Layout({ children }: { children: React.ReactNode }) {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const navState = deriveLayoutNavState(currentPath);
  const settingsActive = navState.activeGlobalSection === "settings";
  const { data: activeRuns } = useActiveRuns();
  const activeRunCount = activeRuns ? Object.keys(activeRuns).length : 0;
  const [activePanel, setActivePanel] = useState<ActivityPanelId | null>("files");

  useEffect(() => {
    if (navState.activeProjectKey && navState.activeProjectSection) {
      storeProjectSection(navState.activeProjectKey, navState.activeProjectSection);
    }
  }, [navState.activeProjectKey, navState.activeProjectSection]);

  const effectivePanel = settingsActive ? null : activePanel;

  return (
    <div className="min-h-screen bg-[#0d1117] text-[#e6edf3]">
      <ActivityBar
        activePanel={effectivePanel}
        onSelectPanel={(panelId) => {
          setActivePanel((current) => (current === panelId ? null : panelId));
        }}
        activeRunCount={activeRunCount}
        isSettingsActive={settingsActive}
      />
      <SidebarProvider
        open={effectivePanel !== null}
        onOpenChange={(open) => {
          if (!open) setActivePanel(null);
        }}
        className="pl-12"
        style={
          {
            "--sidebar-width": "18rem",
          } as CSSProperties
        }
      >
        <AppSidebar
          panelId={effectivePanel}
          activeProjectKey={navState.activeProjectKey}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <ProjectTabBar />
          <SectionTabBar />
          <main className="min-h-0 flex-1 overflow-auto bg-[#0d1117]">{children}</main>
        </div>
      </SidebarProvider>
      <FloatingChat activeProjectKey={navState.activeProjectKey} />
    </div>
  );
}
