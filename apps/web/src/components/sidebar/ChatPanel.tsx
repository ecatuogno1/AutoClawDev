import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useProjects } from "@/lib/api";
import {
  CHAT_HISTORY_EVENT,
  getStoredChatProvider,
  readRecentChats,
  setStoredChatProvider,
  type ChatProvider,
} from "@/lib/chatHistory";

function formatRelativeTime(timestamp: string) {
  const deltaMs = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.max(1, Math.floor(deltaMs / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ChatPanel() {
  const { data: projects } = useProjects();
  const [provider, setProvider] = useState<ChatProvider>(() => getStoredChatProvider());
  const [recentChats, setRecentChats] = useState(() => readRecentChats());

  useEffect(() => {
    const sync = () => {
      setProvider(getStoredChatProvider());
      setRecentChats(readRecentChats());
    };

    window.addEventListener(CHAT_HISTORY_EVENT, sync as EventListener);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHAT_HISTORY_EVENT, sync as EventListener);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const projectNames = useMemo(() => {
    return Object.fromEntries((projects ?? []).map((project) => [project.key, project.name]));
  }, [projects]);

  return (
    <div className="flex h-full flex-col p-4">
      <div className="rounded-xl border border-[#30363d] bg-[#0d1117] p-3">
        <div className="text-xs font-medium uppercase tracking-[0.18em] text-[#6e7681]">
          Default Provider
        </div>
        <div className="mt-3 flex gap-2">
          {(["claude", "codex"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                setProvider(option);
                setStoredChatProvider(option);
              }}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                provider === option
                  ? option === "claude"
                    ? "border-[#bc8cff55] bg-[#bc8cff18] text-[#d2a8ff]"
                    : "border-[#3fb95055] bg-[#3fb95018] text-[#3fb950]"
                  : "border-[#30363d] bg-[#161b22] text-[#8b949e] hover:text-[#e6edf3]"
              }`}
            >
              {option === "claude" ? "Claude" : "Codex"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex-1 overflow-y-auto">
        <div className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-[#6e7681]">
          Recent Chat History
        </div>
        <div className="space-y-2">
          {recentChats.length > 0 ? (
            recentChats.map((entry) => (
              <Link
                key={entry.id}
                to="/chat"
                className="block rounded-xl border border-[#30363d] bg-[#0d1117] p-3 transition-colors hover:border-[#484f58] hover:bg-[#131a22]"
              >
                <div className="flex items-center justify-between gap-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] ${
                      entry.provider === "claude"
                        ? "bg-[#bc8cff18] text-[#d2a8ff]"
                        : "bg-[#3fb95018] text-[#3fb950]"
                    }`}
                  >
                    {entry.provider}
                  </span>
                  <span className="text-[11px] text-[#6e7681]">
                    {formatRelativeTime(entry.timestamp)}
                  </span>
                </div>
                <div className="mt-2 line-clamp-2 text-sm text-[#e6edf3]">
                  {entry.prompt}
                </div>
                <div className="mt-2 text-xs text-[#8b949e]">
                  {entry.projectKey ? projectNames[entry.projectKey] ?? entry.projectKey : "Home directory"}
                </div>
              </Link>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-[#30363d] bg-[#0d1117] p-4 text-sm text-[#8b949e]">
              No recent prompts yet. Send a message from the chat route to populate this list.
            </div>
          )}
        </div>
      </div>

      <Link
        to="/chat"
        className="mt-4 rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-2 text-center text-sm text-[#8b949e] transition-colors hover:text-[#e6edf3]"
      >
        Open chat
      </Link>
    </div>
  );
}
