import type { LucideIcon } from "lucide-react";
import {
  FlaskConicalIcon,
  FolderTreeIcon,
  LayoutGridIcon,
  PanelsTopLeftIcon,
  SettingsIcon,
  SquareTerminalIcon,
} from "lucide-react";

export type ActivityPanelId =
  | "command-center"
  | "projects"
  | "experiments"
  | "live"
  | "files";

export interface ActivityPanelItem {
  id: ActivityPanelId;
  icon: LucideIcon;
  label: string;
  description: string;
  to: string;
}

const GLOBAL_ACTIVITY_PANEL_ITEMS: ActivityPanelItem[] = [
  {
    id: "command-center",
    icon: LayoutGridIcon,
    label: "Command Center",
    description: "Cross-project health, activity, and fleet status.",
    to: "/",
  },
  {
    id: "projects",
    icon: PanelsTopLeftIcon,
    label: "Projects",
    description: "Browse registered projects and switch workspaces.",
    to: "/projects",
  },
  {
    id: "experiments",
    icon: FlaskConicalIcon,
    label: "History",
    description: "Recent run history across every project.",
    to: "/experiments",
  },
  {
    id: "live",
    icon: SquareTerminalIcon,
    label: "Live",
    description: "Active runs and the live console.",
    to: "/live",
  },
];

const PROJECT_ACTIVITY_PANEL_ITEMS: ActivityPanelItem[] = [
  {
    id: "files",
    icon: FolderTreeIcon,
    label: "Files",
    description: "Browse the active project's file tree.",
    to: "/projects",
  },
];

export function getActivityPanelItems(projectKey: string | null): ActivityPanelItem[] {
  return projectKey ? PROJECT_ACTIVITY_PANEL_ITEMS : GLOBAL_ACTIVITY_PANEL_ITEMS;
}

export function getDefaultActivityPanelId(projectKey: string | null): ActivityPanelId {
  return projectKey ? "files" : "command-center";
}

export function isActivityPanelAvailable(
  projectKey: string | null,
  panelId: ActivityPanelId | null,
) {
  if (!panelId) {
    return false;
  }

  return getActivityPanelItems(projectKey).some((item) => item.id === panelId);
}

export const SETTINGS_ITEM = {
  icon: SettingsIcon,
  label: "Settings",
  to: "/settings",
};
