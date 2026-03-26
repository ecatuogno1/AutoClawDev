import type { LucideIcon } from "lucide-react";
import {
  FolderTreeIcon,
  GitBranchIcon,
  SearchIcon,
  SettingsIcon,
  SquareTerminalIcon,
} from "lucide-react";

export type ActivityPanelId = "files" | "search" | "git" | "terminal";

export interface ActivityPanelItem {
  id: ActivityPanelId;
  icon: LucideIcon;
  label: string;
  description: string;
  to: string;
}

export const ACTIVITY_PANEL_ITEMS: ActivityPanelItem[] = [
  {
    id: "files",
    icon: FolderTreeIcon,
    label: "Files",
    description: "Browse registered projects and jump into a workspace.",
    to: "/projects",
  },
  {
    id: "search",
    icon: SearchIcon,
    label: "Search",
    description: "Jump into reviews, memory, and experiment history.",
    to: "/experiments",
  },
  {
    id: "git",
    icon: GitBranchIcon,
    label: "Source Control",
    description: "Workspace and code review shortcuts for the active project.",
    to: "/projects",
  },
  {
    id: "terminal",
    icon: SquareTerminalIcon,
    label: "Terminal",
    description: "Active runs and console activity.",
    to: "/live",
  },
];

export const SETTINGS_ITEM = {
  icon: SettingsIcon,
  label: "Settings",
  to: "/settings",
};
