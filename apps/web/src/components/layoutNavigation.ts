export type GlobalSectionId =
  | "command-center"
  | "experiments"
  | "live"
  | "settings";

export function deriveLayoutNavState(pathname: string) {
  return {
    activeGlobalSection: getGlobalSectionFromPath(pathname),
  };
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
