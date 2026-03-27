import type { LucideIcon } from "lucide-react";
import {
  FlaskConicalIcon,
  FolderTreeIcon,
  GitBranchIcon,
  LayoutGridIcon,
  PanelsTopLeftIcon,
  SearchIcon,
  SettingsIcon,
  SquareTerminalIcon,
} from "lucide-react";

export type ActivityPanelId =
  | "command-center"
  | "projects"
  | "experiments"
  | "live"
  | "files"
  | "search"
  | "git"
  | "terminal";

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
    label: "Experiments",
    description: "Recent experiments across every project.",
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
  {
    id: "search",
    icon: SearchIcon,
    label: "Search",
    description: "Jump into the active project's review and knowledge views.",
    to: "/projects",
  },
  {
    id: "git",
    icon: GitBranchIcon,
    label: "Source Control",
    description: "Git status and changed files for the active project.",
    to: "/projects",
  },
  {
    id: "terminal",
    icon: SquareTerminalIcon,
    label: "Terminal",
    description: "Terminal session rooted in the active project.",
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
