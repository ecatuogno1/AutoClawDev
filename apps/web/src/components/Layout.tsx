import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import ActivityBar from "@/components/ActivityBar";
import { AppSidebar } from "@/components/AppSidebar";
import { FloatingChat } from "@/components/FloatingChat";
import {
  getDefaultActivityPanelId,
  isActivityPanelAvailable,
  type ActivityPanelId,
} from "@/components/activityPanels";
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
  const projectKey = currentPath.match(/^\/projects\/([^/]+)/)?.[1] ?? null;
  const activeProjectKey = projectKey ? decodeURIComponent(projectKey) : null;
  const navState = deriveLayoutNavState(currentPath);
  const settingsActive = navState.activeGlobalSection === "settings";
  const { data: activeRuns } = useActiveRuns();
  const activeRunCount = activeProjectKey
    ? activeRuns?.[activeProjectKey]
      ? 1
      : 0
    : activeRuns
      ? Object.keys(activeRuns).length
      : 0;
  const [activePanel, setActivePanel] = useState<ActivityPanelId | null>(() =>
    getDefaultActivityPanelId(activeProjectKey),
  );

  useEffect(() => {
    if (navState.activeProjectKey && navState.activeProjectSection) {
      storeProjectSection(navState.activeProjectKey, navState.activeProjectSection);
    }
  }, [navState.activeProjectKey, navState.activeProjectSection]);

  useEffect(() => {
    setActivePanel((current) => {
      if (isActivityPanelAvailable(activeProjectKey, current)) {
        return current;
      }
      return getDefaultActivityPanelId(activeProjectKey);
    });
  }, [activeProjectKey]);

  const effectivePanel = settingsActive ? null : activePanel;

  return (
    <div className="h-screen overflow-hidden bg-[#0d1117] text-[#e6edf3]">
      <ActivityBar
        activePanel={effectivePanel}
        onSelectPanel={(panelId) => {
          setActivePanel((current) => (current === panelId ? null : panelId));
        }}
        activeRunCount={activeRunCount}
        isSettingsActive={settingsActive}
        projectKey={activeProjectKey}
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
          projectKey={activeProjectKey}
        />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <ProjectTabBar projectKey={activeProjectKey} />
          <SectionTabBar currentPath={currentPath} projectKey={activeProjectKey} />
          <main className="min-h-0 flex-1 overflow-auto bg-[#0d1117] [scrollbar-gutter:stable]">
            {children}
          </main>
        </div>
      </SidebarProvider>
      <FloatingChat activeProjectKey={activeProjectKey} />
    </div>
  );
}
