import { useCallback, useEffect, useRef } from "react";
import {
  FlaskConicalIcon,
  LayoutGridIcon,
  SettingsIcon,
  SquareTerminalIcon,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/cn";
import {
  deriveLayoutNavState,
  type GlobalSectionId,
} from "@/components/layoutNavigation";

const sectionTabClassName =
  "inline-flex h-9 shrink-0 items-center gap-2 border-b-2 px-3 text-sm transition-[border-color,color,background-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#58a6ff]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d1117]";

const GLOBAL_SECTIONS: Array<{
  icon: typeof LayoutGridIcon;
  id: GlobalSectionId;
  label: string;
}> = [
  { id: "command-center", label: "Command Center", icon: LayoutGridIcon },
  { id: "experiments", label: "History", icon: FlaskConicalIcon },
  { id: "live", label: "Live", icon: SquareTerminalIcon },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

export function SectionTabBar({
  currentPath,
}: {
  currentPath: string;
}) {
  const navigate = useNavigate();
  const navState = deriveLayoutNavState(currentPath);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const navigateToTab = useCallback((tabId: GlobalSectionId) => {
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
  }, [navigate]);

  useEffect(() => {
    const activeTab = scrollContainerRef.current?.querySelector<HTMLElement>(
      '[data-section-active="true"]',
    );
    activeTab?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [navState.activeGlobalSection]);

  return (
    <div className="flex min-h-10 items-center border-b border-[#30363d]/80 bg-[linear-gradient(180deg,rgba(13,17,23,0.98)_0%,rgba(13,17,23,0.95)_100%)] px-3 shadow-[inset_0_-1px_0_rgba(48,54,61,0.35)]">
      <div
        ref={scrollContainerRef}
        className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {GLOBAL_SECTIONS.map((tab) => {
          const Icon = tab.icon;
          const isActive = navState.activeGlobalSection === tab.id;

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
