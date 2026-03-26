import { Link, useRouterState } from "@tanstack/react-router";
import { useActiveRuns } from "@/lib/api";

const navItems = [
  { to: "/", label: "Command Center", icon: "grid" },
  { to: "/chat", label: "Chat", icon: "chat" },
  { to: "/workspace", label: "Workspace", icon: "code" },
  { to: "/projects", label: "Projects", icon: "folder" },
  { to: "/experiments", label: "Experiments", icon: "flask" },
  { to: "/live", label: "Live", icon: "terminal" },
  { to: "/settings", label: "Settings", icon: "gear" },
] as const;

const icons: Record<string, string> = {
  grid: "M3 3h7v7H3V3zm11 0h7v7h-7V3zM3 14h7v7H3v-7zm11 0h7v7h-7v-7z",
  chat: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z",
  folder: "M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z",
  flask: "M9 3v8.5L4.5 19a2 2 0 001.7 3h11.6a2 2 0 001.7-3L15 11.5V3M8 3h8",
  terminal: "M4 17l6-5-6-5M12 19h8",
  code: "M8 9l-4 3 4 3m8-6l4 3-4 3m-2-9l-4 12",
  gear: "M12 15a3 3 0 100-6 3 3 0 000 6z",
};

export function Layout({ children }: { children: React.ReactNode }) {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const { data: activeRuns } = useActiveRuns();
  const isWorkspaceRoute = currentPath.startsWith("/workspace");

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 bg-[#010409] border-r border-[#30363d] flex flex-col shrink-0">
        <div className="px-5 py-5 border-b border-[#30363d]">
          <h1 className="text-lg font-bold text-[#e6edf3] tracking-tight flex items-center gap-2">
            <span className="text-2xl">&#129438;</span>
            <span>AutoClawDev</span>
          </h1>
          <p className="text-xs text-[#6e7681] mt-1">Autonomous Dev Pipeline</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ to, label, icon }) => {
            const isActive = to === "/" ? currentPath === "/" : currentPath.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-[#161b22] text-[#e6edf3]"
                    : "text-[#8b949e] hover:bg-[#161b22] hover:text-[#e6edf3]"
                }`}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d={icons[icon]} />
                </svg>
                {label}
                {icon === "terminal" && activeRuns && Object.keys(activeRuns).length > 0 && (
                  <span className="ml-auto w-2 h-2 rounded-full bg-[#3fb950] animate-pulse" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="px-5 py-4 border-t border-[#30363d]">
          <div className="text-xs text-[#6e7681]">
            {activeRuns && Object.keys(activeRuns).length > 0 ? (
              <span className="text-[#3fb950]">
                {Object.keys(activeRuns).length} active run{Object.keys(activeRuns).length > 1 ? "s" : ""}
              </span>
            ) : (
              <span>No active runs</span>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className={`flex-1 bg-[#0d1117] ${isWorkspaceRoute ? "overflow-hidden" : "overflow-auto"}`}>
        {children}
      </main>
    </div>
  );
}
