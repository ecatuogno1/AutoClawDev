export type ProjectSectionId = "home" | "reviews" | "memory" | "workspace";
export type GlobalSectionId =
  | "command-center"
  | "experiments"
  | "live"
  | "settings";

export interface LayoutNavState {
  activeGlobalSection: GlobalSectionId | null;
  activeProjectKey: string | null;
  activeProjectSection: ProjectSectionId | null;
  isProjectRoute: boolean;
}

const PROJECT_ROUTE_PATTERN = /^\/projects\/([^/]+)(?:\/(.*))?$/;
const PROJECT_SECTION_STORAGE_KEY = "autoclaw:project-last-section";

export function deriveLayoutNavState(pathname: string): LayoutNavState {
  const projectMatch = pathname.match(PROJECT_ROUTE_PATTERN);

  if (projectMatch) {
    return {
      activeGlobalSection: null,
      activeProjectKey: decodeURIComponent(projectMatch[1] ?? ""),
      activeProjectSection: getProjectSectionFromRest(projectMatch[2]),
      isProjectRoute: true,
    };
  }

  return {
    activeGlobalSection: getGlobalSectionFromPath(pathname),
    activeProjectKey: null,
    activeProjectSection: null,
    isProjectRoute: false,
  };
}

function getProjectSectionFromRest(rest?: string): ProjectSectionId | null {
  if (!rest || rest.length === 0) return "home";
  if (rest === "reviews" || rest.startsWith("reviews/")) return "reviews";
  if (rest === "memory" || rest.startsWith("memory/")) return "memory";
  if (rest === "workspace" || rest.startsWith("workspace/")) return "workspace";
  return null;
}

function getGlobalSectionFromPath(pathname: string): GlobalSectionId | null {
  if (pathname === "/") return "command-center";
  if (pathname === "/experiments" || pathname.startsWith("/experiments/")) {
    return "experiments";
  }
  if (pathname === "/live" || pathname.startsWith("/live/")) return "live";
  if (pathname === "/settings" || pathname.startsWith("/settings/")) {
    return "settings";
  }
  return null;
}

export function readStoredProjectSection(projectKey: string): ProjectSectionId {
  if (typeof window === "undefined") return "home";

  try {
    const raw = window.localStorage.getItem(PROJECT_SECTION_STORAGE_KEY);
    if (!raw) return "home";

    const parsed = JSON.parse(raw) as Record<string, ProjectSectionId>;
    const section = parsed[projectKey];
    if (
      section === "home" ||
      section === "reviews" ||
      section === "memory" ||
      section === "workspace"
    ) {
      return section;
    }
  } catch {
    return "home";
  }

  return "home";
}

export function storeProjectSection(
  projectKey: string,
  section: ProjectSectionId,
) {
  if (typeof window === "undefined") return;

  try {
    const raw = window.localStorage.getItem(PROJECT_SECTION_STORAGE_KEY);
    const current = raw ? (JSON.parse(raw) as Record<string, ProjectSectionId>) : {};
    current[projectKey] = section;
    window.localStorage.setItem(PROJECT_SECTION_STORAGE_KEY, JSON.stringify(current));
  } catch {
    return;
  }
}
