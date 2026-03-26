import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import {
  ACTIVITY_PANEL_ITEMS,
  SETTINGS_ITEM,
  type ActivityPanelId,
} from "@/components/activityPanels";

interface ActivityBarProps {
  activePanel: ActivityPanelId | null;
  onSelectPanel: (panelId: ActivityPanelId) => void;
  activeRunCount?: number;
  isSettingsActive?: boolean;
}

export default function ActivityBar(props: ActivityBarProps) {
  const navigate = useNavigate();

  return (
    <div className="fixed inset-y-0 left-0 z-50 flex w-12 flex-col items-center justify-between border-r border-[#30363d]/80 bg-[linear-gradient(180deg,rgba(1,4,9,0.98)_0%,rgba(13,17,23,0.98)_100%)] backdrop-blur-sm">
      <div className="flex flex-col items-center gap-0.5 pt-2">
        {ACTIVITY_PANEL_ITEMS.map((item) => {
          const isActive = props.activePanel === item.id;
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              type="button"
              aria-label={item.label}
              aria-pressed={isActive}
              title={item.label}
              className={cn(
                "relative flex size-10 items-center justify-center rounded-lg transition-[background-color,color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#58a6ff]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#010409]",
                isActive
                  ? "bg-[#11161d] text-[#e6edf3] before:absolute before:inset-y-1 before:left-0 before:w-[2px] before:rounded-r before:bg-[#58a6ff]"
                  : "text-[#6e7681] hover:bg-[#161b22] hover:text-[#8b949e]",
              )}
              onClick={() => props.onSelectPanel(item.id)}
            >
              <Icon className="size-5" />
              {item.id === "terminal" ? renderLiveStatus(props.activeRunCount ?? 0) : null}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col items-center gap-0.5 pb-2">
        <button
          type="button"
          aria-label={SETTINGS_ITEM.label}
          title={SETTINGS_ITEM.label}
          className={cn(
            "relative flex size-10 items-center justify-center rounded-lg transition-[background-color,color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#58a6ff]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#010409]",
            props.isSettingsActive
              ? "bg-[#11161d] text-[#e6edf3] before:absolute before:inset-y-1 before:left-0 before:w-[2px] before:rounded-r before:bg-[#58a6ff]"
              : "text-[#6e7681] hover:bg-[#161b22] hover:text-[#8b949e]",
          )}
          onClick={() => {
            void navigate({ to: SETTINGS_ITEM.to });
          }}
        >
          <SETTINGS_ITEM.icon className="size-5" />
        </button>
      </div>
    </div>
  );
}

function renderLiveStatus(activeRunCount: number): ReactNode {
  if (activeRunCount > 0) {
    return (
      <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-[#3fb950] px-1 text-[9px] font-bold leading-4 text-[#0d1117]">
        {activeRunCount > 9 ? "9+" : activeRunCount}
      </span>
    );
  }

  return <span className="absolute right-2 top-2 size-1.5 rounded-full bg-[#484f58]" />;
}
