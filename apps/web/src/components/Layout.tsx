import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import ActivityBar from "@/components/ActivityBar";
import { AppSidebar } from "@/components/AppSidebar";
import {
  getActivityPanelFromPath,
  isSettingsPath,
  type ActivityPanelId,
} from "@/components/activityPanels";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useActiveRuns } from "@/lib/api";

export function Layout({ children }: { children: React.ReactNode }) {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const routePanel = getActivityPanelFromPath(currentPath);
  const settingsActive = isSettingsPath(currentPath);
  const { data: activeRuns } = useActiveRuns();
  const activeRunCount = activeRuns ? Object.keys(activeRuns).length : 0;
  const [activePanel, setActivePanel] = useState<ActivityPanelId | null>(
    routePanel ?? "command-center",
  );
  const previousRoutePanelRef = useRef<ActivityPanelId | null>(routePanel);

  useEffect(() => {
    if (!routePanel) return;
    if (previousRoutePanelRef.current !== routePanel) {
      setActivePanel(routePanel);
      previousRoutePanelRef.current = routePanel;
    }
  }, [routePanel]);

  const effectivePanel = settingsActive ? null : activePanel;

  return (
    <SidebarProvider
      open={effectivePanel !== null}
      onOpenChange={(open) => {
        if (!open) setActivePanel(null);
      }}
      className="pl-12"
      style={
        {
          "--sidebar-width": "16rem",
        } as CSSProperties
      }
    >
      <ActivityBar
        activePanel={effectivePanel}
        onSelectPanel={(panelId) => {
          setActivePanel((current) => {
            if (settingsActive) return panelId;
            return current === panelId ? null : panelId;
          });
        }}
        activeRunCount={activeRunCount}
        badges={activeRunCount > 0 ? { live: activeRunCount } : undefined}
        isSettingsActive={settingsActive}
      />
      <AppSidebar panelId={effectivePanel} />
      <main className="min-w-0 flex-1 overflow-auto bg-[#0d1117]">{children}</main>
    </SidebarProvider>
  );
}
