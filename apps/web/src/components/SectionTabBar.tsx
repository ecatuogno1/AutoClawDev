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
  "inline-flex h-9 shrink-0 items-center gap-2 border-b-2 px-3 text-sm transition-colors duration-150";

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

  const projectKey = navState.activeProjectKey;
  const tabs = navState.isProjectRoute ? PROJECT_SECTIONS : GLOBAL_SECTIONS;

  return (
    <div className="flex min-h-9 items-center border-b border-[#30363d]/80 bg-[#0d1117]/95 px-3">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
              className={cn(
                sectionTabClassName,
                isActive
                  ? "border-[#58a6ff] text-[#e6edf3]"
                  : "border-transparent text-[#8b949e] hover:text-[#e6edf3]",
              )}
              onClick={() => {
                if (navState.isProjectRoute && projectKey) {
                  switch (tab.id) {
                    case "reviews":
                      void navigate({
                        to: "/projects/$projectKey/reviews",
                        params: { projectKey },
                      });
                      return;
                    case "memory":
                      void navigate({
                        to: "/projects/$projectKey/memory",
                        params: { projectKey },
                      });
                      return;
                    case "workspace":
                      void navigate({
                        to: "/projects/$projectKey/workspace",
                        params: { projectKey },
                      });
                      return;
                    case "home":
                    default:
                      void navigate({ to: "/projects/$projectKey", params: { projectKey } });
                      return;
                  }
                }

                switch (tab.id) {
                  case "experiments":
                    void navigate({ to: "/experiments" });
                    return;
                  case "live":
                    void navigate({ to: "/live" });
                    return;
                  case "settings":
                    void navigate({ to: "/settings" });
                    return;
                  case "command-center":
                  default:
                    void navigate({ to: "/" });
                    return;
                }
              }}
            >
              <Icon className="size-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
