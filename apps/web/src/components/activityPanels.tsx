import type { LucideIcon } from "lucide-react";
import {
  FlaskConicalIcon,
  FolderIcon,
  LayoutGridIcon,
  MessageSquareTextIcon,
  SettingsIcon,
  SquareTerminalIcon,
} from "lucide-react";

export type ActivityPanelId =
  | "command-center"
  | "chat"
  | "projects"
  | "experiments"
  | "live";

export interface ActivityPanelItem {
  id: ActivityPanelId;
  icon: LucideIcon;
  label: string;
  description: string;
  to: string;
}

export const ACTIVITY_PANEL_ITEMS: ActivityPanelItem[] = [
  {
    id: "command-center",
    icon: LayoutGridIcon,
    label: "Command Center",
    description: "Cross-project health and activity.",
    to: "/",
  },
  {
    id: "chat",
    icon: MessageSquareTextIcon,
    label: "Chat",
    description: "Provider defaults and recent chat prompts.",
    to: "/chat",
  },
  {
    id: "projects",
    icon: FolderIcon,
    label: "Projects",
    description: "Registered projects and current stats.",
    to: "/projects",
  },
  {
    id: "experiments",
    icon: FlaskConicalIcon,
    label: "Experiments",
    description: "Recent outcomes across projects.",
    to: "/experiments",
  },
  {
    id: "live",
    icon: SquareTerminalIcon,
    label: "Live",
    description: "Active runs and pipeline activity.",
    to: "/live",
  },
];

export const SETTINGS_ITEM = {
  icon: SettingsIcon,
  label: "Settings",
  to: "/settings",
};

export function getActivityPanelFromPath(pathname: string): ActivityPanelId | null {
  if (pathname === "/") return "command-center";
  if (pathname === "/chat" || pathname.startsWith("/chat/")) return "chat";
  if (pathname === "/projects" || pathname.startsWith("/projects/")) return "projects";
  if (pathname === "/experiments" || pathname.startsWith("/experiments/")) {
    return "experiments";
  }
  if (pathname === "/live" || pathname.startsWith("/live/")) return "live";
  return null;
}

export function isSettingsPath(pathname: string) {
  return pathname === "/settings" || pathname.startsWith("/settings/");
}

export function isPathWithinPanel(pathname: string, panelId: ActivityPanelId) {
  return getActivityPanelFromPath(pathname) === panelId;
}
