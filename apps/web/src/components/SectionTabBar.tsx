import { useCallback, useEffect, useRef } from "react";
import {
  BrainCircuitIcon,
  FlaskConicalIcon,
  HouseIcon,
  LayoutGridIcon,
  PanelsTopLeftIcon,
  SearchCodeIcon,
  SettingsIcon,
  SquareTerminalIcon,
} from "lucide-react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/cn";
import {
  deriveLayoutNavState,
  type GlobalSectionId,
  type ProjectSectionId,
} from "@/components/layoutNavigation";

const sectionTabClassName =
  "inline-flex h-9 shrink-0 items-center gap-2 border-b-2 px-3 text-sm transition-[border-color,color,background-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#58a6ff]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d1117]";

const PROJECT_SECTIONS: Array<{
  icon: typeof HouseIcon;
  id: ProjectSectionId;
  label: string;
}> = [
  { id: "home", label: "Home", icon: HouseIcon },
  { id: "reviews", label: "Code Review", icon: SearchCodeIcon },
  { id: "memory", label: "Knowledge Base", icon: BrainCircuitIcon },
  { id: "workspace", label: "Workspace", icon: PanelsTopLeftIcon },
];

const GLOBAL_SECTIONS: Array<{
  icon: typeof LayoutGridIcon;
  id: GlobalSectionId;
  label: string;
}> = [
  { id: "command-center", label: "Command Center", icon: LayoutGridIcon },
  { id: "experiments", label: "Experiments", icon: FlaskConicalIcon },
  { id: "live", label: "Live", icon: SquareTerminalIcon },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

export function SectionTabBar() {
  const navigate = useNavigate();
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;
  const navState = deriveLayoutNavState(pathname);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const projectKey = navState.activeProjectKey;
  const tabs = navState.isProjectRoute ? PROJECT_SECTIONS : GLOBAL_SECTIONS;

  const navigateToTab = useCallback((tabId: GlobalSectionId | ProjectSectionId) => {
    if (navState.isProjectRoute && projectKey) {
      switch (tabId) {
        case "reviews":
          return navigate({
            to: "/projects/$projectKey/reviews",
            params: { projectKey },
          });
        case "memory":
          return navigate({
            to: "/projects/$projectKey/memory",
            params: { projectKey },
          });
        case "workspace":
          return navigate({
            to: "/projects/$projectKey/workspace",
            params: { projectKey },
          });
        case "home":
        default:
          return navigate({ to: "/projects/$projectKey", params: { projectKey } });
      }
    }

    switch (tabId) {
      case "experiments":
        return navigate({ to: "/experiments" });
      case "live":
        return navigate({ to: "/live" });
      case "settings":
        return navigate({ to: "/settings" });
      case "command-center":
      default:
        return navigate({ to: "/" });
    }
  }, [navState.isProjectRoute, navigate, projectKey]);

  useEffect(() => {
    const activeTab = scrollContainerRef.current?.querySelector<HTMLElement>(
      '[data-section-active="true"]',
    );
    activeTab?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [
    navState.activeGlobalSection,
    navState.activeProjectSection,
    navState.isProjectRoute,
  ]);

  return (
    <div className="flex min-h-10 items-center border-b border-[#30363d]/80 bg-[linear-gradient(180deg,rgba(13,17,23,0.98)_0%,rgba(13,17,23,0.95)_100%)] px-3 shadow-[inset_0_-1px_0_rgba(48,54,61,0.35)]">
      <div
        ref={scrollContainerRef}
        className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = navState.isProjectRoute
            ? navState.activeProjectSection === tab.id
            : navState.activeGlobalSection === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              aria-current={isActive ? "page" : undefined}
              data-section-active={isActive ? "true" : "false"}
              title={tab.label}
              className={cn(
                sectionTabClassName,
                isActive
                  ? "border-[#58a6ff] bg-[#0f1620] text-[#f0f6fc]"
                  : "border-transparent text-[#8b949e] hover:bg-[#11161d] hover:text-[#e6edf3]",
              )}
              onClick={() => {
                void navigateToTab(tab.id);
              }}
            >
              <Icon className="size-4" />
              <span className="whitespace-nowrap">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
